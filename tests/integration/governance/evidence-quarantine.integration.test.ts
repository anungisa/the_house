import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgEvidenceQuarantineStore } from '../../../src/governance/evidence/quarantine/PgEvidenceQuarantineStore.js';
import { EvidenceQuarantineService } from '../../../src/governance/evidence/quarantine/EvidenceQuarantineService.js';
import { EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE } from '../../../src/governance/evidence/quarantine/EvidenceQuarantineTypes.js';
import {
  handleEvidenceUpload,
  type EvidenceHttpDeps,
  type EvidenceUploadService,
} from '../../../src/http/evidence/EvidenceHttpAdapter.js';
import { InMemoryEvidenceStorage } from '../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../src/governance/evidence/GovernanceEvidenceService.js';
import { sha256Hex } from '../../../src/governance/evidence/EvidenceHasher.js';
import {
  createEvidenceMalwareScanner,
  EICAR_TEST_SIGNATURE,
} from '../../../src/governance/evidence/scanning/index.js';
import { DemoAuthContextResolver } from '../../../src/http/auth/DemoAuthContextResolver.js';
import { fixedClock } from '../../../src/shared/time/clock.js';

/**
 * Gated PostgreSQL integration tests for the EVIDENCE QUARANTINE workflow (migration 0007 +
 * PgEvidenceQuarantineStore + EvidenceQuarantineService).
 *
 * These prove, against REAL PostgreSQL, that a blocked malware upload becomes sanitized,
 * tenant-isolated SECURITY metadata plus an `evidence.quarantine.recorded` outbox event —
 * recorded and emitted ATOMICALLY, under FORCE Row-Level Security, by a NON-superuser,
 * NON-BYPASSRLS application role — WITHOUT storing raw payload bytes and WITHOUT touching any
 * governed lifecycle table (entity_state / state_transition / audit_event / evidence_object).
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, antivirus, or external
 * scanner is contacted — the local deterministic signature scanner (harmless EICAR test
 * signature) drives the one HTTP-path case.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege role (idempotent, re-runnable):
 *   * house_app_quarantine_test — LOGIN, NOSUPERUSER, NOBYPASSRLS; SELECT/INSERT/UPDATE on
 *     governance.evidence_quarantine_event + governance.outbox_message; EXECUTE
 *     current_tenant_id(). No DELETE, no superuser, no BYPASSRLS. RLS-confined.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Suite-specific tenant UUIDs (distinct from other integration suites to avoid cross-suite
// interference when the gated suites share a database).
const TENANT_A = '7c000000-0000-4000-8000-0000000000a1';
const TENANT_B = '7c000000-0000-4000-8000-0000000000b2';

const APP_ROLE = 'house_app_quarantine_test';
const APP_PW = 'quar_app_pw';

const DEMO = new DemoAuthContextResolver();

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

/** Provision the least-privilege application role (idempotent, re-run safe). */
async function provisionRole(admin: pg.Pool): Promise<void> {
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
  // Least privilege: SELECT/INSERT/UPDATE on the quarantine table + the shared outbox; the
  // quarantine path writes both in one transaction. No DELETE / TRUNCATE anywhere.
  await admin.query(`REVOKE ALL ON governance.evidence_quarantine_event FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON governance.outbox_message FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON governance.evidence_quarantine_event TO ${APP_ROLE}`,
  );
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON governance.outbox_message TO ${APP_ROLE}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

/** Count rows for the suite's tenants in a tenant-owned table (admin bypasses RLS). */
async function countForTenants(admin: pg.Pool, table: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = ANY($1::uuid[])`,
    [[TENANT_A, TENANT_B]],
  );
  return rows[0]!.n;
}

/** Read one quarantine row by id via the admin connection (no RLS confinement). */
async function adminGetQuarantine(
  admin: pg.Pool,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await admin.query(
    `SELECT * FROM governance.evidence_quarantine_event WHERE id = $1`,
    [id],
  );
  return rows[0];
}

/** Read the outbox row for a quarantine event by its stable dedupe key. */
async function adminGetOutboxByDedupe(
  admin: pg.Pool,
  dedupeKey: string,
): Promise<{ message_type: string; payload: Record<string, unknown>; tenant_id: string } | undefined> {
  const { rows } = await admin.query<{
    message_type: string;
    payload: Record<string, unknown>;
    tenant_id: string;
  }>(`SELECT message_type, payload, tenant_id FROM governance.outbox_message WHERE dedupe_key = $1`, [
    dedupeKey,
  ]);
  return rows[0];
}

const dedupeKeyFor = (eventId: string): string =>
  `${EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE}:${eventId}`;

interface BlockedInput {
  tenantId?: string;
  contentType?: string;
  sizeBytes?: number;
  contentHash?: string;
  scanStatus?: 'infected' | 'error' | 'skipped';
  scanner?: string;
  threatName?: string;
  uploadActorUserId?: string;
  requestId?: string;
  correlationId?: string;
}

d('evidence quarantine — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let service: EvidenceQuarantineService;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await applyMigrations(admin);
    await provisionRole(admin);

    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    // The store/service run as the restricted, RLS-confined role.
    service = new EvidenceQuarantineService(new PgEvidenceQuarantineStore(appPool), {
      maxRetries: 5,
    });
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    // Deterministic counts per test: remove only this suite's tenant rows (admin bypasses RLS).
    await admin.query(
      `DELETE FROM governance.evidence_quarantine_event WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  });

  const record = (o: BlockedInput = {}): Promise<{ quarantineEventId: string }> =>
    service.recordBlockedUpload({
      tenantId: o.tenantId ?? TENANT_A,
      contentType: o.contentType ?? 'application/pdf',
      sizeBytes: o.sizeBytes ?? 1234,
      contentHash: o.contentHash ?? sha256Hex(Buffer.from('fake-bytes')),
      scanStatus: o.scanStatus ?? 'infected',
      scanner: o.scanner ?? 'signature',
      ...(o.threatName !== undefined ? { threatName: o.threatName } : {}),
      ...(o.uploadActorUserId !== undefined ? { uploadActorUserId: o.uploadActorUserId } : {}),
      ...(o.requestId !== undefined ? { requestId: o.requestId } : {}),
      ...(o.correlationId !== undefined ? { correlationId: o.correlationId } : {}),
    });

  // (1)(2) Migration 0007 applied and the quarantine table exists.
  it('applies migration 0007 and creates governance.evidence_quarantine_event', async () => {
    const { rows: mig } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.schema_migrations WHERE filename = $1`,
      ['0007_evidence_quarantine.sql'],
    );
    expect(mig[0]!.n).toBe(1);

    const { rows } = await admin.query<{ reg: string | null }>(
      `SELECT to_regclass('governance.evidence_quarantine_event')::text AS reg`,
    );
    expect(rows[0]!.reg).toBe('governance.evidence_quarantine_event');
  });

  // (3) Table has FORCE RLS enabled.
  it('has ROW LEVEL SECURITY enabled AND forced', async () => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'governance' AND c.relname = 'evidence_quarantine_event'`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // (4)(5) Restricted app role is not superuser and does not bypass RLS.
  it('restricted app role is NOSUPERUSER and NOBYPASSRLS', async () => {
    const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  // (16) App-role grants on the quarantine table are limited to SELECT/INSERT/UPDATE (no DELETE).
  it('grants the app role only SELECT/INSERT/UPDATE on the quarantine table (no DELETE)', async () => {
    const { rows } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'governance'
          AND table_name = 'evidence_quarantine_event'`,
      [APP_ROLE],
    );
    const privileges = new Set(rows.map((r) => r.privilege_type));
    expect(privileges).toEqual(new Set(['SELECT', 'INSERT', 'UPDATE']));
    expect(privileges.has('DELETE')).toBe(false);
    expect(privileges.has('TRUNCATE')).toBe(false);
  });

  // (6)(10) Restricted role records a quarantine event with sanitized metadata.
  it('records a quarantine event through PgEvidenceQuarantineStore (restricted role)', async () => {
    const hash = sha256Hex(Buffer.from('infected-doc-bytes'));
    const { quarantineEventId } = await record({
      contentType: 'text/plain',
      sizeBytes: 4096,
      contentHash: hash,
      scanStatus: 'infected',
      scanner: 'signature',
      threatName: 'EICAR-Test-Signature',
      uploadActorUserId: 'records-officer-7',
      requestId: 'req-int-1',
    });

    const row = await adminGetQuarantine(admin, quarantineEventId);
    expect(row).toBeDefined();
    expect(row!['tenant_id']).toBe(TENANT_A);
    expect(row!['content_hash']).toBe(hash);
    expect(row!['content_type']).toBe('text/plain');
    expect(row!['size_bytes']).toBe(4096);
    expect(row!['scanner']).toBe('signature');
    expect(row!['scan_status']).toBe('infected');
    expect(row!['threat_name']).toBe('EICAR-Test-Signature');
    expect(row!['quarantine_status']).toBe('recorded');
  });

  // (11) No raw payload bytes are stored: the table has no byte-bearing column by design.
  it('stores no raw payload bytes (no bytea / payload column on the table)', async () => {
    const { rows } = await admin.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'governance' AND table_name = 'evidence_quarantine_event'`,
    );
    expect(rows.some((c) => c.data_type === 'bytea')).toBe(false);
    const names = rows.map((c) => c.column_name);
    expect(names).not.toContain('payload');
    expect(names).not.toContain('content');
    expect(names).not.toContain('bytes');
    // The retained digest column IS present (a hash, never the bytes).
    expect(names).toContain('content_hash');
  });

  // (7) Restricted role can SELECT its own tenant's quarantine event (RLS allows same-tenant).
  it('lets the app role read its own tenant quarantine event (RLS, same tenant)', async () => {
    const { quarantineEventId } = await record({ tenantId: TENANT_A });
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', TENANT_A]);
      const { rows } = await client.query(
        `SELECT id FROM governance.evidence_quarantine_event WHERE id = $1`,
        [quarantineEventId],
      );
      await client.query('COMMIT');
      expect(rows).toHaveLength(1);
    } finally {
      client.release();
    }
  });

  // (9) Tenant A cannot read tenant B's quarantine event (RLS isolation).
  it('hides tenant B quarantine events from tenant A (RLS isolation)', async () => {
    const { quarantineEventId: bId } = await record({ tenantId: TENANT_B });
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', TENANT_A]);
      const byId = await client.query(
        `SELECT id FROM governance.evidence_quarantine_event WHERE id = $1`,
        [bId],
      );
      const tenantBVisible = await client.query(
        `SELECT count(*)::int AS n FROM governance.evidence_quarantine_event WHERE tenant_id = $1`,
        [TENANT_B],
      );
      await client.query('COMMIT');
      expect(byId.rows).toHaveLength(0);
      expect(Number(tenantBVisible.rows[0].n)).toBe(0);
    } finally {
      client.release();
    }
  });

  // (8) Missing tenant context fails closed (current_tenant_id() raises P0001).
  it('fails closed when tenant context is missing', async () => {
    // INSERT without app.tenant_id set: the WITH CHECK policy evaluates current_tenant_id(),
    // which raises P0001 (TENANT_CONTEXT_MISSING).
    await expect(
      appPool.query(
        `INSERT INTO governance.evidence_quarantine_event
           (tenant_id, content_type, size_bytes, content_hash, scan_status, scanner)
         VALUES ($1, 'application/pdf', 1, 'h', 'infected', 'signature')`,
        [TENANT_A],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  // (12)(13) Recording emits a single sanitized evidence.quarantine.recorded outbox event.
  it('emits an evidence.quarantine.recorded outbox event without bytes, headers, or actor id', async () => {
    const hash = sha256Hex(Buffer.from('secret-infected-bytes-MARKER'));
    const { quarantineEventId } = await record({
      contentHash: hash,
      contentType: 'application/pdf',
      sizeBytes: 99,
      scanStatus: 'infected',
      scanner: 'signature',
      threatName: 'EICAR-Test-Signature',
      uploadActorUserId: 'secret-actor-id',
      requestId: 'req-secret',
    });

    const out = await adminGetOutboxByDedupe(admin, dedupeKeyFor(quarantineEventId));
    expect(out).toBeDefined();
    expect(out!.message_type).toBe(EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE);
    expect(out!.tenant_id).toBe(TENANT_A);

    const payload = out!.payload;
    // Sanitized correlation metadata IS present.
    expect(payload['quarantineEventId']).toBe(quarantineEventId);
    expect(payload['contentHash']).toBe(hash);
    expect(payload['scanStatus']).toBe('infected');
    // Defence-in-depth: NO raw bytes, NO upload-actor identity, NO request headers.
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('MARKER');
    expect(serialized).not.toContain('secret-actor-id');
    expect(payload['uploadActorUserId']).toBeUndefined();
    expect(payload['sourceFilename']).toBeUndefined();
  });

  // (14) The quarantine row and the outbox row are created in ONE transaction.
  it('creates the quarantine row and outbox row transactionally (both present)', async () => {
    const { quarantineEventId } = await record({ requestId: 'req-atomic' });
    const quar = await adminGetQuarantine(admin, quarantineEventId);
    const out = await adminGetOutboxByDedupe(admin, dedupeKeyFor(quarantineEventId));
    expect(quar).toBeDefined();
    expect(out).toBeDefined();
  });

  // (15) If the outbox insert fails, the quarantine insert does NOT silently succeed (atomic
  //      rollback) — proven by transiently revoking INSERT on the shared outbox table.
  it('rolls the quarantine row back when the outbox insert fails (no silent partial write)', async () => {
    const before = await countForTenants(admin, 'governance.evidence_quarantine_event');
    await admin.query(`REVOKE INSERT ON governance.outbox_message FROM ${APP_ROLE}`);
    try {
      await expect(record({ requestId: 'req-rollback' })).rejects.toMatchObject({ code: '42501' });
    } finally {
      await admin.query(`GRANT INSERT ON governance.outbox_message TO ${APP_ROLE}`);
    }
    const after = await countForTenants(admin, 'governance.evidence_quarantine_event');
    expect(after).toBe(before); // the quarantine row was rolled back with the failed outbox insert
  });

  // (17)(18)(19) Quarantine never mutates governed lifecycle tables.
  it('does not create or mutate any governed lifecycle row (entity_state/state_transition/audit_event/evidence_object)', async () => {
    const tables = [
      'governance.entity_state',
      'governance.state_transition',
      'governance.audit_event',
      'governance.evidence_object',
    ] as const;
    const before = await Promise.all(tables.map((t) => countForTenants(admin, t)));

    await record({ requestId: 'req-no-mutation', scanStatus: 'error', scanner: 'signature' });

    const after = await Promise.all(tables.map((t) => countForTenants(admin, t)));
    expect(after).toEqual(before);
    // All governed counts for this suite's tenants stay at zero — quarantine touches none.
    expect(after).toEqual([0, 0, 0, 0]);
  });

  // (20) The quarantine table carries no sport-specific column terminology.
  it('exposes no sport-specific column terminology (NSO-generic platform core)', async () => {
    const { rows } = await admin.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'governance' AND table_name = 'evidence_quarantine_event'`,
    );
    const SPORT = /curl|curler|bonspiel|hockey|skip|rink|sheet|athlete|coach|club|league|team|ptso/i;
    for (const { column_name } of rows) {
      expect(SPORT.test(column_name), `column ${column_name} leaks sport terminology`).toBe(false);
    }
  });

  // (E) HTTP upload path: an infected upload is rejected (422), quarantined (row + outbox
  //     event), and NEVER reaches evidence storage — driven through the real Pg-backed
  //     quarantine service and the local signature scanner.
  it('quarantines an infected HTTP upload end-to-end without storing the payload', async () => {
    const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
    const inner = new GovernanceEvidenceService(storage);
    let storeCalls = 0;
    const uploadService: EvidenceUploadService = {
      storeEvidencePayload: (i) => {
        storeCalls += 1;
        return inner.storeEvidencePayload(i);
      },
    };
    const deps: EvidenceHttpDeps = {
      uploadService,
      storage,
      maxUploadBytes: 1024,
      scanner: createEvidenceMalwareScanner(
        { mode: 'signature', required: false, testSignaturesEnabled: true },
        { clock: fixedClock(0) },
      ),
      scanRequired: false,
      quarantine: service,
      includeQuarantineEventIdInResponse: true,
    };

    const content = Buffer.concat([
      Buffer.from('UPLOAD-MARKER '),
      Buffer.from(EICAR_TEST_SIGNATURE.pattern),
    ]);
    const evidenceBefore = await countForTenants(admin, 'governance.evidence_object');

    const result = await handleEvidenceUpload(
      deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'records-officer-1',
          'x-house-actor-role-keys': 'records_officer',
          'content-type': 'text/plain',
        },
        content,
      },
      'req-http-infected',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(422);
    expect(result.body['code']).toBe('EVIDENCE_MALWARE_DETECTED');
    expect(storeCalls).toBe(0); // payload never reached evidence storage

    const quarantineEventId = result.body['quarantineEventId'] as string;
    expect(typeof quarantineEventId).toBe('string');

    // A quarantine row + outbox event now exist for this tenant.
    const row = await adminGetQuarantine(admin, quarantineEventId);
    expect(row).toBeDefined();
    expect(row!['tenant_id']).toBe(TENANT_A);
    expect(row!['content_hash']).toBe(sha256Hex(content));

    const out = await adminGetOutboxByDedupe(admin, dedupeKeyFor(quarantineEventId));
    expect(out).toBeDefined();
    expect(JSON.stringify(out!.payload)).not.toContain('UPLOAD-MARKER');

    // No governed evidence_object row was created (quarantine is not governed evidence).
    const evidenceAfter = await countForTenants(admin, 'governance.evidence_object');
    expect(evidenceAfter).toBe(evidenceBefore);
  });
});
