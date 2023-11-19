// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { debug } from '@actions/core';
import { GitHub } from '@actions/github/lib/utils';
import { fetch, Response } from 'undici';
import { CdnFile } from '../CdnFile';
import { CdnPackage } from '../CdnPackage';
import { Repository } from '../Repository';

export abstract class CdnClient {
  constructor(
    private accessToken: string,
    private isGitHubEnterprise: boolean
  ) {}

  abstract getLatestVersion(name: string): Promise<CdnPackage | null>;

  abstract getFiles(name: string, version: string): Promise<CdnFile[]>;

  protected async httpGet(url: string): Promise<Response> {
    return await fetch(url, {
      headers: new Headers([
        ['User-Agent', 'martincostello/update-static-assets'],
      ]),
    });
  }

  protected async getReleaseNotesUrl(
    repository: Repository,
    version: string
  ): Promise<string> {
    if (
      !repository ||
      repository.type !== 'git' ||
      !repository.url ||
      !(
        repository.url.startsWith('git://github.com/') ||
        repository.url.startsWith('git+https://github.com/') ||
        repository.url.startsWith('https://github.com/')
      )
    ) {
      return '';
    }

    const suffix = '.git';
    let repoUrl = repository.url;
    if (repository.url.endsWith(suffix)) {
      repoUrl = repoUrl.slice(0, -suffix.length);
    }

    const segments = repoUrl.split('/');
    if (segments.length !== 5) {
      return '';
    }

    const owner = segments[3];
    const repo = segments[4];
    const tags = [version];

    if (version.startsWith('v')) {
      tags.push(version.slice(1));
    } else {
      tags.push(`v${version}`);
    }

    for (const tag of tags) {
      const url = await this.getReleaseUrlByTag(owner, repo, tag);
      if (url) {
        return url;
      }
    }

    return '';
  }

  private async getReleaseUrlByTag(
    owner: string,
    repo: string,
    tag: string
  ): Promise<string | null> {
    const octokit = new GitHub({
      auth: this.isGitHubEnterprise ? undefined : this.accessToken,
      baseUrl: 'https://api.github.com',
    });

    try {
      const { data: release } = await octokit.rest.repos.getReleaseByTag({
        owner,
        repo,
        tag,
      });

      return release.html_url;
    } catch (error: any) {
      if (error['status'] !== 404) {
        debug(
          `Failed to get GitHub release for repository ${owner}/${repo} for tag ${tag}.`
        );
        debug(error);
        if (error instanceof Error) {
          if (error.stack) {
            debug(error.stack);
          }
        }
      }
      return null;
    }
  }
}
