import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import {
  createPgStandingProjectionWorker,
  createPgAffiliationApplicationService,
} from '../../../src/http/composition.js';
import {
  PgStandingProjectionStore,
  deterministicStandingId,
} from '../../../src/domains/affiliation-standing/orchestration/index.js';
import { createPgStandingProjectionRuntime } from '../../../src/workers/standing-projection/composition.js';
import { loadConfig, type AppConfig } from '../../../src/config/index.js';
import { closePool, withTenantTransaction, type QueryClient } from '../../../src/db/pool.js';

/**
 * Integration tests for the activation → standing PROJECTION (Slice A) against a real PostgreSQL
 * database (schema affiliation_standing + RLS from migrations 0014/0015). GATED: runs only when
 * RUN_DB_TESTS=1 and DATABASE_URL are set; otherwise skipped so `npm test` stays hermetic. The
 * runtime connection (DATABASE_URL) MUST be a non-superuser, non-BYPASSRLS role so RLS holds.
 * Migrations (DDL) are applied via MIGRATE_DATABASE_URL. All data synthetic.
 *
 * These prove the cross-aggregate orchestration end-to-end: an activation outbox event is projected
 * into a governed standing opened ONLY through the kernel (state + head + period + outbox), the
 * projection is recorded 'projected', duplicate delivery is idempotent (no second standing), and
 * concurrent workers converge on ONE standing. Unique per-run tenants keep it dirty-DB immune.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const SEASON = '2025-26';

async function applyMigrations(): Promise<void> {
  const adminUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString: adminUrl });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ filename: string }>(
      'SELECT filename FROM public.schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.filename));
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations(filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    }
    // Ensure the DATABASE_URL-as-runtime role can reach the standing + projection objects (the
    // migrations grant only to `house_app`). Idempotent; mirrors the one-time manual provisioning.
    const runtimeUser = new URL(process.env.DATABASE_URL ?? '').username;
    if (runtimeUser !== '') {
      const role = `"${runtimeUser.replace(/"/gu, '""')}"`;
      await client.query(`GRANT USAGE ON SCHEMA affiliation_standing TO ${role}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE ON affiliation_standing.affiliation_standing TO ${role}`,
      );
      await client.query(
        `GRANT SELECT, INSERT ON affiliation_standing.standing_period TO ${role}`,
      );
      await client.query(`GRANT SELECT, INSERT ON affiliation_standing.standing_event TO ${role}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE ON affiliation_standing.standing_projection TO ${role}`,
      );
      await client.query(
        `GRANT EXECUTE ON FUNCTION affiliation_standing.list_pending_standing_activations(integer) TO ${role}`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

/** Seed an affiliation application (with an org subject) and an activation outbox event for it. */
async function seedActivatedApplication(
  tenantId: string,
  o: { applicationId?: string; subjectId?: string; season?: string } = {},
): Promise<{ applicationId: string; subjectId: string; season: string }> {
  const applicationId = o.applicationId ?? randomUUID();
  const subjectId = o.subjectId ?? randomUUID();
  const season = o.season ?? SEASON;
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    await c.query(
      `INSERT INTO affiliation.affiliation_application
         (id, tenant_id, season_id, organization_id)
       VALUES ($1, $2, $3, $4)`,
      [applicationId, tenantId, season, subjectId],
    );
    await c.query(
      `INSERT INTO governance.outbox_message
         (tenant_id, message_type, payload, dedupe_key, correlation_id, causation_id, status)
       VALUES ($1, 'AffiliationApplication.activate', $2::jsonb, $3, $4, $5, 'processed')`,
      [
        tenantId,
        JSON.stringify({
          entityType: 'AffiliationApplication',
          entityId: applicationId,
          trigger: 'activate',
          fromState: 'approved',
          toState: 'active',
          stateTransitionId: randomUUID(),
        }),
        `AffiliationApplication:${applicationId}:${randomUUID()}`,
        randomUUID(),
        randomUUID(),
      ],
    );
  });
  return { applicationId, subjectId, season };
}

