// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { CdnClient } from './CdnClient';
import { CdnFile } from '../CdnFile';

export class JSDelivrClient extends CdnClient {
  // See https://github.com/jsdelivr/data.jsdelivr.com/tree/1034f306a9f61be6636750219d152dff6d7e31e6#list-package-versions
  async getLatestVersion(name: string): Promise<string | null> {
    const encodedName = encodeURIComponent(name);
    const response = await this.httpGet(
      `https://data.jsdelivr.com/v1/package/npm/${encodedName}`
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

    return npmPackage?.tags?.latest ?? null;
  }

  async getFiles(name: string, version: string): Promise<CdnFile[]> {
    // See https://github.com/jsdelivr/data.jsdelivr.com/tree/1034f306a9f61be6636750219d152dff6d7e31e6#list-package-files
    const encodedName = encodeURIComponent(name);
    const encodedVersion = encodeURIComponent(version);
    const response = await this.httpGet(
      `https://data.jsdelivr.com/v1/package/npm/${encodedName}@${encodedVersion}/flat`
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
  versions: string[];
}

interface PackageFiles {
  default: string;
  files: PackageFile[];
}

interface PackageFile {
  type: string;
  name: string;
  hash: string;
  time: string;
  size: number;
}
