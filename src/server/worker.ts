/**
 * Compiled outbox worker runtime entrypoint (container target `worker`).
 *
 * Runs the transactional-outbox drain loop using the shared production-intended
 * composition root (src/workers/outbox/composition.ts). Built into
 * `dist/src/server/worker.js` and run with `node dist/src/server/worker.js`
 * (requires DATABASE_URL).
 *
 * Service Bus stays DISABLED unless SERVICE_BUS_ENABLED=true (no Azure Service Bus
 * sessions in v1). The process should connect with the dedicated SECURITY DEFINER
 * worker role. The reusable, unit-tested loop lives in
 * src/workers/outbox/OutboxWorkerRuntime.ts; this file is a thin shell.
 */

import { buildConfigDiagnostics } from '../config/diagnostics.js';
import { loadConfig } from '../config/index.js';
import { createLogger } from '../shared/logging/logger.js';
import { createPgOutboxWorkerRuntime } from '../workers/outbox/composition.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  if (!config.outboxWorker.enabled) {
    logger.warn('OUTBOX_WORKER_ENABLED=false; not starting');
    return;
  }
  if (config.databaseUrl === '') {
    throw new Error('DATABASE_URL is required to run the outbox worker.');
  }

  // Redacted operational summary (never includes connection strings/credentials).
  const diagnostics = buildConfigDiagnostics(config);
  logger.info('config diagnostics', { config: diagnostics.summary });
  for (const warning of diagnostics.warnings) {
    logger.warn('config warning', { warning });
  }

  const runtime = createPgOutboxWorkerRuntime(config, {
    log: (message) => logger.info(message),
    onError: (message, error) => logger.error(message, { err: error }),
  });

  if (config.outboxWorker.runOnce) {
    // start() runs one batch and shuts down (closing resources) before returning.
    await runtime.start();
    process.exit(0);
  }

  let shuttingDown = false;
  const handleSignal = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown signal received', { signal });
    runtime
      .shutdown()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error('shutdown failed', { err });
        process.exit(1);
      });
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  await runtime.start();
}

main().catch((error: unknown) => {
  createLogger().error('outbox-worker failed to start', { err: error });
  process.exitCode = 1;
});
