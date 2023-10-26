// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import { CdnPackage } from './CdnPackage';
import { CdnProvider } from './CdnProvider';

export interface AssetUpdate extends CdnPackage {
  cdn: CdnProvider;
  pullRequestNumber: number;
  pullRequestUrl: string;
  supersedes: number[];
}
