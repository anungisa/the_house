/**
 * Local/demo seed entrypoint for one AffiliationApplication.
 *
 * Inserts the minimal persisted DOMAIN facts (+ an initial `draft` governed state) needed
 * for a successful `submit` transition. Idempotent: safe to re-run. Run with:
 *   `npm run demo:seed:affiliation`
 *
 * Connection: prefers DEMO_DATABASE_URL, then DATABASE_URL. A least-privilege runtime role
 * is sufficient (only SELECT/INSERT/UPDATE are used). Migrations must already be applied.
 *
 * GOVERNANCE: this script performs NO transition and seeds NO future lifecycle state. It
 * writes only the initial 'draft' entity_state (ON CONFLICT DO NOTHING — never advancing).
 * NSO-GENERIC: no Curling Canada data; demo IDs/values are sport-agnostic.
 */

import pg from 'pg';
import { withTenantTransaction } from '../src/db/pool.js';
import { resolveDemoIds, runAffiliationDemoSeed } from '../src/http/demo/affiliationDemoSeed.js';

function log(message: string): void {
  console.log(`[demo:seed] ${message}`);
}

async function main(): Promise<void> {
  const databaseUrl = (process.env.DEMO_DATABASE_URL ?? process.env.DATABASE_URL ?? '').trim();
  if (databaseUrl === '') {
    console.error('[demo:seed] DEMO_DATABASE_URL or DATABASE_URL must be set. Nothing to do.');
    process.exitCode = 1;
    return;
  }

  const ids = resolveDemoIds();
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    log(`tenant=${ids.tenantId} application=${ids.applicationId} season=${ids.seasonId}`);
    // Tenant context is set transaction-locally so RLS is satisfied for affiliation/governed rows.
    await withTenantTransaction(ids.tenantId, (client) => runAffiliationDemoSeed(client, ids, log), pool);
    log('Demo affiliation facts + initial draft state are ready.');
    log(`Submit it: POST /v1/affiliation/applications/${ids.applicationId}/transitions/submit`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
