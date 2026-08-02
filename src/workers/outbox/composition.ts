/**
 * Production-intended composition root for the outbox worker runtime.
 *
 * Wires the Pg-backed outbox graph used by both the local/demo script
 * (`scripts/outbox-worker.ts`) and the compiled container entrypoint
 * (`src/server/worker.ts`), so the runtime wiring lives in exactly one place:
 *
 *   OutboxWorkerRuntime (interval host / graceful shutdown)
 *     → OutboxWorker.processBatch()   (recover → claim → publish → mark)
 *       → PgOutboxStore               (SECURITY DEFINER worker functions)
 *       → OutboxPublisher             (Noop when SERVICE_BUS_ENABLED=false; Azure when true)
 *
 * This module is pure wiring: it constructs objects but performs no I/O until
 * the returned runtime is started. Service Bus stays DISABLED unless
 * SERVICE_BUS_ENABLED=true (no Azure Service Bus sessions in v1).
 */

import type { AppConfig } from '../../config/index.js';
import { closePool } from '../../db/pool.js';
import { createOutboxPublisher } from '../../governance/outbox/OutboxPublisherFactory.js';
import { PgOutboxStore } from '../../governance/outbox/PgOutboxStore.js';
import { createTelemetry } from '../../observability/index.js';
import { OutboxWorker } from './OutboxWorker.js';
import { OutboxWorkerRuntime } from './OutboxWorkerRuntime.js';

export interface PgOutboxWorkerRuntimeDeps {
  /** Structured info logger for runtime lifecycle messages. */
  readonly log: (message: string) => void;
  /** Structured error logger for runtime failures. */
  readonly onError: (message: string, error: unknown) => void;
  /**
   * Whether this runtime owns the shared DB pool lifecycle. When the runtime is CO-HOSTED with the
   * standing-projection worker in the same process, the entrypoint closes the pool once after BOTH
   * runtimes have drained, so it passes `false` here to avoid a premature close (the per-runtime
   * publisher is still closed regardless). Defaults to `true` (standalone).
   */
  readonly ownsPool?: boolean;
}

/**
 * Build the production-intended {@link OutboxWorkerRuntime} from validated config.
 *
 * The caller owns process lifecycle (signals, `runOnce` vs. interval, exit codes);
 * this function only assembles the dependency graph.
 */
export function createPgOutboxWorkerRuntime(
  config: AppConfig,
  deps: PgOutboxWorkerRuntimeDeps,
): OutboxWorkerRuntime {
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

  return new OutboxWorkerRuntime({
    worker,
    config: {
      intervalMs: config.outboxWorker.intervalMs,
      runOnce: config.outboxWorker.runOnce,
      workerId: config.outboxWorker.workerId,
      batchSize: config.outboxWorker.batchSize,
      lockSeconds: config.outboxWorker.lockSeconds,
      serviceBusEnabled: config.serviceBus.enabled,
    },
    log: deps.log,
    onError: deps.onError,
    telemetry: createTelemetry(config.observability),
    closePublisher: async () => {
      await publisher.close?.();
    },
    ...((deps.ownsPool ?? true) ? { closePool } : {}),
  });
}
