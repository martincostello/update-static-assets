// Copyright (c) Martin Costello, 2022. All rights reserved.
// Licensed under the Apache 2.0 license. See the LICENSE file in the project root for full license information.

import * as fs from 'fs';
import { join } from 'path';
import {
  Dispatcher,
  Dispatcher1Wrapper,
  MockAgent,
  setGlobalDispatcher,
} from 'undici';
import { MockInterceptor } from 'undici/types/mock-interceptor';

type Fixture = {
  scenarios: Scenario[];
};

type Scenario = {
  basePath: string;
  method?: string;
  headers?: Record<string, string>;
  path: string;
  persist?: boolean;
  body?: any;
  status?: number;
  response: any;
};

// Undici v8 changed the global dispatcher symbol from 'undici.globalDispatcher.1' to
// 'undici.globalDispatcher.2'. Dependencies that use older versions of undici (e.g.
// @actions/github) still use the old symbol, so we need to set the legacy dispatcher too.
// However, undici v6 (used by @actions/github) sends request bodies as async generators,
// so we need to read them before passing to the undici v8 MockAgent for body matching.
class LegacyCompatWrapper extends Dispatcher {
  private dispatcher: Dispatcher;

  constructor(dispatcher: Dispatcher) {
    super();
    this.dispatcher = dispatcher;
  }

  private async readBody(body: unknown): Promise<string | null | undefined> {
    if (body == null || typeof body === 'string' || Buffer.isBuffer(body)) {
      return body as string | null | undefined;
    }
    if (
      typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
        'function' ||
      typeof (body as Iterable<unknown>)[Symbol.iterator] === 'function'
    ) {
      const chunks: Buffer[] = [];
      const iterable = body as AsyncIterable<unknown>;
      for await (const chunk of iterable) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
        );
      }
      return Buffer.concat(chunks).toString('utf8');
    }
    return body as string;
  }

  dispatch(
    opts: Dispatcher.DispatchOptions,
    handler: Dispatcher.DispatchHandler
  ): boolean {
    const body = opts.body;
    if (
      body != null &&
      typeof body === 'object' &&
      (typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
        'function' ||
        typeof (body as Iterable<unknown>)[Symbol.iterator] === 'function')
    ) {
      this.readBody(body)
        .then((readBody) => {
          this.dispatcher.dispatch({ ...opts, body: readBody }, handler);
        })
        .catch((err) => {
          (handler as { onError?(err: Error): void }).onError?.(err);
        });
      return true;
    }
    return this.dispatcher.dispatch(opts, handler);
  }

  close(): Promise<void> {
    return this.dispatcher.close();
  }

  destroy(): Promise<void> {
    return this.dispatcher.destroy();
  }
}

const agent = new MockAgent();

agent.disableNetConnect();
setGlobalDispatcher(agent);

(globalThis as unknown as Record<symbol, unknown>)[
  Symbol.for('undici.globalDispatcher.1')
] = new LegacyCompatWrapper(new Dispatcher1Wrapper(agent));

export async function setup(name: string): Promise<void> {
  const fileName = join(__dirname, 'fixtures', `${name}.json`);
  const json = await fs.promises.readFile(fileName, 'utf8');
  const fixture: Fixture = JSON.parse(json);

  for (const scenario of fixture.scenarios) {
    const options: MockInterceptor.Options = {
      method: scenario.method ?? 'GET',
      path: scenario.path,
    };

    if (scenario.headers) {
      options.headers = {};
      for (const [key, value] of Object.entries(scenario.headers)) {
        options.headers[key] = value;
      }
    }

    if (scenario.body) {
      options.body =
        typeof scenario.body === 'string'
          ? scenario.body
          : JSON.stringify(scenario.body);
    }

    const responseOptions = {
      headers: {
        'Content-Type':
          typeof scenario.response === 'string'
            ? 'text/plain'
            : 'application/json',
      },
    };

    const scope = agent
      .get(scenario.basePath)
      .intercept(options)
      .reply(scenario.status ?? 200, scenario.response, responseOptions);

    if (scenario.persist) {
      scope.persist();
    }
  }
}
