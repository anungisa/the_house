/**
 * Local/demo API runtime entrypoint.
 *
 * Starts the native HTTP AffiliationApplication adapter wired to the PRODUCTION-intended
 * Pg-backed composition root, listens on API_HOST/API_PORT, and shuts down gracefully on
 * SIGINT/SIGTERM. Run with: `npm run dev:api` (requires DATABASE_URL).
 *
 * LOCAL/DEMO ONLY — no edge authentication. The adapter trusts the parsed actor/tenantId
 * in each request; a real deployment must terminate auth in a gateway/identity layer.
 *
 * The reusable, unit-tested logic lives in src/http/runtime.ts; this file is a thin shell.
 */

import { loadConfig } from '../src/config/index.js';
import { buildConfigDiagnostics } from '../src/config/diagnostics.js';
import { closePool } from '../src/db/pool.js';
import { createPgAffiliationHttpServer } from '../src/http/composition.js';
import { listen, resolveApiRuntimeOptions, shutdown } from '../src/http/runtime.js';
import { createLogger } from '../src/shared/logging/logger.js';

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
  logger.info('AffiliationApplication local/demo API is listening', {
    baseUrl: base,
    health: `GET ${base}/healthz`,
    readiness: `GET ${base}/readyz`,
    transition: `POST ${base}/v1/affiliation/applications/:applicationId/transitions/:action`,
    note: 'LOCAL/DEMO ONLY — no edge auth; do not expose this process publicly.',
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
  createLogger().error('api-dev failed to start', { err: error });
  process.exitCode = 1;
});
