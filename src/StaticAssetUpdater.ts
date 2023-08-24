// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as fs from 'fs';

import { glob } from 'glob';
import { JSDOM, HTMLScriptElement, HTMLStyleElement } from 'jsdom';
import { Writable } from 'stream';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as github from '@actions/github';

import { AssetUpdate } from './AssetUpdate';
import { CdnProvider } from './CdnProvider';
import { CdnFile } from './CdnFile';
import { UpdateOptions } from './UpdateOptions';
import { UpdateResult } from './UpdateResult';
import { CdnClient } from './clients/CdnClient';
import { CdnjsClient } from './clients/CdnjsClient';
import { JSDelivrClient } from './clients/JSDelivrClient';

export class StaticAssetUpdater {
  private static readonly cdnMap: Record<string, CdnProvider> = {
    'https://cdnjs.cloudflare.com': CdnProvider.cdnjs,
    'https://cdn.jsdelivr.net': CdnProvider.jsdelivr,
  };
  private readonly options: UpdateOptions;

  constructor(options: UpdateOptions) {
    this.options = options;
  }

  public static generateCommitMessage(
    assetName: string,
    currentAssetVersion: string,
    latestAssetVersion: string
  ): string {
    const currentVersion = currentAssetVersion.split('.');
    const latestVersion = latestAssetVersion.split('.');

    const updateKind =
      parseInt(latestVersion[0], 10) > parseInt(currentVersion[0], 10)
        ? 'major'
        : parseInt(latestVersion[1], 10) > parseInt(currentVersion[1], 10)
        ? 'minor'
        : 'patch';

    const messageLines = [
      `Update ${assetName}`,
      '',
      `Updates ${assetName} to version ${latestAssetVersion}.`,
      '',
      '---',
      'updated-dependencies:',
      `- dependency-name: ${assetName}`,
      '  dependency-type: direct:production',
      `  update-type: version-update:semver-${updateKind}`,
      '...',
      '',
      '',
    ];
    return messageLines.join('\n');
  }

  public async tryUpdateAssets(): Promise<UpdateResult> {
    const fileAssets = await this.findAssets();

    const { assetUpdates, latestVersions } =
      await this.findAssetsToUpdate(fileAssets);

    const result: UpdateResult = {
      updates: [],
    };

    // If we found any assets that need updating, loop through each unique asset and update any
    // versions that are not the latest version and create a pull request for asset that is.
    if (assetUpdates.length > 0) {
      // Get the base branch to use when creating the pull request
      const baseBranch = await this.getCurrentBranch();
      let updatesAttempted = 0;

      for (const asset of assetUpdates) {
        if (updatesAttempted > 0) {
          // Reset to base branch before next loop
          await this.execGit(['checkout', baseBranch], true);
        }

        const update = await this.updateAsset(
          asset,
          baseBranch,
          latestVersions,
          fileAssets
        );

        if (update) {
          result.updates.push(update);
        }

        updatesAttempted++;
      }
    }

    return result;
  }

  private static getClient(provider: CdnProvider): CdnClient | null {
    switch (provider) {
      case CdnProvider.cdnjs:
        return new CdnjsClient();
      case CdnProvider.jsdelivr:
        return new JSDelivrClient();
      default:
        return null;
    }
  }

  private static getKey(asset: Asset): string {
    return `${asset.cdn}-${asset.name}`;
  }

  private async findFiles(): Promise<string[]> {
    const patterns = this.options.fileExtensions.map(
      (extension) => `**/*.${extension}`
    );
    return await glob(patterns, {
      absolute: true,
      cwd: this.options.repoPath,
      nodir: true,
      realpath: true,
    });
  }

  async findAssets(): Promise<Record<string, AssetVersionItem[]>> {
    const fileAssetMap: Record<string, AssetVersionItem[]> = {};
    const paths = await this.findFiles();

    core.debug(`Found ${paths.length} files to search for assets.`);
    for (const file of paths) {
      core.debug(`  - ${file}`);
    }

    for (const fileName of paths) {
      const assets = await this.findAssetsInFile(fileName);
      if (assets.length > 0) {
        fileAssetMap[fileName] = assets;
      }
    }

    core.debug(
      `Found ${
        Object.keys(fileAssetMap).length
      } files with assets that may need updating.`
    );
    for (const file in fileAssetMap) {
      core.debug(`  - '${file}':`);
      for (const asset of fileAssetMap[file]) {
        core.debug(`  - ${asset.name}@${asset.version} from ${asset.cdn}`);
      }
    }

    return fileAssetMap;
  }

