// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { CdnClient } from './CdnClient';
import { CdnFile } from '../CdnFile';

export class CdnjsClient extends CdnClient {
  async getLatestVersion(name: string): Promise<string | null> {
    // See https://cdnjs.com/api#library
    const encodedName = encodeURIComponent(name);
    const response = await this.httpClient.getJson<any>(
      `https://api.cdnjs.com/libraries/${encodedName}?fields=name,version`
    );

    if (response.statusCode === 404) {
      return null;
    } else if (response.statusCode >= 400) {
      throw new Error(
        `Failed to get latest version of ${name} from cdnjs - HTTP status ${response.statusCode}`
      );
    }

    return response.result.version;
  }

  async getFiles(name: string, version: string): Promise<CdnFile[]> {
    // See https://cdnjs.com/api#version
    const encodedName = encodeURIComponent(name);
    const encodedVersion = encodeURIComponent(version);
    const response = await this.httpClient.getJson<any>(
      `https://api.cdnjs.com/libraries/${encodedName}/${encodedVersion}`
    );

    const files: CdnFile[] = [];

    if (response.statusCode === 404) {
      return files;
    } else if (response.statusCode >= 400) {
      throw new Error(
        `Failed to get files for version ${version} of ${name} from cdnjs - HTTP status ${response.statusCode}`
      );
    }

    for (const file of response.result.files) {
      const integrity = response.result.sri[file];
      files.push({
        url: `https://cdnjs.cloudflare.com/ajax/libs/${encodedName}/${encodedVersion}/${file}`,
        fileName: file,
        integrity,
      });
    }

    return files;
  }
}
