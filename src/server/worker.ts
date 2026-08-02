/**
 * Compiled worker runtime entrypoint (container target `worker`).
 *
 * Co-hosts the two background runtimes for the platform in ONE process (one worker image), each
 * independently enable-gated:
 *
 *   1. Transactional-outbox drain loop      (src/workers/outbox/composition.ts)
 *   2. Standing-projection drain loop        (src/workers/standing-projection/composition.ts)
 *
 * Built into `dist/src/server/worker.js` and run with `node dist/src/server/worker.js`
 * (requires DATABASE_URL). Both runtimes share the SAME connection pool, so neither owns the pool
 * lifecycle (`ownsPool: false`); this entrypoint closes the pool EXACTLY ONCE after BOTH runtimes
 * have drained their in-flight batches — no runtime can close the pool out from under the other.
 *
 * Service Bus stays DISABLED unless SERVICE_BUS_ENABLED=true (no Azure Service Bus sessions in v1).
 * The reusable, unit-tested loops live in the runtime-host classes; this file is a thin shell.
 */

import { buildConfigDiagnostics } from '../config/diagnostics.js';
import { loadConfig, type AppConfig } from '../config/index.js';
import { closePool } from '../db/pool.js';
import { createLogger } from '../shared/logging/logger.js';
import { createPgOutboxWorkerRuntime } from '../workers/outbox/composition.js';
import { createPgStandingProjectionRuntime } from '../workers/standing-projection/composition.js';

/** A started runtime the entrypoint can start, shut down, and (for run-once) know self-completed. */
interface HostedRuntime {
  readonly runOnce: boolean;
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

function buildRuntimes(config: AppConfig, logger: ReturnType<typeof createLogger>): HostedRuntime[] {
  const runtimes: HostedRuntime[] = [];

  if (config.outboxWorker.enabled) {
    const runtime = createPgOutboxWorkerRuntime(config, {
      log: (message) => logger.info(`[outbox] ${message}`),
      onError: (message, error) => logger.error(`[outbox] ${message}`, { err: error }),
      ownsPool: false, // entrypoint owns the shared pool
    });
    runtimes.push({ runOnce: config.outboxWorker.runOnce, ...bind(runtime) });
  } else {
    logger.warn('OUTBOX_WORKER_ENABLED=false; outbox drain not starting');
  }

  if (config.standingProjectionWorker.enabled) {
    const runtime = createPgStandingProjectionRuntime(config, {
      log: (message) => logger.info(`[standing-projection] ${message}`),
      onError: (message, error) => logger.error(`[standing-projection] ${message}`, { err: error }),
      ownsPool: false, // entrypoint owns the shared pool
    });
    runtimes.push({ runOnce: config.standingProjectionWorker.runOnce, ...bind(runtime) });
  } else {
    logger.warn('STANDING_PROJECTION_WORKER_ENABLED=false; standing projection not starting');
  }

  return runtimes;
}

/** Narrow a concrete runtime to the start/shutdown surface (keeps buildRuntimes type-simple). */
function bind(runtime: { start(): Promise<void>; shutdown(): Promise<void> }): {
  start(): Promise<void>;
  shutdown(): Promise<void>;
} {
  return {
    start: () => runtime.start(),
    shutdown: () => runtime.shutdown(),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  if (!config.outboxWorker.enabled && !config.standingProjectionWorker.enabled) {
    logger.warn('no worker runtimes enabled; not starting');
    return;
  }
  if (config.databaseUrl === '') {
    throw new Error('DATABASE_URL is required to run the worker.');
  }

  // Redacted operational summary (never includes connection strings/credentials).
  const diagnostics = buildConfigDiagnostics(config);
  logger.info('config diagnostics', { config: diagnostics.summary });
  for (const warning of diagnostics.warnings) {
    logger.warn('config warning', { warning });
  }

  const runtimes = buildRuntimes(config, logger);
  const allRunOnce = runtimes.every((r) => r.runOnce);

  const shutdownAll = async (): Promise<void> => {
    // Shut down every runtime (idempotent for those already self-shut in run-once mode), then close
    // the shared pool EXACTLY ONCE — after all in-flight batches have drained.
    await Promise.all(runtimes.map((r) => r.shutdown()));
    await closePool();
  };

  if (allRunOnce) {
    // Each runtime drains a single batch and self-shuts-down (but never closes the shared pool).
    for (const runtime of runtimes) {
      await runtime.start();
    }
    await shutdownAll();
    process.exit(0);
  }

  let shuttingDown = false;
  const handleSignal = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown signal received', { signal });
    shutdownAll()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error('shutdown failed', { err });
        process.exit(1);
      });
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  // Start every enabled runtime. Continuous runtimes schedule their interval and return; a run-once
  // sibling drains a single batch and self-shuts-down without touching the shared pool.
  for (const runtime of runtimes) {
    await runtime.start();
  }
}

main().catch((error: unknown) => {
  createLogger().error('worker failed to start', { err: error });
  process.exitCode = 1;
});
