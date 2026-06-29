import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { PgOutboxStore } from '../../../src/governance/outbox/PgOutboxStore.js';

/**
 * Gated PostgreSQL integration tests for the OUTBOX WORKER path (PgOutboxStore +
 * migration 0004 SECURITY DEFINER functions).
 *
 * These validate that a dedicated, NON-superuser, NON-BYPASSRLS worker role can claim /
 * lease / process / recover outbox rows ACROSS tenants WITHOUT direct table access and
 * WITHOUT weakening tenant RLS for the normal application role.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so
 * the default `npm test` stays hermetic.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates
 * two least-privilege roles (idempotent, re-runnable):
 *   * house_outbox_worker_test  — LOGIN, NOSUPERUSER, NOBYPASSRLS, owns no tables,
 *                                 EXECUTE on the 6 worker functions only, NO table grants.
 *   * house_app_outbox_test     — a normal app role: SELECT/INSERT/UPDATE on
 *                                 governance.outbox_message + EXECUTE current_tenant_id(),
 *                                 RLS-confined, NO access to the worker functions.
 * Worker/app connection strings are derived from the admin URL (host/port/db) with the
 * provisioned credentials. OUTBOX_DATABASE_URL, if set, overrides the base for the worker
 * connection (production worker endpoint).
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const WORKER_ROLE = 'house_outbox_worker_test';
const WORKER_PW = 'worker_pw';
const APP_ROLE = 'house_app_outbox_test';
const APP_PW = 'app_pw';

const WORKER_FUNCTIONS: ReadonlyArray<string> = [
  'governance.claim_outbox_messages(integer, text, integer)',
  'governance.mark_outbox_processed(uuid, text)',
  'governance.reschedule_outbox_message(uuid, integer, text)',
  'governance.mark_outbox_failed(uuid, text)',
  'governance.recover_expired_outbox_messages()',
  'governance.get_outbox_message(uuid)',
];

/** Build a connection string from a base URL, swapping in role credentials. */
function deriveUrl(base: string, user: string, password: string): string {
  const u = new URL(base);
  u.username = user;
  u.password = password;
  return u.toString();
}

/** Apply migrations idempotently using the admin connection (DDL needs privileges). */
async function applyMigrations(admin: pg.Pool): Promise<void> {
  const client = await admin.connect();
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
  } finally {
    client.release();
  }
}

/** Provision the least-privilege worker and app roles (idempotent). */
async function provisionRoles(admin: pg.Pool): Promise<void> {
  // Worker role: LOGIN, NOSUPERUSER, NOBYPASSRLS, owns nothing, EXECUTE-only on functions.
  await admin.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${WORKER_ROLE}') THEN
        ALTER ROLE ${WORKER_ROLE} WITH LOGIN PASSWORD '${WORKER_PW}'
          NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      ELSE
        CREATE ROLE ${WORKER_ROLE} WITH LOGIN PASSWORD '${WORKER_PW}'
          NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF;
    END $$;
  `);
  // Ensure the worker role has NO direct table privileges (narrow access, re-run safe).
  await admin.query(
    `REVOKE ALL ON ALL TABLES IN SCHEMA governance FROM ${WORKER_ROLE}`,
  );
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${WORKER_ROLE}`);
  for (const fn of WORKER_FUNCTIONS) {
    await admin.query(`GRANT EXECUTE ON FUNCTION ${fn} TO ${WORKER_ROLE}`);
  }

  // Normal app role: RLS-confined table access, NO worker-function access.
  await admin.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        ALTER ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${APP_PW}'
          NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      ELSE
        CREATE ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${APP_PW}'
          NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF;
    END $$;
  `);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON governance.outbox_message TO ${APP_ROLE}`,
  );
  await admin.query(
    `GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`,
  );
}

interface SeedOpts {
  tenantId?: string;
  status?: 'pending' | 'processing' | 'processed' | 'failed';
  nextAttemptOffsetSec?: number;
  lockedUntilOffsetSec?: number;
  lockedBy?: string;
  retryCount?: number;
  maxRetries?: number;
  messageType?: string;
}

