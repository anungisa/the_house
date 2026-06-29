/**
 * Local/demo HTTP runtime helpers.
 *
 * These are the testable pieces behind `scripts/api-dev.ts`: resolving + validating
 * runtime options, starting the native HTTP server, and performing a graceful shutdown.
 * They are framework-free and depend only on small structural interfaces so unit tests
 * can exercise them with fakes (no sockets, no live database).
 *
 * LOCAL/DEMO ONLY: this runtime ships NO edge authentication. The HTTP adapter trusts the
 * parsed `actor`/`tenantId` in each request. A real deployment must terminate auth in a
 * gateway/identity layer in front of this process.
 */

import { loadConfig, type AppConfig } from '../config/index.js';

export interface ApiRuntimeOptions {
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string;
}

/**
 * Resolve and validate runtime options from configuration.
 *
 * Fails CLOSED when DATABASE_URL is absent: the local runtime drives the real Pg-backed
 * governed path, so it cannot start without a database (even though `loadConfig` permits
 * an empty DATABASE_URL in local/test mode for non-DB code paths).
 */
export function resolveApiRuntimeOptions(config: AppConfig = loadConfig()): ApiRuntimeOptions {
  if (config.databaseUrl === '') {
    throw new Error(
      'DATABASE_URL is required to start the local API runtime. ' +
        'Set it in your environment or .env (see .env.example).',
    );
  }
  return {
    host: config.api.host,
    port: config.api.port,
    databaseUrl: config.databaseUrl,
  };
}

/** Minimal structural view of a startable HTTP server (satisfied by node:http Server). */
export interface ListenableServer {
  listen(port: number, host: string, callback: () => void): unknown;
  close(callback: (err?: Error) => void): unknown;
}

/** Promisified `server.listen(port, host)`. Resolves once the socket is bound. */
export function listen(server: ListenableServer, host: string, port: number): Promise<void> {
  return new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });
}

export interface ShutdownDeps {
  readonly server: ListenableServer;
  /** Optional pool closer (e.g. `closePool` from db/pool). Skipped when omitted. */
  readonly closePool?: () => Promise<void>;
  /** Optional logger; defaults to a no-op so tests stay quiet. */
  readonly log?: (message: string) => void;
}

/**
 * Gracefully shut down: stop accepting new connections / close the HTTP server, then close
 * the database pool if one was provided. Rejects if the server fails to close.
 */
export async function shutdown(deps: ShutdownDeps): Promise<void> {
  const log = deps.log ?? ((): void => {});
  log('Closing HTTP server (no longer accepting requests)...');
  await new Promise<void>((resolve, reject) => {
    deps.server.close((err) => (err === undefined ? resolve() : reject(err)));
  });
  if (deps.closePool !== undefined) {
    log('Closing database pool...');
    await deps.closePool();
  }
  log('Shutdown complete.');
}
