import { describe, it, expect, vi } from 'vitest';
import {
  listen,
  resolveApiRuntimeOptions,
  shutdown,
  type ListenableServer,
} from '../../../src/http/runtime.js';
import { createAffiliationHttpServer } from '../../../src/http/server.js';
import type { AppConfig } from '../../../src/config/index.js';
import type { AffiliationApplicationTransitionResponse } from '../../../src/domains/affiliation/AffiliationApplicationDtos.js';

/**
 * Unit tests for the local/demo API runtime helpers (src/http/runtime.ts).
 *
 * No sockets and no live database: options resolution is pure, and listen/shutdown are
 * exercised against a structural fake server.
 */

function makeConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    appEnv: 'local',
    appRegion: 'canada',
    logLevel: 'info',
    databaseUrl: 'postgres://u:p@localhost:5432/db',
    serviceBus: { connectionString: '', outboxTopic: '', outboxQueue: '' },
    outbox: {
      batchSize: 25,
      lockSeconds: 120,
      baseDelayMs: 1000,
      maxDelayMs: 300_000,
      maxRetries: 10,
    },
    api: { host: '127.0.0.1', port: 3000 },
    ...over,
  };
}

class FakeServer implements ListenableServer {
  readonly listenCalls: Array<{ port: number; host: string }> = [];
  closed = false;
  closeError: Error | undefined;

  listen(port: number, host: string, callback: () => void): this {
    this.listenCalls.push({ port, host });
    callback();
    return this;
  }

  close(callback: (err?: Error) => void): this {
    this.closed = true;
    callback(this.closeError);
    return this;
  }
}

describe('resolveApiRuntimeOptions', () => {
  // (1) Reads host/port (here the loopback:3000 defaults carried by the config).
  it('returns host, port, and databaseUrl from config', () => {
    const opts = resolveApiRuntimeOptions(makeConfig());
    expect(opts).toEqual({
      host: '127.0.0.1',
      port: 3000,
      databaseUrl: 'postgres://u:p@localhost:5432/db',
    });
  });

  it('passes through non-default host/port', () => {
    const opts = resolveApiRuntimeOptions(makeConfig({ api: { host: '0.0.0.0', port: 8080 } }));
    expect(opts.host).toBe('0.0.0.0');
    expect(opts.port).toBe(8080);
  });

  // (2) Fails closed when DATABASE_URL is absent.
  it('throws when DATABASE_URL is empty', () => {
    expect(() => resolveApiRuntimeOptions(makeConfig({ databaseUrl: '' }))).toThrow(
      /DATABASE_URL is required/,
    );
  });
});

describe('listen', () => {
  it('binds the server to the given host and port', async () => {
    const server = new FakeServer();
    await listen(server, '127.0.0.1', 3000);
    expect(server.listenCalls).toEqual([{ port: 3000, host: '127.0.0.1' }]);
  });
});

describe('shutdown', () => {
  // (4) Graceful shutdown closes the server and the pool.
  it('closes the server then the pool', async () => {
    const server = new FakeServer();
    const closePool = vi.fn().mockResolvedValue(undefined);
    await shutdown({ server, closePool });
    expect(server.closed).toBe(true);
    expect(closePool).toHaveBeenCalledTimes(1);
  });

  it('works without a pool closer', async () => {
    const server = new FakeServer();
    await expect(shutdown({ server })).resolves.toBeUndefined();
    expect(server.closed).toBe(true);
  });

  it('rejects when the server fails to close', async () => {
    const server = new FakeServer();
    server.closeError = new Error('close failed');
    const closePool = vi.fn().mockResolvedValue(undefined);
    await expect(shutdown({ server, closePool })).rejects.toThrow(/close failed/);
    expect(closePool).not.toHaveBeenCalled(); // pool only closes after the server does
  });
});

describe('server construction with fake dependencies', () => {
  // (3) The native HTTP server builds from a fake executor with no database involvement.
  it('builds a server from a fake command executor', () => {
    const executor = {
      executeCommand: (): Promise<AffiliationApplicationTransitionResponse> =>
        Promise.resolve({} as AffiliationApplicationTransitionResponse),
    };
    const server = createAffiliationHttpServer({ executor });
    expect(typeof server.listen).toBe('function');
    expect(typeof server.close).toBe('function');
    server.close();
  });
});