/** Seed an outbox row via the admin connection (bypasses RLS as the migration role). */
async function seedOutbox(admin: pg.Pool, opts: SeedOpts = {}): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `INSERT INTO governance.outbox_message
       (tenant_id, message_type, payload, status, retry_count, max_retries,
        dedupe_key, next_attempt_at, locked_until, locked_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,
             now() + make_interval(secs => $8),
             CASE WHEN $9::int IS NULL THEN NULL ELSE now() + make_interval(secs => $9) END,
             $10)
     RETURNING id`,
    [
      opts.tenantId ?? TENANT_A,
      opts.messageType ?? 'AffiliationApplication.test',
      JSON.stringify({ marker: randomUUID() }),
      opts.status ?? 'pending',
      opts.retryCount ?? 0,
      opts.maxRetries ?? 10,
      randomUUID(),
      opts.nextAttemptOffsetSec ?? -10,
      opts.lockedUntilOffsetSec ?? null,
      opts.lockedBy ?? null,
    ],
  );
  return rows[0]!.id;
}

/** Read a single row via the admin connection (no RLS confinement). */
async function adminGet(
  admin: pg.Pool,
  id: string,
): Promise<{
  status: string;
  retry_count: number;
  locked_by: string | null;
  locked_until: Date | null;
  next_attempt_at: Date;
  processed_at: Date | null;
  published_message_id: string | null;
  error: string | null;
} | undefined> {
  const { rows } = await admin.query(
    `SELECT status, retry_count, locked_by, locked_until, next_attempt_at,
            processed_at, published_message_id, error
       FROM governance.outbox_message WHERE id = $1`,
    [id],
  );
  return rows[0];
}

