/**
 * Outbox worker runtime entrypoint.
 *
 * Wires the PRODUCTION-intended worker graph and runs the drain loop:
 *
 *   OutboxWorkerRuntime (interval host / graceful shutdown)
 *     → OutboxWorker.processBatch()          (recover → claim → publish → mark)
 *       → PgOutboxStore                       (SECURITY DEFINER worker functions, migration 0004)
 *       → OutboxPublisher                     (Noop when SERVICE_BUS_ENABLED=false; Azure when true)
 *
 * Run with: `npm run worker:outbox` (requires DATABASE_URL). Service Bus stays DISABLED
 * unless SERVICE_BUS_ENABLED=true. The reusable, unit-tested loop lives in
 * src/workers/outbox/OutboxWorkerRuntime.ts; this file is a thin shell.
 *
 * The process should connect with the dedicated SECURITY DEFINER worker role (DATABASE_URL
 * pointing at e.g. house_outbox_worker). This pass does NOT add an Azure Functions host,
 * DLQ consumer, observability, leader election, or deployment/IaC.
 */

import { loadConfig } from '../src/config/index.js';
import { closePool } from '../src/db/pool.js';
import { createOutboxPublisher } from '../src/governance/outbox/OutboxPublisherFactory.js';
import { PgOutboxStore } from '../src/governance/outbox/PgOutboxStore.js';
import { OutboxWorker } from '../src/workers/outbox/OutboxWorker.js';
import { OutboxWorkerRuntime } from '../src/workers/outbox/OutboxWorkerRuntime.js';

function log(message: string): void {
  console.log(`[outbox-worker] ${message}`);
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.outboxWorker.enabled) {
    log('OUTBOX_WORKER_ENABLED=false; not starting. Exiting.');
    return;
  }
  if (config.databaseUrl === '') {
    throw new Error('DATABASE_URL is required to run the outbox worker.');
  }

  const store = new PgOutboxStore();
  const publisher = createOutboxPublisher(config);
  const worker = new OutboxWorker(
    store,
    publisher,
    {
      batchSize: config.outboxWorker.batchSize,
      lockSeconds: config.outboxWorker.lockSeconds,
      baseDelayMs: config.outbox.baseDelayMs,
      maxDelayMs: config.outbox.maxDelayMs,
      maxRetries: config.outbox.maxRetries,
    },
    { workerId: config.outboxWorker.workerId },
  );

  const runtime = new OutboxWorkerRuntime({
    worker,
    config: {
      intervalMs: config.outboxWorker.intervalMs,
      runOnce: config.outboxWorker.runOnce,
      workerId: config.outboxWorker.workerId,
      batchSize: config.outboxWorker.batchSize,
      lockSeconds: config.outboxWorker.lockSeconds,
      serviceBusEnabled: config.serviceBus.enabled,
    },
    log,
    closePublisher: async () => {
      await publisher.close?.();
    },
    closePool,
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
    log(`Received ${signal}; shutting down...`);
    runtime
      .shutdown()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
      });
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  log('Press Ctrl+C to stop.');
  await runtime.start();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
