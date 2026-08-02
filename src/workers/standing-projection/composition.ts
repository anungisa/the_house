/**
 * Production-intended composition root for the standing-projection worker runtime.
 *
 * Wires the Pg-backed projection graph used by both the local/demo script
 * (`scripts/standing-projection-worker.ts`) and the compiled container entrypoint
 * (`src/server/worker.ts`), so the runtime wiring lives in exactly one place:
 *
 *   StandingProjectionRuntime (interval host / graceful shutdown / health)
 *     → StandingProjectionWorker.processBatch()   (poll-due → orchestrate → tally)
 *       → PgActivationEventSource                  (SECURITY DEFINER discovery of ACTIVATED apps)
 *       → StandingActivationOrchestrator           (deterministic identity + kernel-backed `open`)
 *         → AffiliationStandingService (kernel)     (governed standing `open`; NO direct mutation)
 *         → PgStandingProjectionStore               (RLS-enforced reconcilable bookkeeping)
 *
 * This module is pure wiring: it constructs objects but performs no I/O until the returned runtime
 * is started. The standing is opened ONLY through the Governance Kernel — this host holds no
 * governed authority of its own.
 */

import type { AppConfig } from '../../config/index.js';
import { closePool } from '../../db/pool.js';
import { createPgStandingProjectionWorker } from '../../http/composition.js';
import { createTelemetry } from '../../observability/index.js';
import { StandingProjectionRuntime } from './StandingProjectionRuntime.js';

export interface PgStandingProjectionRuntimeDeps {
  /** Structured info logger for runtime lifecycle messages. */
  readonly log: (message: string) => void;
  /** Structured error logger for runtime failures. */
  readonly onError: (message: string, error: unknown) => void;
  /**
   * Whether this runtime owns the shared DB pool lifecycle. When the runtime is CO-HOSTED with the
   * outbox worker in the same process, the entrypoint closes the pool once after BOTH runtimes have
   * drained, so it passes `false` here to avoid a premature close. Defaults to `true` (standalone).
   */
  readonly ownsPool?: boolean;
}

/**
 * Build the production-intended {@link StandingProjectionRuntime} from validated config.
 *
 * The caller owns process lifecycle (signals, `runOnce` vs. interval, exit codes); this function
 * only assembles the dependency graph.
 */
export function createPgStandingProjectionRuntime(
  config: AppConfig,
  deps: PgStandingProjectionRuntimeDeps,
): StandingProjectionRuntime {
  const worker = createPgStandingProjectionWorker();
  const ownsPool = deps.ownsPool ?? true;

  return new StandingProjectionRuntime({
    worker,
    config: {
      intervalMs: config.standingProjectionWorker.intervalMs,
      runOnce: config.standingProjectionWorker.runOnce,
      workerId: config.standingProjectionWorker.workerId,
      batchSize: config.standingProjectionWorker.batchSize,
    },
    log: deps.log,
    onError: deps.onError,
    telemetry: createTelemetry(config.observability),
    ...(ownsPool ? { closePool } : {}),
  });
}
