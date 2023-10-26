// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { getOctokit } from '@actions/github';
import { CdnClient } from './CdnClient';
import { CdnFile } from '../CdnFile';
import { CdnPackage } from '../CdnPackage';

export class CdnjsClient extends CdnClient {
  constructor(private accessToken: string) {
    super();
  }

  async getLatestVersion(name: string): Promise<CdnPackage | null> {
    // See https://cdnjs.com/api#library
    const encodedName = encodeURIComponent(name);
    const response = await this.httpGet(
      `https://api.cdnjs.com/libraries/${encodedName}?fields=name,version,repository`
    );

    if (response.status === 404) {
      return null;
    } else if (response.status >= 400) {
      throw new Error(
        `Failed to get latest version of ${name} from cdnjs - HTTP status ${response.status}`
      );
    }

    const result: any = await response.json();
    const library = result as Library;
    const version = library?.version ?? null;

    if (!version) {
      return null;
    }

    const releaseNotesUrl = await this.getReleaseNotesUrl(library);

    return {
      name,
      releaseNotesUrl,
      version,
    };
  }

  async getFiles(name: string, version: string): Promise<CdnFile[]> {
    // See https://cdnjs.com/api#version
    const encodedName = encodeURIComponent(name);
    const encodedVersion = encodeURIComponent(version);
    const response = await this.httpGet(
      `https://api.cdnjs.com/libraries/${encodedName}/${encodedVersion}`
    );

    const files: CdnFile[] = [];

    if (response.status === 404) {
      return files;
    } else if (response.status >= 400) {
      throw new Error(
        `Failed to get files for version ${version} of ${name} from cdnjs - HTTP status ${response.status}`
      );
    }

    const result: any = await response.json();
    const library = result as LibraryVersion;

    if (library?.files) {
      for (const file of library.files) {
        const integrity = library.sri[file];
        files.push({
          url: `https://cdnjs.cloudflare.com/ajax/libs/${encodedName}/${encodedVersion}/${file}`,
          fileName: file,
          integrity,
        });
      }
    }

    return files;
  }

  private async getReleaseNotesUrl(library: Library): Promise<string> {
    if (
      !library.repository ||
      library.repository.type !== 'git' ||
      !library.repository.url ||
      !(
        library.repository.url.startsWith('git://github.com/') ||
        library.repository.url.startsWith('https://github.com/')
      )
    ) {
      return '';
    }

    const suffix = '.git';
    let repoUrl = library.repository.url;
    if (library.repository.url.endsWith(suffix)) {
      repoUrl = repoUrl.slice(0, -suffix.length);
    }

    const segments = repoUrl.split('/');
    if (segments.length !== 5) {
      return '';
    }

    const owner = segments[3];
    const repo = segments[4];
    const tags = [library.version];

    if (library.version.startsWith('v')) {
      tags.push(library.version.slice(1));
    } else {
      tags.push(`v${library.version}`);
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
    const octokit = getOctokit(this.accessToken, {
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
        throw error;
      }
      return null;
    }
  }
}

interface LibraryBase {
  name: string;
  version: string;
}

interface Repository {
  type: string;
  url: string;
}

interface Library extends LibraryBase {
  repository: Repository | null;
}

interface LibraryVersion extends LibraryBase {
  files: string[];
  sri: Record<string, string>;
}
