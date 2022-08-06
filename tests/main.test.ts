// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';

const github = require('@actions/github');

import { v4 as uuid } from 'uuid';
import { run } from '../src/main';

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

const tempDir = path.join(os.tmpdir(), 'update-static-assets-temp');

describe('update-static-assets tests', () => {
  beforeAll(async () => {
    if (!fs.existsSync(tempDir)) {
      await io.mkdirP(tempDir);
    }
  });

  afterAll(async () => {
    try {
      await io.rmRF(tempDir);
    } catch {
      console.log('Failed to remove test directories');
    }
  }, 5000);

  describe('Updates static assets for cdnjs', () => {
    const repoPath = path.join(tempDir, uuid());
    const indexHtml = path.join(repoPath, 'index.html');

    const testFiles = [
      {
        path: indexHtml,
        data: `
        <html lang="en-gb">
          <head>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" integrity="sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
          </head>
        </html>`,
      },
    ];

    beforeAll(async () => {
      setupMocks();
      await runAction(repoPath, testFiles);
    }, 30000);

    afterAll(async () => {
      try {
        await io.rmRF(repoPath);
      } catch {
        console.log('Failed to remove test repository');
      }
    }, 5000);

    test('Does not log any errors', () => {
      expect(core.error).toHaveBeenCalledTimes(0);
    });

    test('Does not fail', () => {
      expect(core.setFailed).toHaveBeenCalledTimes(0);
    });

    test('Updates the font-awesome tag', () => {
      const html = fs.readFileSync(indexHtml, { encoding: 'utf8' });
      expect(html).not.toContain(
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
      );
      expect(html).not.toContain(
        'sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg=='
      );
    });
  });

  describe('Updates static assets for jsDelivr', () => {
    const repoPath = path.join(tempDir, uuid());
    const indexHtml = path.join(repoPath, 'index.html');

    const testFiles = [
      {
        path: indexHtml,
        data: `
        <html lang="en-gb">
          <head>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">
          </head>
          <body>
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-ka7Sk0Gln4gmtz2MlQnikT1wXgYsOg+OMhuP+IlRH9sENBO0LRn5q+8nbTov4+1p" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
          </body>
        </html>`,
      },
    ];

    beforeAll(async () => {
      setupMocks();
      await runAction(repoPath, testFiles);
    }, 30000);

    afterAll(async () => {
      try {
        await io.rmRF(repoPath);
      } catch {
        console.log('Failed to remove test repository');
      }
    }, 5000);

    test('Does not log any errors', () => {
      expect(core.error).toHaveBeenCalledTimes(0);
    });

    test('Does not fail', () => {
      expect(core.setFailed).toHaveBeenCalledTimes(0);
    });

    test('Updates the bootstrap tags', () => {
      const html = fs.readFileSync(indexHtml, { encoding: 'utf8' });
      expect(html).not.toContain(
        'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css'
      );
      expect(html).not.toContain(
        'sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3'
      );
      expect(html).not.toContain(
        'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js'
      );
      expect(html).not.toContain(
        'sha384-ka7Sk0Gln4gmtz2MlQnikT1wXgYsOg+OMhuP+IlRH9sENBO0LRn5q+8nbTov4+1p'
      );
    });
  });

  describe('Updates the static assets for multiple assets', () => {
    const repoPath = path.join(tempDir, uuid());
    const indexHtml = path.join(repoPath, 'index.html');

    const testFiles = [
      {
        path: indexHtml,
        data: `
        <html lang="en-gb">
          <head>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" integrity="sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3" crossorigin="anonymous">
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" integrity="sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
          </head>
          <body>
            <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-ka7Sk0Gln4gmtz2MlQnikT1wXgYsOg+OMhuP+IlRH9sENBO0LRn5q+8nbTov4+1p" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
          </body>
        </html>`,
      },
    ];

    beforeAll(async () => {
      setupMocks();
      await runAction(repoPath, testFiles);
    }, 30000);

    afterAll(async () => {
      try {
        await io.rmRF(repoPath);
      } catch {
        console.log('Failed to remove test repository');
      }
    }, 5000);

    test('Does not log any errors', () => {
      expect(core.error).toHaveBeenCalledTimes(0);
    });

    test('Does not fail', () => {
      expect(core.setFailed).toHaveBeenCalledTimes(0);
    });

    test('Updates bootstrap', async () => {
      const stdout = await git(repoPath, 'branch');
      const matches = stdout.match(
        /(update-static-assets\/bootstrap\/[0-9\.]+)/
      );

      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(1);

      await git(repoPath, 'checkout', matches![0]);

      const html = fs.readFileSync(indexHtml, { encoding: 'utf8' });

      expect(html).not.toContain(
        'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css'
      );
      expect(html).not.toContain(
        'sha384-1BmE4kWBq78iYhFldvKuhfTAU6auU8tT94WrHftjDbrCEXSU1oBoqyl2QvZ6jIW3'
      );
      expect(html).not.toContain(
        'https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js'
      );
      expect(html).not.toContain(
        'sha384-ka7Sk0Gln4gmtz2MlQnikT1wXgYsOg+OMhuP+IlRH9sENBO0LRn5q+8nbTov4+1p'
      );
    });

    test('Updates font-awesome', async () => {
      const stdout = await git(repoPath, 'branch');
      const matches = stdout.match(
        /(update-static-assets\/font-awesome\/[0-9\.]+)/
      );

      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(1);

      await git(repoPath, 'checkout', matches![0]);

      const html = fs.readFileSync(indexHtml, { encoding: 'utf8' });

      expect(html).not.toContain(
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
      );
      expect(html).not.toContain(
        'sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg=='
      );
    });
  });
});

