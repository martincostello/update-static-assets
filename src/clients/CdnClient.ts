// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { HttpClient } from '@actions/http-client';
import { CdnFile } from '../CdnFile';

export abstract class CdnClient {
  protected httpClient: HttpClient;

  constructor() {
    this.httpClient = new HttpClient(
      'martincostello/update-static-assets',
      [],
      {
        allowRetries: true,
        maxRetries: 3,
      }
    );
  }

  abstract getLatestVersion(name: string): Promise<string | null>;

  abstract getFiles(name: string, version: string): Promise<CdnFile[]>;
}