  private async findAssetsInFile(
    fileName: string
  ): Promise<AssetVersionItem[]> {
    const assets: AssetVersionItem[] = [];

    try {
      const html = await fs.promises.readFile(fileName, { encoding: 'utf8' });
      const dom = new JSDOM(html);
      const scripts = this.findScripts(dom);
      const styles = this.findStyles(dom);

      for (const script of scripts) {
        const asset = this.tryGetScriptAsset(script);
        if (asset) {
          assets.push(asset);
        }
      }

      for (const style of styles) {
        const asset = this.tryGetStyleAsset(style);
        if (asset) {
          assets.push(asset);
        }
      }
    } catch (error) {
      core.debug(`Failed to find assets in '${fileName}': ${error}`);
    }

    return assets;
  }

  private async findAssetsToUpdate(
    fileAssetMap: Record<string, AssetVersionItem[]>
  ): Promise<{
    assetUpdates: Asset[];
    latestVersions: Record<string, string>;
  }> {
    // Find the unique assets present in the files.
    const assets: Asset[] = [];

    for (const fileName in fileAssetMap) {
      const fileAssets = fileAssetMap[fileName];
      for (const asset of fileAssets) {
        if (!assets.some((a) => a.cdn === asset.cdn && a.name === asset.name)) {
          assets.push({
            cdn: asset.cdn,
            name: asset.name,
          });
        }
      }
    }

    core.debug(`Found ${assets.length} unique assets that may need updating.`);
    for (const asset of assets) {
      core.debug(`  - ${asset.name} from ${asset.cdn}`);
    }

    // Find the versions of each asset.
    const assetVersions: Record<string, AssetVersion[]> = {};

    for (const fileName in fileAssetMap) {
      const fileAssets = fileAssetMap[fileName];
      for (const asset of fileAssets) {
        const key = StaticAssetUpdater.getKey(asset);
        let versions = assetVersions[key];
        if (!versions) {
          versions = [];
        }
        if (!versions.some((a) => a.version === asset.version)) {
          versions.push({
            cdn: asset.cdn,
            name: asset.name,
            version: asset.version,
          });
        }
        assetVersions[key] = versions;
      }
    }

    core.debug(
      `Found ${
        Object.keys(assetVersions).length
      } assets with versions that may need updating.`
    );
    for (const asset in assetVersions) {
      for (const version of assetVersions[asset]) {
        core.debug(
          `  - ${version.name}@${version.version} from ${version.cdn}`
        );
      }
    }

    // Find the latest version of each asset.
    const latestVersions: Record<string, string> = {};
    for (const asset of assets) {
      const client = StaticAssetUpdater.getClient(asset.cdn);
      if (client) {
        const version = await client.getLatestVersion(asset.name);
        if (version && !this.ignoreAsset(asset, version)) {
          const key = StaticAssetUpdater.getKey(asset);
          latestVersions[key] = version;
        }
      }
    }

    core.debug(
      `Found ${Object.keys(latestVersions).length} latest versions for assets.`
    );
    for (const asset in latestVersions) {
      core.debug(`  - ${asset}@${latestVersions[asset]}`);
    }

    // Are there any assets using a version that isn't the latest one?
    const assetUpdates: Asset[] = [];
    for (const asset of assets) {
      const key = StaticAssetUpdater.getKey(asset);
      const latestVersion = latestVersions[key];
      const versions = assetVersions[key];
      if (versions) {
        for (const version of versions) {
          if (version.version !== latestVersion) {
            if (
              !assetUpdates.some(
                (a) => a.cdn === asset.cdn && a.name === asset.name
              )
            ) {
              assetUpdates.push({
                cdn: asset.cdn,
                name: asset.name,
              });
            }
          }
        }
      }
    }

    core.info(`Found ${assetUpdates.length} assets to update.`);
    core.debug(`Found ${assetUpdates.length} that need updating.`);
    for (const asset of assetUpdates) {
      core.debug(`  - ${asset.name}`);
    }

    return {
      assetUpdates,
      latestVersions,
    };
  }