async function countStandingHeads(tenantId: string, standingId: string): Promise<number> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM affiliation_standing.affiliation_standing WHERE id = $1`,
      [standingId],
    ),
  );
  return rows[0]!.n;
}

async function countPeriods(tenantId: string, standingId: string): Promise<number> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM affiliation_standing.standing_period WHERE standing_id = $1`,
      [standingId],
    ),
  );
  return rows[0]!.n;
}

async function standingState(tenantId: string, standingId: string): Promise<string | undefined> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ current_state: string }>(
      `SELECT current_state FROM governance.entity_state
        WHERE entity_id = $1 AND entity_type = 'AffiliationStanding'`,
      [standingId],
    ),
  );
  return rows[0]?.current_state;
}

async function countStandingOpenOutbox(tenantId: string, standingId: string): Promise<number> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM governance.outbox_message
        WHERE message_type = 'AffiliationStanding.open' AND payload->>'entityId' = $1`,
      [standingId],
    ),
  );
  return rows[0]!.n;
}

/** A run-once AppConfig for the runtime host: reuses the ambient (DATABASE_URL-backed) config but
 * forces a single-batch drain so the host shuts itself down deterministically in tests. */
function runOnceConfig(): AppConfig {
  const cfg = loadConfig();
  return {
    ...cfg,
    standingProjectionWorker: { ...cfg.standingProjectionWorker, runOnce: true },
  };
}

d('AffiliationStanding activation projection (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it('projects an activated application into a governed standing opened through the kernel', async () => {
    const tenantId = randomUUID();
    const { applicationId, subjectId, season } = await seedActivatedApplication(tenantId);
    const standingId = deterministicStandingId(tenantId, subjectId, season);

    const summary = await createPgStandingProjectionWorker().processBatch();
    expect(summary.projected).toBeGreaterThanOrEqual(1);

    // Standing opened ONLY through the kernel: head + v1 period + governed 'pending' state + outbox.
    expect(await countStandingHeads(tenantId, standingId)).toBe(1);
    expect(await countPeriods(tenantId, standingId)).toBe(1);
    expect(await standingState(tenantId, standingId)).toBe('pending');
    expect(await countStandingOpenOutbox(tenantId, standingId)).toBe(1);

    // Reconcilable bookkeeping records success; nothing left unreconciled for this application.
    const projections = new PgStandingProjectionStore();
    const proj = await projections.getByApplication(tenantId, applicationId);
    expect(proj?.status).toBe('projected');
    expect(proj?.standingId).toBe(standingId);
    expect(proj?.projectedAtMs).toBeDefined();
  });

  it('is idempotent under duplicate delivery: a second batch creates no second standing', async () => {
    const tenantId = randomUUID();
    const { subjectId, season } = await seedActivatedApplication(tenantId);
    const standingId = deterministicStandingId(tenantId, subjectId, season);

    await createPgStandingProjectionWorker().processBatch();
    await createPgStandingProjectionWorker().processBatch();

    expect(await countStandingHeads(tenantId, standingId)).toBe(1);
    expect(await countPeriods(tenantId, standingId)).toBe(1);
    expect(await countStandingOpenOutbox(tenantId, standingId)).toBe(1);
  });

  it('is concurrency-safe: two parallel workers converge on ONE standing', async () => {
    const tenantId = randomUUID();
    const { applicationId, subjectId, season } = await seedActivatedApplication(tenantId);
    const standingId = deterministicStandingId(tenantId, subjectId, season);

    await Promise.all([
      createPgStandingProjectionWorker().processBatch(),
      createPgStandingProjectionWorker().processBatch(),
    ]);

    expect(await countStandingHeads(tenantId, standingId)).toBe(1);
    expect(await countPeriods(tenantId, standingId)).toBe(1);
    expect(await countStandingOpenOutbox(tenantId, standingId)).toBe(1);

    // A reconciling pass settles the projection to 'projected'.
    await createPgStandingProjectionWorker().processBatch();
    const proj = await new PgStandingProjectionStore().getByApplication(tenantId, applicationId);
    expect(proj?.status).toBe('projected');
  });

  it('does not project an activation whose application has no resolvable subject', async () => {
    const tenantId = randomUUID();
    const applicationId = randomUUID();
    // Seed an application with NO org/scope subject + its activation event.
    await withTenantTransaction(tenantId, async (c: QueryClient) => {
      await c.query(
        `INSERT INTO affiliation.affiliation_application (id, tenant_id, season_id)
         VALUES ($1, $2, $3)`,
        [applicationId, tenantId, SEASON],
      );
      await c.query(
        `INSERT INTO governance.outbox_message
           (tenant_id, message_type, payload, dedupe_key, status)
         VALUES ($1, 'AffiliationApplication.activate', $2::jsonb, $3, 'processed')`,
        [
          tenantId,
          JSON.stringify({ entityType: 'AffiliationApplication', entityId: applicationId }),
          `AffiliationApplication:${applicationId}:${randomUUID()}`,
        ],
      );
    });

    await createPgStandingProjectionWorker().processBatch();

    // No subject → no deterministic identity → the discovery function excludes it; no projection.
    const proj = await new PgStandingProjectionStore().getByApplication(tenantId, applicationId);
    expect(proj).toBeUndefined();
  });

  it('surfaces the runtime role as non-superuser / non-BYPASSRLS (RLS enforced)', async () => {
    // The application service shares the same runtime pool; confirm the RLS posture holds.
    void createPgAffiliationApplicationService();
    const rows = await withTenantTransaction(randomUUID(), (c: QueryClient) =>
      c.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
      ),
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  // --- Runtime host (StandingProjectionRuntime) drives the SAME governed projection end-to-end ---

  it('projects an activated application when driven through the run-once runtime host', async () => {
    const tenantId = randomUUID();
    const { applicationId, subjectId, season } = await seedActivatedApplication(tenantId);
    const standingId = deterministicStandingId(tenantId, subjectId, season);

    // Build a run-once host over the shared pool. ownsPool:false so shutdown does NOT close the
    // pool the afterAll hook owns. start() drains exactly one batch then shuts down.
    const runtime = createPgStandingProjectionRuntime(runOnceConfig(), {
      log: () => {},
      onError: () => {},
      ownsPool: false,
    });
    await runtime.start();

    // Same governed invariants as the direct-worker path: opened ONLY through the kernel.
    expect(await countStandingHeads(tenantId, standingId)).toBe(1);
    expect(await countPeriods(tenantId, standingId)).toBe(1);
    expect(await standingState(tenantId, standingId)).toBe('pending');
    expect(await countStandingOpenOutbox(tenantId, standingId)).toBe(1);

    const proj = await new PgStandingProjectionStore().getByApplication(tenantId, applicationId);
    expect(proj?.status).toBe('projected');
    expect(proj?.standingId).toBe(standingId);

    // The host tallied the batch and reports ready-then-shutdown via its health snapshot.
    const health = runtime.health();
    expect(health.totals.batches).toBe(1);
    expect(health.totals.projected).toBeGreaterThanOrEqual(1);
    expect(health.ready).toBe(false); // run-once host shuts itself down after the batch
    expect(health.shuttingDown).toBe(true);
  });

  it('is idempotent when the run-once runtime host runs twice (no second standing)', async () => {
    const tenantId = randomUUID();
    const { subjectId, season } = await seedActivatedApplication(tenantId);
    const standingId = deterministicStandingId(tenantId, subjectId, season);

    await createPgStandingProjectionRuntime(runOnceConfig(), {
      log: () => {},
      onError: () => {},
      ownsPool: false,
    }).start();
    await createPgStandingProjectionRuntime(runOnceConfig(), {
      log: () => {},
      onError: () => {},
      ownsPool: false,
    }).start();

    expect(await countStandingHeads(tenantId, standingId)).toBe(1);
    expect(await countPeriods(tenantId, standingId)).toBe(1);
    expect(await countStandingOpenOutbox(tenantId, standingId)).toBe(1);
  });
});

