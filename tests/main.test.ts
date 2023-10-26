// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as core from '@actions/core';
import { ActionFixture } from './ActionFixture';
import { setup } from './fixtures';

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';

const timeout = 45000;

describe('update-static-assets', () => {
  describe('for cdnjs', () => {
    describe.each([
      [
        'font-awesome',
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
        'sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg==',
      ],
    ])('for %s', (name: string, href: string, integrity: string) => {
      let fixture: ActionFixture;

      beforeAll(async () => {
        await setup('scenarios');
        fixture = new ActionFixture();

        await fixture.initialize([
          {
            path: 'index.html',
            data: `
          <html lang="en-gb">
            <head>
              <!-- ${name} -->
              <link rel="stylesheet" href="${href}" integrity="${integrity}" crossorigin="anonymous" referrerpolicy="no-referrer" />
            </head>
          </html>`,
          },
        ]);

        await fixture.run();
      }, timeout);

      afterAll(async () => {
        await fixture?.destroy();
      });

      test('does not log any errors', () => {
        expect(core.error).toHaveBeenCalledTimes(0);
      });

      test('does not fail', () => {
        expect(core.setFailed).toHaveBeenCalledTimes(0);
      });

      test.each([['assets-updated'], ['pulls-closed'], ['pulls-opened']])(
        '%s is correct',
        (name: string) => {
          expect(fixture.getOutput(name)).toMatchSnapshot();
        }
      );

      test('updates font-awesome', async () => {
        expect(await fixture.getContent('index.html')).toMatchSnapshot();
      });

      test('generates the correct commit message', async () => {
        expect(await fixture.commitHistory(2)).toMatchSnapshot();
      });

      test('generates the correct diff', async () => {
        expect(await fixture.diff()).toMatchSnapshot();
      });
    });
  });

  describe('for jsDelivr', () => {
    let fixture: ActionFixture;

    beforeAll(async () => {
      await setup('scenarios');
      fixture = new ActionFixture();

      await fixture.initialize([
        {
          path: 'index.html',
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
      ]);

      await fixture.run();
    }, timeout);

    afterAll(async () => {
      await fixture?.destroy();
    });

    test('does not log any errors', () => {
      expect(core.error).toHaveBeenCalledTimes(0);
    });

    test('does not fail', () => {
      expect(core.setFailed).toHaveBeenCalledTimes(0);
    });

    test.each([['assets-updated'], ['pulls-closed'], ['pulls-opened']])(
      '%s is correct',
      (name: string) => {
        expect(fixture.getOutput(name)).toMatchSnapshot();
      }
    );

    test('updates bootstrap', async () => {
      expect(await fixture.getContent('index.html')).toMatchSnapshot();
    });

    test('generates the correct commit message', async () => {
      expect(await fixture.commitHistory(2)).toMatchSnapshot();
    });

    test('generates the correct diff', async () => {
      expect(await fixture.diff()).toMatchSnapshot();
    });
  });

  describe('for multiple assets', () => {
    let fixture: ActionFixture;

    beforeAll(async () => {
      await setup('scenarios');
      fixture = new ActionFixture();

      await fixture.initialize([
        {
          path: 'index.html',
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
      ]);

      await fixture.run();
    }, timeout);

    afterAll(async () => {
      await fixture?.destroy();
    });

    test('does not log any errors', () => {
      expect(core.error).toHaveBeenCalledTimes(0);
    });

    test('does not fail', () => {
      expect(core.setFailed).toHaveBeenCalledTimes(0);
    });

    test.each([['assets-updated'], ['pulls-closed'], ['pulls-opened']])(
      '%s is correct',
      (name: string) => {
        expect(fixture.getOutput(name)).toMatchSnapshot();
      }
    );

    describe.each([
      ['bootstrap', '5.3.1'],
      ['font-awesome', '6.4.2'],
    ])('updating %s', (asset: string, version: string) => {
      beforeAll(async () => {
        await setup('scenarios');
        await fixture.checkout(`update-static-assets/${asset}/${version}`);
      });

      test('generates the correct commit message', async () => {
        expect(await fixture.commitHistory(2)).toMatchSnapshot();
      });

      test('generates the correct diff', async () => {
        expect(await fixture.diff()).toMatchSnapshot();
      });

      test('updates the HTML', async () => {
        expect(await fixture.getContent('index.html')).toMatchSnapshot();
      });
    });
  });

  describe('for assets that are ignored', () => {
    let fixture: ActionFixture;

    beforeAll(async () => {
      await setup('scenarios');
      fixture = new ActionFixture();

      await fixture.initialize([
        {
          path: 'index.html',
          data: `
          <html lang="en-gb">
            <head>
              <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" integrity="sha512-9usAa10IRO0HhonpyAIVpjrylPvoDwiPUiKdWk5t3PyolY1cOd4DSE0Ga+ri4AuTroPR5aQvXU9xC6qOPnzFeg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
            </head>
          </html>`,
        },
        {
          path: '.update-static-assets.json',
          data: JSON.stringify({
            ignore: [
              {
                cdn: 'cdnjs',
                name: 'font-awesome',
                version: '.*',
              },
            ],
          }),
        },
      ]);

      await fixture.run();
    }, timeout);

    afterAll(async () => {
      await fixture?.destroy();
    });

    test('does not log any errors', () => {
      expect(core.error).toHaveBeenCalledTimes(0);
    });

    test('does not fail', () => {
      expect(core.setFailed).toHaveBeenCalledTimes(0);
    });

    test.each([['assets-updated'], ['pulls-closed'], ['pulls-opened']])(
      '%s is correct',
      (name: string) => {
        expect(fixture.getOutput(name)).toMatchSnapshot();
      }
    );

    test('does not update excluded assets', async () => {
      expect(await fixture.getContent('index.html')).toMatchSnapshot();
    });

    test('generates the correct commit message', async () => {
      expect(await fixture.commitHistory(2)).toMatchSnapshot();
    });
  });
});