  private ignoreAsset(asset: Asset, version: string): boolean {
    const ignores = this.options.ignore.filter(
      (i) => i.cdn === asset.cdn && i.name === asset.name
    );

    for (const ignore of ignores) {
      const expression = new RegExp(ignore.version);
      if (expression.test(version)) {
        return true;
      }
    }

    return false;
  }

  private findScripts(dom: JSDOM): HTMLScriptElement[] {
    const elements: HTMLScriptElement[] = [];
    for (const element of dom.window.document.querySelectorAll('script')) {
      const script = element as HTMLScriptElement;
      if (script) {
        elements.push(script);
      }
    }
    return elements;
  }

  private findStyles(dom: JSDOM): HTMLStyleElement[] {
    const elements: HTMLStyleElement[] = [];
    for (const element of dom.window.document.querySelectorAll(
      'link[rel="stylesheet"]'
    )) {
      const link = element as HTMLStyleElement;
      if (link) {
        elements.push(link);
      }
    }
    return elements;
  }

  private tryGetScriptAsset(
    script: HTMLScriptElement
  ): AssetVersionItem | null {
    if (!script.src) {
      return null;
    }

    let integrity: string | null = null;
    const attribute = script.attributes['integrity'];

    if (attribute) {
      if (attribute.value) {
        integrity = attribute.value;
      }
    }

    return this.tryGetAsset(script.src, integrity);
  }

  private tryGetStyleAsset(style: HTMLStyleElement): AssetVersionItem | null {
    if (!style.href) {
      return null;
    }

    let integrity: string | null = null;
    const attribute = style.attributes['integrity'];

    if (attribute) {
      if (attribute.value) {
        integrity = attribute.value;
      }
    }

    return this.tryGetAsset(style.href, integrity);
  }

  private tryGetAsset(
    url: string,
    integrity: string | null
  ): AssetVersionItem | null {
    let provider: CdnProvider | null = null;

    for (const prefix in StaticAssetUpdater.cdnMap) {
      if (url.startsWith(prefix)) {
        provider = StaticAssetUpdater.cdnMap[prefix];
        break;
      }
    }

    if (!provider) {
      return null;
    }

    return this.extractAsset(provider, url, integrity);
  }

  private extractAsset(
    provider: CdnProvider,
    url: string,
    integrity: string | null
  ): AssetVersionItem | null {
    const uri = new URL(url);
    const uriPath = uri.pathname.slice(1);
    let segments = uriPath.split('/');
    let fileName = '';

    switch (provider) {
      case CdnProvider.cdnjs:
        if (segments.length >= 4) {
          fileName = segments.slice(4).join('/');
          return {
            cdn: provider,
            name: segments[2],
            version: segments[3],
            url,
            integrity,
            fileName,
          };
        }
        return null;

      case CdnProvider.jsdelivr:
        if (segments.length >= 2) {
          fileName = `/${segments.slice(2).join('/')}`;
          segments = segments[1].split('@');
          if (segments.length === 2) {
            return {
              cdn: provider,
              name: segments[0],
              version: segments[1],
              url,
              integrity,
              fileName,
            };
          }
        }
        return null;

      default:
        return null;
    }
  }

  private async updateAsset(
    asset: Asset,
    baseBranch: string,
    latestVersions: Record<string, string>,
    fileAssets: Record<string, AssetVersionItem[]>
  ): Promise<AssetUpdate | null> {
    const client = StaticAssetUpdater.getClient(asset.cdn);

    if (!client) {
      return null;
    }

    const key = StaticAssetUpdater.getKey(asset);
    const version = latestVersions[key];

    if (!version) {
      return null;
    }

    const latestFiles = await client.getFiles(asset.name, version);

    core.debug(
      `Found ${latestFiles.length} files for ${asset.name}@${version} from ${asset.cdn}.`
    );

    if (latestFiles.length < 1) {
      return null;
    }

    const updatedAsset = {
      cdn: asset.cdn,
      name: asset.name,
      version,
    };

    const headBranch = await this.applyAssetUpdate(
      baseBranch,
      fileAssets,
      updatedAsset,
      latestFiles
    );

    if (!headBranch) {
      return null;
    }

    const pullRequest = await this.createPullRequest(
      baseBranch,
      headBranch,
      updatedAsset
    );

    core.debug(
      `Created pull request for update to ${updatedAsset.name}@${updatedAsset.version}.`
    );
    core.debug(`  - ${pullRequest.number}`);
    core.debug(`  - ${pullRequest.url}`);

    return {
      cdn: asset.cdn,
      name: asset.name,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.url,
      supersedes: pullRequest.supersedes,
      version,
    };
  }

