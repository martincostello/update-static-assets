// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { IgnoreAsset } from './IgnoreAsset';

export interface UpdateOptions {
  accessToken: string;
  apiUrl?: string;
  branchPrefix: string;
  closeSuperseded: boolean;
  commitMessage: string;
  dryRun: boolean;
  fileExtensions: string[];
  ignore: IgnoreAsset[];
  labels: string;
  repo: string;
  repoPath: string;
  runId?: string;
  runRepo?: string;
  serverUrl?: string;
  userEmail: string;
  userName: string;
}
