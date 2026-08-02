/**
 * Standing-projection worker runtime entrypoint.
 *
 * Wires the PRODUCTION-intended projection graph and runs the drain loop:
 *
 *   StandingProjectionRuntime (interval host / graceful shutdown / health)
 *     → StandingProjectionWorker.processBatch()   (poll-due → orchestrate → tally)
 *       → PgActivationEventSource                  (SECURITY DEFINER discovery of ACTIVATED apps)
 *       → StandingActivationOrchestrator           (deterministic identity + kernel-backed `open`)
 *
 * Run with: `npm run worker:standing-projection` (requires DATABASE_URL). This host holds NO
 * governed authority: every standing is opened through the Governance Kernel inside the
 * orchestrator. The reusable, unit-tested loop lives in
 * src/workers/standing-projection/StandingProjectionRuntime.ts; this file is a thin shell.
 *
 * The process should connect with the least-privilege application role (DATABASE_URL). This pass
 * does NOT add an Azure Functions host, leader election, or deployment/IaC.
 */

import { loadConfig } from '../src/config/index.js';
import { buildConfigDiagnostics } from '../src/config/diagnostics.js';
import { createLogger } from '../src/shared/logging/logger.js';
import { createPgStandingProjectionRuntime } from '../src/workers/standing-projection/composition.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  if (!config.standingProjectionWorker.enabled) {
    logger.warn('STANDING_PROJECTION_WORKER_ENABLED=false; not starting');
    return;
  }
  if (config.databaseUrl === '') {
    throw new Error('DATABASE_URL is required to run the standing-projection worker.');
  }

  // Redacted operational summary (never includes connection strings/credentials).
  const diagnostics = buildConfigDiagnostics(config);
  logger.info('config diagnostics', { config: diagnostics.summary });
  for (const warning of diagnostics.warnings) {
    logger.warn('config warning', { warning });
  }

  const runtime = createPgStandingProjectionRuntime(config, {
    log: (message) => logger.info(message),
    onError: (message, error) => logger.error(message, { err: error }),
  });

  if (config.standingProjectionWorker.runOnce) {
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
  createLogger().error('standing-projection-worker failed to start', { err: error });
  process.exitCode = 1;
});
