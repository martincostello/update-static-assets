// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

export interface UpdateOptions {
  accessToken: string;
  apiUrl?: string;
  branchPrefix: string;
  commitMessage: string;
  dryRun: boolean;
  fileExtensions: string[];
  labels: string;
  repo?: string;
  repoPath: string;
  runId?: string;
  serverUrl?: string;
  userEmail: string;
  userName: string;
}