d('PgOutboxStore worker integration (SECURITY DEFINER, least-privilege role)', () => {
  let admin: pg.Pool;
  let workerPool: pg.Pool;
  let workerPool2: pg.Pool;
  let appPool: pg.Pool;
  let store: PgOutboxStore;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await applyMigrations(admin);
    await provisionRoles(admin);
    // Start from a clean outbox so claim-ordering/concurrency assertions are deterministic
    // across re-runs (claimBatch operates globally across all tenants).
    await admin.query('TRUNCATE governance.outbox_message');

    const workerBase = process.env.OUTBOX_DATABASE_URL ?? ADMIN_URL;
    const workerUrl = deriveUrl(workerBase, WORKER_ROLE, WORKER_PW);
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);

    workerPool = new pg.Pool({ connectionString: workerUrl });
    workerPool2 = new pg.Pool({ connectionString: workerUrl });
    appPool = new pg.Pool({ connectionString: appUrl });
    store = new PgOutboxStore(workerPool);
  });

  afterAll(async () => {
    await Promise.all([
      admin?.end(),
      workerPool?.end(),
      workerPool2?.end(),
      appPool?.end(),
    ]);
  });

  // (1) Migrations apply cleanly: the 6 worker functions exist.
  it('installs the 6 SECURITY DEFINER worker functions', async () => {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'governance'
          AND p.prosecdef = true
          AND p.proname IN ('claim_outbox_messages','mark_outbox_processed',
                            'reschedule_outbox_message','mark_outbox_failed',
                            'recover_expired_outbox_messages','get_outbox_message')`,
    );
    expect(rows[0]!.n).toBe(6);
  });

  // (2) Worker role is not superuser and does not bypass RLS.
  it('worker role is NOSUPERUSER and NOBYPASSRLS', async () => {
    const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [WORKER_ROLE],
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  // (3) Worker role owns no governance tables.
  it('worker role owns no governance tables', async () => {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_class c
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
         JOIN pg_roles r ON r.oid = c.relowner
        WHERE ns.nspname = 'governance' AND c.relkind = 'r' AND r.rolname = $1`,
      [WORKER_ROLE],
    );
    expect(rows[0]!.n).toBe(0);
  });

  // (4) Normal app role cannot claim, nor read cross-tenant rows directly.
  it('normal app role cannot call the worker claim function (no EXECUTE grant)', async () => {
    await expect(
      appPool.query(`SELECT * FROM governance.claim_outbox_messages(10, 'x', 60)`),
    ).rejects.toMatchObject({ code: '42501' }); // insufficient_privilege
  });

  it('normal app role reads are RLS-confined to its own tenant (no cross-tenant read)', async () => {
    await seedOutbox(admin, { tenantId: TENANT_A });
    await seedOutbox(admin, { tenantId: TENANT_B });
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', TENANT_A]);
      const a = await client.query(
        `SELECT count(*)::int AS n FROM governance.outbox_message WHERE tenant_id = $1`,
        [TENANT_A],
      );
      const b = await client.query(
        `SELECT count(*)::int AS n FROM governance.outbox_message WHERE tenant_id = $1`,
        [TENANT_B],
      );
      await client.query('COMMIT');
      expect(Number(a.rows[0].n)).toBeGreaterThan(0);
      expect(Number(b.rows[0].n)).toBe(0); // tenant B hidden by RLS
    } finally {
      client.release();
    }
  });

  // (5)(6)(7) Worker can claim a pending row; it becomes processing with the lease set.
  it('claims a pending row, sets status=processing and the lease fields', async () => {
    const id = await seedOutbox(admin, { tenantId: TENANT_A, nextAttemptOffsetSec: -5 });
    const claimed = await store.claimBatch('worker-1', 50, 60_000);
    const mine = claimed.find((r) => r.id === id);
    expect(mine).toBeDefined();
    expect(mine!.status).toBe('processing');
    expect(mine!.lockedBy).toBe('worker-1');
    expect(mine!.lockedUntil).toBeGreaterThan(Date.now());

    const row = await adminGet(admin, id);
    expect(row!.status).toBe('processing');
    expect(row!.locked_by).toBe('worker-1');
    expect(row!.locked_until).not.toBeNull();
  });

  // (8) Two concurrent workers cannot both claim the same row.
  it('concurrent workers cannot claim the same row twice', async () => {
    // Isolate: exactly one claimable row exists across all tenants.
    await admin.query('TRUNCATE governance.outbox_message');
    const id = await seedOutbox(admin, { tenantId: TENANT_A, nextAttemptOffsetSec: -5 });
    const store2 = new PgOutboxStore(workerPool2);
    const [a, b] = await Promise.all([
      store.claimBatch('w-a', 1, 60_000),
      store2.claimBatch('w-b', 1, 60_000),
    ]);
    const claimsForRow =
      a.filter((r) => r.id === id).length + b.filter((r) => r.id === id).length;
    expect(claimsForRow).toBe(1);
  });

  // (9) Processed row is marked processed with processed_at + published_message_id.
  it('marks a row processed with processed_at and published_message_id', async () => {
    const id = await seedOutbox(admin, { tenantId: TENANT_A, nextAttemptOffsetSec: -5 });
    await store.claimBatch('worker-1', 50, 60_000);
    await store.markProcessed(id, 'broker-msg-123');
    const row = await adminGet(admin, id);
    expect(row!.status).toBe('processed');
    expect(row!.processed_at).not.toBeNull();
    expect(row!.published_message_id).toBe('broker-msg-123');
    expect(row!.locked_by).toBeNull();
  });

  // (10) Transient failure increments retry_count and pushes next_attempt_at out.
  it('reschedules a transient failure: retry_count++ and future next_attempt_at', async () => {
    const id = await seedOutbox(admin, { tenantId: TENANT_A, nextAttemptOffsetSec: -5 });
    await store.claimBatch('worker-1', 50, 60_000);
    await store.reschedule(id, 30_000, 'transient: broker throttled');
    const row = await adminGet(admin, id);
    expect(row!.status).toBe('pending');
    expect(row!.retry_count).toBe(1);
    expect(row!.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
    expect(row!.error).toMatch(/transient/);
    expect(row!.locked_by).toBeNull();
  });

  // (11) Max-retry / permanent failure marks the row failed.
  it('marks a row failed permanently', async () => {
    const id = await seedOutbox(admin, { tenantId: TENANT_A, nextAttemptOffsetSec: -5 });
    await store.claimBatch('worker-1', 50, 60_000);
    await store.markFailed(id, 'permanent: bad payload');
    const row = await adminGet(admin, id);
    expect(row!.status).toBe('failed');
    expect(row!.error).toMatch(/permanent/);
    expect(row!.locked_by).toBeNull();
  });

  // (12) Expired processing lease can be recovered to pending.
  it('recovers an expired processing lease back to pending', async () => {
    const id = await seedOutbox(admin, {
      tenantId: TENANT_A,
      status: 'processing',
      lockedUntilOffsetSec: -60, // lease already expired
      lockedBy: 'dead-worker',
    });
    const recovered = await store.recoverExpiredLeases();
    expect(recovered).toBeGreaterThanOrEqual(1);
    const row = await adminGet(admin, id);
    expect(row!.status).toBe('pending');
    expect(row!.locked_by).toBeNull();
    expect(row!.locked_until).toBeNull();
  });

  // (13) Claim selects rows ordered by next_attempt_at / created_at consistently.
  it('claims the earliest-due rows first (ordering is consistent)', async () => {
    // Isolate: only these three due rows exist, so the global claim is deterministic.
    await admin.query('TRUNCATE governance.outbox_message');
    const tenant = randomUUID();
    const oldest = await seedOutbox(admin, { tenantId: tenant, nextAttemptOffsetSec: -300 });
    const middle = await seedOutbox(admin, { tenantId: tenant, nextAttemptOffsetSec: -200 });
    const newest = await seedOutbox(admin, { tenantId: tenant, nextAttemptOffsetSec: -100 });

    // Claim only 2 of the 3 due rows; the two earliest must be selected.
    const claimed = await store.claimBatch('order-worker', 2, 60_000);
    const claimedIds = new Set(claimed.map((r) => r.id));
    expect(claimedIds.has(oldest)).toBe(true);
    expect(claimedIds.has(middle)).toBe(true);

    const newestRow = await adminGet(admin, newest);
    expect(newestRow!.status).toBe('pending'); // latest left behind
  });

  // (14) Worker role has no direct access to governed tables beyond the functions.
  // Under FORCE RLS the policy qual (current_tenant_id()) fails closed before a
  // permission-denied would surface, so we assert the authoritative facts: the worker
  // holds NO direct table privileges (only EXECUTE on the 6 functions), and any direct
  // table read fails closed (never returns rows).
  it('worker role holds NO direct table privileges on governed tables', async () => {
    const { rows } = await admin.query<{
      outbox_select: boolean;
      outbox_insert: boolean;
      outbox_update: boolean;
      entity_select: boolean;
    }>(
      `SELECT
         has_table_privilege($1,'governance.outbox_message','SELECT') AS outbox_select,
         has_table_privilege($1,'governance.outbox_message','INSERT') AS outbox_insert,
         has_table_privilege($1,'governance.outbox_message','UPDATE') AS outbox_update,
         has_table_privilege($1,'governance.entity_state','SELECT')   AS entity_select`,
      [WORKER_ROLE],
    );
    expect(rows[0]!.outbox_select).toBe(false);
    expect(rows[0]!.outbox_insert).toBe(false);
    expect(rows[0]!.outbox_update).toBe(false);
    expect(rows[0]!.entity_select).toBe(false);
  });

  it('worker direct table reads fail closed (no rows leaked outside the functions)', async () => {
    await expect(
      workerPool.query(`SELECT 1 FROM governance.outbox_message LIMIT 1`),
    ).rejects.toThrow();
    await expect(
      workerPool.query(`SELECT 1 FROM governance.entity_state LIMIT 1`),
    ).rejects.toThrow();
  });

  // (15) Normal app-role RLS remains intact: fails closed with no tenant context.
  it('app role fails closed on outbox reads when no tenant context is set', async () => {
    await expect(
      appPool.query(`SELECT count(*) FROM governance.outbox_message`),
    ).rejects.toThrow(/TENANT_CONTEXT_MISSING/);
  });

  it('app role is NOSUPERUSER and NOBYPASSRLS (RLS genuinely enforced)', async () => {
    const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });
});
