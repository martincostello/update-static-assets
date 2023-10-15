// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { CdnClient } from './CdnClient';
import { CdnFile } from '../CdnFile';

export class JSDelivrClient extends CdnClient {
  static readonly BaseUri = 'https://data.jsdelivr.com/v1';

  // See https://www.jsdelivr.com/docs/data.jsdelivr.com#get-/v1/packages/npm/-package-
  async getLatestVersion(name: string): Promise<string | null> {
    const encodedName = encodeURIComponent(name);
    const response = await this.httpGet(
      `${JSDelivrClient.BaseUri}/packages/npm/${encodedName}`
    );

    if (response.status === 404) {
      return null;
    } else if (response.status >= 400) {
      throw new Error(
        `Failed to get latest version of ${name} from jsDelivr - HTTP status ${response.status}`
      );
    }

    const result: any = await response.json();
    const npmPackage = result as Package;

    return npmPackage?.tags.latest ?? null;
  }

  async getFiles(name: string, version: string): Promise<CdnFile[]> {
    // See https://www.jsdelivr.com/docs/data.jsdelivr.com#get-/v1/packages/npm/-package-@-version-
    const encodedName = encodeURIComponent(name);
    const encodedVersion = encodeURIComponent(version);
    const response = await this.httpGet(
      `${JSDelivrClient.BaseUri}/packages/npm/${encodedName}@${encodedVersion}?structure=flat`
    );

    const files: CdnFile[] = [];

    if (response.status === 404) {
      return files;
    } else if (response.status >= 400) {
      throw new Error(
        `Failed to get files for version ${version} of ${name} from jsDelivr - HTTP status ${response.status}`
      );
    }

    const result: any = await response.json();
    const packageFiles = result as PackageFiles;

    if (packageFiles?.files) {
      for (const file of packageFiles.files) {
        files.push({
          url: `https://cdn.jsdelivr.net/npm/${encodedName}@${encodedVersion}${file.name}`,
          fileName: file.name,
          integrity: `sha256-${file.hash}`,
        });
      }
    }

    return files;
  }
}

interface Package {
  tags: Record<string, string>;
}

interface PackageFiles {
  files: PackageFile[];
}

interface PackageFile {
  name: string;
  hash: string;
  size: number;
}
