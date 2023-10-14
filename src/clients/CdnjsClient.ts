// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { CdnClient } from './CdnClient';
import { CdnFile } from '../CdnFile';

export class CdnjsClient extends CdnClient {
  async getLatestVersion(name: string): Promise<string | null> {
    // See https://cdnjs.com/api#library
    const encodedName = encodeURIComponent(name);
    const response = await this.httpGet(
      `https://api.cdnjs.com/libraries/${encodedName}?fields=name,version`
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
    return library?.version ?? null;
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
    const library = result as Library;

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
}

interface Library {
  name: string;
  version: string;
  files: string[];
  sri: Record<string, string>;
}
