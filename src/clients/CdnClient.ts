// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { fetch, Response } from 'undici';
import { CdnFile } from '../CdnFile';

export abstract class CdnClient {
  abstract getLatestVersion(name: string): Promise<string | null>;

  abstract getFiles(name: string, version: string): Promise<CdnFile[]>;

  protected async httpGet(url: string): Promise<Response> {
    return await fetch(url, {
      headers: new Headers([
        ['User-Agent', 'martincostello/update-static-assets'],
      ]),
    });
  }
}