  private async createPullRequest(
    base: string,
    head: string,
    asset: AssetVersion
  ): Promise<PullRequest> {
    const title = `Update ${asset.name} to ${asset.version}`;

    let body = `Updates ${asset.name} to version \`${asset.version}\`.`;

    body += `\n\nThis pull request was auto-generated by [GitHub Actions](${this.options.serverUrl}/${this.options.runRepo}/actions/runs/${this.options.runId}).`;

    const octokit = github.getOctokit(this.options.accessToken, {
      baseUrl: this.options.apiUrl,
    });

    const [owner, repo] = this.options.repo.split('/');
    const request = {
      owner,
      repo,
      title,
      head,
      base,
      body,
      maintainer_can_modify: true,
      draft: false,
    };

    if (this.options.dryRun) {
      core.info(
        `Skipped creating GitHub pull request for branch ${head} to ${base}`
      );
      return {
        number: 0,
        supersedes: [],
        url: '',
      };
    }

    const response = await octokit.rest.pulls.create(request);

    core.debug(JSON.stringify(response, null, 2));

    const created = response.data;

    core.info(`Created pull request #${created.number}: ${created.title}`);
    core.info(`View the pull request at ${created.html_url}`);

    if (this.options.labels) {
      const labelsToApply = this.options.labels.split(',');

      if (labelsToApply.length > 0) {
        try {
          await octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: created.number,
            labels: labelsToApply,
          });
        } catch (error: any) {
          core.error(
            `Failed to apply label(s) to pull request #${created.number}`
          );
          core.error(error);
        }
      }
    }

    let supersedes: number[] = [];

    if (this.options.closeSuperseded) {
      let pulls = await octokit.paginate(octokit.rest.pulls.list, {
        owner,
        repo,
        base,
        direction: 'desc',
        state: 'open',
      });

      const titlePrefix = `Update ${asset.name} to `;

      pulls = pulls
        .filter((pull) => pull.user?.login === created.user?.login)
        .filter((pull) => pull.title.startsWith(titlePrefix));

      if (pulls.length > 1) {
        const superseded = pulls.filter(
          (pull) => pull.number !== created.number
        );
        superseded.reverse();

        const comment = `Superseded by #${created.number}.`;

        for (const pull of superseded) {
          core.debug(`Closing pull request ${pull.number}.`);

          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pull.number,
            body: comment,
          });
          await octokit.rest.pulls.update({
            owner,
            repo,
            pull_number: pull.number,
            state: 'closed',
          });
          await octokit.rest.git.deleteRef({
            owner,
            repo,
            ref: `heads/${pull.head.ref}`,
          });
        }

        supersedes = superseded.map((p) => p.number);
      }
    }

    return {
      number: created.number,
      supersedes,
      url: created.html_url,
    };
  }

  private async execGit(
    args: string[],
    ignoreErrors: Boolean = false
  ): Promise<string> {
    let commandOutput = '';
    let commandError = '';

    const options = {
      cwd: this.options.repoPath,
      errStream: new NullWritable(),
      outStream: new NullWritable(),
      ignoreReturnCode: ignoreErrors as boolean | undefined,
      silent: ignoreErrors as boolean | undefined,
      listeners: {
        stdout: (data: Buffer) => {
          commandOutput += data.toString();
        },
        stderr: (data: Buffer) => {
          commandError += data.toString();
        },
      },
    };

    try {
      await exec.exec('git', args, options);
    } catch (error: any) {
      throw new Error(`The command 'git ${args.join(' ')}' failed: ${error}`);
    }

    if (commandError && !ignoreErrors) {
      throw new Error(commandError);
    }

    core.debug(`git std-out: ${commandOutput}`);

    if (commandError) {
      core.debug(`git std-err: ${commandError}`);
    }

    return commandOutput.trimEnd();
  }

  private async getCurrentBranch(): Promise<string> {
    return await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  }

  private async applyAssetUpdate(
    base: string,
    fileAssetMap: Record<string, AssetVersionItem[]>,
    assetUpdate: AssetVersion,
    cdnFiles: CdnFile[]
  ): Promise<string | null> {
    core.info(`Updating ${assetUpdate.name} to ${assetUpdate.version}...`);

    let filesUpdated = 0;
    let lowestVersion = '0.0.0';

    // Apply the updates to the file system
    for (const file in fileAssetMap) {
      let content = await fs.promises.readFile(file, 'utf8');
      let dirty = false;

      const assetsToUpdate = fileAssetMap[file].filter(
        (a) =>
          a.cdn === assetUpdate.cdn &&
          a.name === assetUpdate.name &&
          a.version !== assetUpdate.version
      );

      for (const assetToUpdate of assetsToUpdate) {
        const latestAsset = cdnFiles.find(
          (a) => a.fileName === assetToUpdate.fileName
        );
        if (latestAsset && content.includes(assetToUpdate.url)) {
          content = content.replace(assetToUpdate.url, latestAsset.url);
          if (assetToUpdate.integrity) {
            content = content.replace(
              assetToUpdate.integrity,
              latestAsset.integrity ?? ''
            );
          }
          dirty = true;
          if (lowestVersion < assetToUpdate.version) {
            lowestVersion = assetToUpdate.version;
          }
        }
      }

      if (dirty) {
        await fs.promises.writeFile(file, content, { encoding: 'utf8' });
        filesUpdated++;
      }
    }

    if (filesUpdated < 1) {
      return null;
    }

    core.info(`Updated ${assetUpdate.name} version to ${assetUpdate.version}.`);

    // Configure Git
    let branchPrefix = this.options.branchPrefix;

    if (!branchPrefix) {
      branchPrefix = 'update-static-assets';
    }

    const branch =
      `${branchPrefix}/${assetUpdate.name}/${assetUpdate.version}`.toLowerCase();

    let commitMessage = this.options.commitMessage;

    if (!commitMessage) {
      commitMessage = StaticAssetUpdater.generateCommitMessage(
        assetUpdate.name,
        lowestVersion,
        assetUpdate.version
      );
    }

    if (this.options.userName) {
      await this.execGit(['config', 'user.name', this.options.userName]);
      core.info(`Updated git user name to '${this.options.userName}'`);
    }

    if (this.options.userEmail) {
      await this.execGit(['config', 'user.email', this.options.userEmail]);
      core.info(`Updated git user email to '${this.options.userEmail}'`);
    }

    if (this.options.repo) {
      await this.execGit([
        'remote',
        'set-url',
        'origin',
        `${this.options.serverUrl}/${this.options.repo}.git`,
      ]);
      await this.execGit(['fetch', 'origin'], true);
    }

    core.debug(`Branch: ${branch}`);
    core.debug(`Commit message: ${commitMessage}`);
    core.debug(`User name: ${this.options.userName}`);
    core.debug(`User email: ${this.options.userEmail}`);

    const branchExists = await this.execGit(
      ['rev-parse', '--verify', '--quiet', `remotes/origin/${branch}`],
      true
    );

    if (branchExists) {
      core.info(`The ${branch} branch already exists`);
      return null;
    }

    await this.execGit(['checkout', '-b', branch], true);
    core.info(`Created git branch ${branch}`);

    // Stage all the file system changes
    await this.execGit(['add', '.']);
    core.info(`Staged git commit for '${assetUpdate.name}' update`);

    await this.execGit(['commit', '-m', commitMessage]);

    const sha1 = await this.execGit(['log', "--format='%H'", '-n', '1']);
    const shortSha1 = sha1.replace(/'/g, '').substring(0, 7);

    core.info(`Committed ${assetUpdate.name} update to git (${shortSha1})`);

    if (!this.options.dryRun && this.options.repo) {
      await this.execGit(['push', '-u', 'origin', branch], true);
      core.info(`Pushed changes to repository (${this.options.repo})`);
    }

    return branch;
  }
}

interface Asset {
  cdn: CdnProvider;
  name: string;
}

interface AssetVersion extends Asset {
  version: string;
}

interface AssetVersionItem extends AssetVersion {
  url: string;
  integrity: string | null;
  fileName: string;
}

interface PullRequest {
  number: number;
  supersedes: number[];
  url: string;
}

class NullWritable extends Writable {
  _write(
    _chunk: any,
    _encoding: string,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
  _writev(
    _chunks: { chunk: any; encoding: string }[],
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }
}