function setupMocks(): void {
  jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  jest.spyOn(core, 'error').mockImplementation(() => {});
  jest.spyOn(core, 'setFailed').mockImplementation(() => {});
}

async function git(repoPath: string, ...args: string[]): Promise<string> {
  const options = {
    cwd: repoPath,
    ignoreReturnCode: true,
  };
  const result = await exec.getExecOutput('git', args, options);
  return result.stdout;
}

async function createTestGitRepo(
  repoPath: string,
  testFiles: { path: string; data: string }[]
): Promise<void> {
  if (!fs.existsSync(repoPath)) {
    await io.mkdirP(repoPath);
  }

  for (const { path, data } of testFiles) {
    fs.writeFileSync(path, data);
  }

  await git(repoPath, 'init');
  await git(repoPath, 'config', 'core.safecrlf', 'false');
  await git(repoPath, 'config', 'user.email', 'test@test.local');
  await git(repoPath, 'config', 'user.name', 'test');
  await git(repoPath, 'add', '.');
  await git(repoPath, 'commit', '-m', 'Initial commit');
}

async function runAction(
  repoPath: string,
  testFiles: { path: string; data: string }[]
): Promise<void> {
  const inputs = {
    'GITHUB_API_URL': 'https://github.local/api/v3',
    'GITHUB_REPOSITORY': '',
    'GITHUB_SERVER_URL': 'https://github.local',
    'INPUT_FILE-EXTENSIONS': 'cshtml,html,razor',
    'INPUT_LABELS': 'foo,bar',
    'INPUT_REPO-PATH': repoPath,
    'INPUT_REPO-TOKEN': 'my-token',
    'INPUT_USER-EMAIL': 'github-actions[bot]@users.noreply.github.com',
    'INPUT_USER-NAME': 'github-actions[bot]',
  };

  for (const key in inputs) {
    process.env[key] = inputs[key as keyof typeof inputs];
  }

  await createTestGitRepo(repoPath, testFiles);

  github.getOctokit = jest.fn().mockReturnValue({
    rest: {
      issues: {
        addLabels: () => Promise.resolve({}),
      },
      pulls: {
        create: () =>
          Promise.resolve({
            data: {
              number: '42',
              html_url:
                'https://github.local/martincostello/update-static-assets/pull/42',
            },
          }),
      },
    },
  });

  await run();
}
