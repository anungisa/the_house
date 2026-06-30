/**
 * Compiled API runtime entrypoint (container target `api`).
 *
 * Starts the native HTTP AffiliationApplication adapter wired to the Pg-backed
 * composition root, listens on API_HOST/API_PORT, and shuts down gracefully on
 * SIGINT/SIGTERM. Built into `dist/src/server/api.js` and run with `node dist/src/server/api.js`
 * (requires DATABASE_URL).
 *
 * Edge authentication is config-driven via AUTH_MODE (see src/http/composition.ts):
 * production deployments set AUTH_MODE=entra_jwt or trusted_headers so the adapter
 * does not trust unauthenticated request actors. The reusable, unit-tested logic
 * lives in src/http/runtime.ts and src/http/composition.ts; this file is a thin shell.
 */

import { buildConfigDiagnostics } from '../config/diagnostics.js';
import { loadConfig } from '../config/index.js';
import { closePool } from '../db/pool.js';
import { createPgAffiliationHttpServer } from '../http/composition.js';
import { listen, resolveApiRuntimeOptions, shutdown } from '../http/runtime.js';
import { createLogger } from '../shared/logging/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const options = resolveApiRuntimeOptions(config);
  const server = createPgAffiliationHttpServer();

  await listen(server, options.host, options.port);

  // Redacted operational summary (never includes connection strings/credentials).
  const diagnostics = buildConfigDiagnostics(config);
  logger.info('config diagnostics', { config: diagnostics.summary });
  for (const warning of diagnostics.warnings) {
    logger.warn('config warning', { warning });
  }

  const base = `http://${options.host}:${options.port}`;
  logger.info('AffiliationApplication API is listening', {
    baseUrl: base,
    health: `GET ${base}/healthz`,
    readiness: `GET ${base}/readyz`,
    transition: `POST ${base}/v1/affiliation/applications/:applicationId/transitions/:action`,
    authMode: config.auth.mode,
  });

  let shuttingDown = false;
  const handleSignal = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown signal received', { signal });
    shutdown({ server, closePool, log: (message) => logger.info(message) })
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error('shutdown failed', { err });
        process.exit(1);
      });
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

main().catch((error: unknown) => {
  createLogger().error('api failed to start', { err: error });
  process.exitCode = 1;
});
