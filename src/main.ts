// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';

import { Context } from '@actions/github/lib/context';
import { StaticAssetUpdater } from './StaticAssetUpdater';
import { UpdateOptions } from './UpdateOptions';

export async function run(): Promise<void> {
  try {
    let repoPath = core.getInput('repo-path', { required: false }) ?? '.';
    repoPath = path.normalize(repoPath);

    const context = new Context();

    const options: UpdateOptions = {
      accessToken: core.getInput('repo-token', { required: true }),
      apiUrl: context.apiUrl,
      branchPrefix: core.getInput('branch-name-prefix', { required: false }),
      commitMessage: core.getInput('commit-message', { required: false }),
      dryRun: core.getInput('dry-run', { required: false }) === 'true',
      fileExtensions: [],
      ignore: [],
      labels: core.getInput('labels', { required: false }) ?? '',
      repo:
        core.getInput('repo', { required: false }) ??
        process.env.GITHUB_REPOSITORY,
      repoPath,
      runId: context.runId.toString(10),
      runRepo: process.env.GITHUB_REPOSITORY,
      serverUrl: context.serverUrl,
      userEmail: core.getInput('user-email', { required: false }),
      userName: core.getInput('user-name', { required: false }),
    };

    const extensions =
      core.getInput('file-extensions', { required: false }) ??
      'cshtml,html,razor';

    options.fileExtensions = extensions.split(',');

    let configFile = core.getInput('configuration-file', { required: false });

    if (!configFile) {
      configFile = path.join(options.repoPath, '.update-static-assets.json');
    }

    if (configFile) {
      configFile = path.normalize(configFile);
    }

    if (fs.existsSync(configFile)) {
      const config = JSON.parse(await fs.promises.readFile(configFile, 'utf8'));

      if (config.ignore) {
        options.ignore = config.ignore;
      }
    }

    const updater = new StaticAssetUpdater(options);
    const result = await updater.tryUpdateAssets();

    core.setOutput('assets-updated', result.updates.length > 0);
    core.setOutput(
      'pulls-closed',
      JSON.stringify(result.updates.map((p) => p.superceded).flat())
    );
    core.setOutput(
      'pulls-opened',
      JSON.stringify(result.updates.map((p) => p.pullRequestNumber))
    );
  } catch (error: any) {
    core.error('Failed to check for updates to static assets.');
    core.error(error);
    if (error instanceof Error) {
      if (error.stack) {
        core.error(error.stack);
      }
      core.setFailed(error.message);
    }
  }
}

if (require.main === module) {
  run();
}
