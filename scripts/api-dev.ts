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
import { closePool } from '../src/db/pool.js';
import { createPgAffiliationHttpServer } from '../src/http/composition.js';
import { listen, resolveApiRuntimeOptions, shutdown } from '../src/http/runtime.js';

function log(message: string): void {
  console.log(`[api-dev] ${message}`);
}

async function main(): Promise<void> {
  const options = resolveApiRuntimeOptions(loadConfig());
  const server = createPgAffiliationHttpServer();

  await listen(server, options.host, options.port);

  const base = `http://${options.host}:${options.port}`;
  log('AffiliationApplication local/demo API is listening.');
  log(`  base URL     : ${base}`);
  log(`  health       : GET  ${base}/healthz`);
  log(`  readiness    : GET  ${base}/readyz   (shallow: process-level only)`);
  log(
    `  transition   : POST ${base}/v1/affiliation/applications/:applicationId/transitions/:action`,
  );
  log('  action ∈ submit|review_start|approve|reject|activate|suspend|reinstate|revoke|close|archive');
  log('  LOCAL/DEMO ONLY — no edge auth; do not expose this process publicly.');
  log('Press Ctrl+C to stop.');

  let shuttingDown = false;
  const handleSignal = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Received ${signal}; shutting down...`);
    shutdown({ server, closePool, log })
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
      });
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
