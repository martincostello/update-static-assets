// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { CdnClient } from './CdnClient';
import { CdnFile } from '../CdnFile';

export class JSDelivrClient extends CdnClient {
  // See https://github.com/jsdelivr/data.jsdelivr.com#list-package-versions
  async getLatestVersion(name: string): Promise<string | null> {
    const encodedName = encodeURIComponent(name);
    const response = await this.httpClient.getJson<any>(
      `https://data.jsdelivr.com/v1/package/npm/${encodedName}`
    );

    if (response.statusCode === 404) {
      return null;
    } else if (response.statusCode >= 400) {
      throw new Error(
        `Failed to get latest version of ${name} from jsDelivr - HTTP status ${response.statusCode}`
      );
    }

    return response.result.tags.latest;
  }

  async getFiles(name: string, version: string): Promise<CdnFile[]> {
    // See https://github.com/jsdelivr/data.jsdelivr.com#list-package-files
    const encodedName = encodeURIComponent(name);
    const encodedVersion = encodeURIComponent(version);
    const response = await this.httpClient.getJson<any>(
      `https://data.jsdelivr.com/v1/package/npm/${encodedName}@${encodedVersion}/flat`
    );

    const files: CdnFile[] = [];

    if (response.statusCode === 404) {
      return files;
    } else if (response.statusCode >= 400) {
      throw new Error(
        `Failed to get files for version ${version} of ${name} from jsDelivr - HTTP status ${response.statusCode}`
      );
    }

    for (const file of response.result.files) {
      files.push({
        url: `https://cdn.jsdelivr.net/npm/${encodedName}@${encodedVersion}${file.name}`,
        fileName: file.name,
        integrity: `sha256-${file.hash}`,
      });
    }

    return files;
  }
}
