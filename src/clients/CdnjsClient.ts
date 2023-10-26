// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { CdnClient } from './CdnClient';
import { CdnFile } from '../CdnFile';
import { CdnPackage } from '../CdnPackage';
import { Repository } from '../Repository';

export class CdnjsClient extends CdnClient {
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

    const releaseNotesUrl = await this.getReleaseNotes(library);

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

  private async getReleaseNotes(library: Library): Promise<string> {
    if (!library || !library.repository) {
      return '';
    }
    return await this.getReleaseNotesUrl(library.repository, library.version);
  }
}

interface LibraryBase {
  name: string;
  version: string;
}

interface Library extends LibraryBase {
  repository: Repository | null;
}

interface LibraryVersion extends LibraryBase {
  files: string[];
  sri: Record<string, string>;
}
