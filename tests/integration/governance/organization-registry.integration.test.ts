import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgOrganizationRegistryStore } from '../../../src/domains/organization-registry/PgOrganizationRegistryStore.js';
import { OrganizationRegistryService } from '../../../src/domains/organization-registry/OrganizationRegistryService.js';
import {
  ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE,
  ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
} from '../../../src/domains/organization-registry/OrganizationTypes.js';
import {
  organizationCreatedDedupeKey,
} from '../../../src/domains/organization-registry/OrganizationRegistryStore.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';

/**
 * Gated PostgreSQL integration tests for the ORGANIZATION REGISTRY domain (migration 0009 +
 * PgOrganizationRegistryStore + OrganizationRegistryService).
 *
 * These prove, against REAL PostgreSQL, that the tenant-scoped organization registry — a
 * REFERENCE-DATA structure, NOT a lifecycle engine — persists organizations and their
 * parent/child hierarchy plus a sanitized `organization.registry.*` outbox signal, recorded and
 * emitted ATOMICALLY, under FORCE Row-Level Security, by a NON-superuser, NON-BYPASSRLS
 * application role, WITHOUT ever touching a governed lifecycle table
 * (governance.entity_state / state_transition / audit_event).
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, antivirus, Service Bus, Key
 * Vault, Docker, registry, Cosign, transparency log, or external network is contacted.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege role (idempotent, re-runnable):
 *   * house_app_org_registry_test — LOGIN, NOSUPERUSER, NOBYPASSRLS; SELECT/INSERT/UPDATE on
 *     organization_registry.organization + governance.outbox_message; EXECUTE
 *     current_tenant_id(). No DELETE, no superuser, no BYPASSRLS. RLS-confined.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Suite-specific tenant UUIDs (distinct from other integration suites to avoid cross-suite
// interference when the gated suites share a database).
const TENANT_A = '40000000-0000-4000-8000-0000000000a1';
const TENANT_B = '40000000-0000-4000-8000-0000000000b2';

const APP_ROLE = 'house_app_org_registry_test';
const APP_PW = 'org_app_pw';

// Shared advisory-lock key used to SERIALIZE schema setup (migrations + role provisioning) across
// gated integration suites that run in parallel. Multiple suites mutate the SAME catalog rows
// (e.g. grants on governance.outbox_message), which races as "tuple concurrently updated" unless
// the whole setup phase is serialized. Every suite that provisions a role MUST use this key.
const PROVISION_LOCK_KEY = 918273;

/**
 * Run `fn` while holding the shared provisioning advisory lock on a single dedicated connection,
 * so concurrent suites serialize their schema-setup phase. The lock + unlock run on the SAME
 * backend connection (a requirement of session-level advisory locks).
 */
async function withProvisionLock<T>(admin: pg.Pool, fn: () => Promise<T>): Promise<T> {
  const client = await admin.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [PROVISION_LOCK_KEY]);
    return await fn();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [PROVISION_LOCK_KEY]);
    } catch {
      /* best-effort unlock */
    }
    client.release();
  }
}

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
  // Least privilege: SELECT/INSERT/UPDATE on the registry table + the shared outbox; the
  // registry path writes both in one transaction. No DELETE / TRUNCATE anywhere.
  await admin.query(`REVOKE ALL ON organization_registry.organization FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON governance.outbox_message FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA organization_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON organization_registry.organization TO ${APP_ROLE}`,
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

/** Read one organization row by id via the admin connection (no RLS confinement). */
async function adminGetOrg(
  admin: pg.Pool,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await admin.query(
    `SELECT * FROM organization_registry.organization WHERE id = $1`,
    [id],
  );
  return rows[0];
}

/** Read the outbox row for a registry signal by its stable dedupe key. */
async function adminGetOutboxByDedupe(
  admin: pg.Pool,
  dedupeKey: string,
): Promise<
  { message_type: string; payload: Record<string, unknown>; tenant_id: string } | undefined
> {
  const { rows } = await admin.query<{
    message_type: string;
    payload: Record<string, unknown>;
    tenant_id: string;
  }>(`SELECT message_type, payload, tenant_id FROM governance.outbox_message WHERE dedupe_key = $1`, [
    dedupeKey,
  ]);
  return rows[0];
}

/**
 * Read the outbox row for a registry signal by message type + organization id from the payload.
 * (Timestamp-bearing dedupe keys are normalized by Postgres on RETURNING, so matching on the
 * sanitized payload's organizationId is the stable lookup for those signals.)
 */
async function adminGetOutboxByTypeAndOrg(
  admin: pg.Pool,
  messageType: string,
  organizationId: string,
): Promise<
  { message_type: string; payload: Record<string, unknown>; tenant_id: string } | undefined
> {
  const { rows } = await admin.query<{
    message_type: string;
    payload: Record<string, unknown>;
    tenant_id: string;
  }>(
    `SELECT message_type, payload, tenant_id FROM governance.outbox_message
       WHERE message_type = $1 AND payload->>'organizationId' = $2`,
    [messageType, organizationId],
  );
  return rows[0];
}

d('organization registry — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let service: OrganizationRegistryService;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });

    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    // The store/service run as the restricted, RLS-confined role.
    service = new OrganizationRegistryService(new PgOrganizationRegistryStore(appPool));
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    // Deterministic counts per test: remove only this suite's tenant rows (admin bypasses RLS).
    await admin.query(
      `DELETE FROM organization_registry.organization WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  });

  const createNational = (tenantId = TENANT_A, id = randomUUID()) =>
    service.createOrganization({
      tenantId,
      organizationId: id,
      organizationType: 'national',
      displayName: 'Registered National Organization',
    });

  // (1)(2) Migration 0009 applied and the registry table exists.
  it('applies migration 0009 and creates organization_registry.organization', async () => {
    const { rows: mig } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.schema_migrations WHERE filename = $1`,
      ['0009_organization_registry.sql'],
    );
    expect(mig[0]!.n).toBe(1);

    const { rows } = await admin.query<{ reg: string | null }>(
      `SELECT to_regclass('organization_registry.organization')::text AS reg`,
    );
    expect(rows[0]!.reg).toBe('organization_registry.organization');
  });

  // (3)(4) Table has RLS enabled AND forced.
  it('has ROW LEVEL SECURITY enabled AND forced', async () => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'organization_registry' AND c.relname = 'organization'`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // (5)(6) Restricted app role is not superuser and does not bypass RLS.
  it('restricted app role is NOSUPERUSER and NOBYPASSRLS', async () => {
    const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  // (7) App-role grants on the registry table are limited to SELECT/INSERT/UPDATE (no DELETE).
  it('grants the app role only SELECT/INSERT/UPDATE on the organization table (no DELETE)', async () => {
    const { rows } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'organization_registry'
          AND table_name = 'organization'`,
      [APP_ROLE],
    );
    const privileges = new Set(rows.map((r) => r.privilege_type));
    expect(privileges).toEqual(new Set(['SELECT', 'INSERT', 'UPDATE']));
    expect(privileges.has('DELETE')).toBe(false);
    expect(privileges.has('TRUNCATE')).toBe(false);
  });

  // (8) Missing tenant context fails closed (current_tenant_id() raises P0001) for both read
  //     and write. A bare INSERT without app.tenant_id set hits the WITH CHECK policy.
  it('fails closed when tenant context is missing', async () => {
    await expect(
      appPool.query(
        `INSERT INTO organization_registry.organization
           (id, tenant_id, organization_type, display_name, status, source)
         VALUES ($1, $2, 'national', 'No Context Org', 'draft', 'manual')`,
        [randomUUID(), TENANT_A],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });

    // A SELECT without tenant context likewise raises (the USING policy evaluates the function).
    await expect(
      appPool.query(`SELECT id FROM organization_registry.organization`),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  // (9)(10)(11) Tenant A inserts + reads a national → regional → local hierarchy (restricted role).
  it('inserts and reads a national/regional/local hierarchy for its own tenant', async () => {
    const national = await createNational();
    expect(national.organizationType).toBe('national');
    expect(national.status).toBe('draft');

    const regional = await service.createOrganization({
      tenantId: TENANT_A,
      organizationId: randomUUID(),
      organizationType: 'regional',
      displayName: 'Registered Regional Organization',
      parentOrganizationId: national.organizationId,
    });
    expect(regional.parentOrganizationId).toBe(national.organizationId);

    const local = await service.createOrganization({
      tenantId: TENANT_A,
      organizationId: randomUUID(),
      organizationType: 'local',
      displayName: 'Registered Local Organization',
      parentOrganizationId: regional.organizationId,
    });
    expect(local.parentOrganizationId).toBe(regional.organizationId);

    // All three are readable by the same tenant through the restricted role.
    const fetchedLocal = await service.getOrganization(TENANT_A, local.organizationId);
    expect(fetchedLocal?.organizationId).toBe(local.organizationId);
    expect(fetchedLocal?.parentOrganizationId).toBe(regional.organizationId);

    // The admin (RLS-bypassing) view confirms the persisted hierarchy columns.
    const localRow = await adminGetOrg(admin, local.organizationId);
    expect(localRow!['tenant_id']).toBe(TENANT_A);
    expect(localRow!['organization_type']).toBe('local');
    expect(localRow!['parent_organization_id']).toBe(regional.organizationId);
  });

  // (12)(16) Tenant A cannot read tenant B's organization (RLS isolation, detail).
  it('hides tenant B organizations from tenant A (RLS isolation)', async () => {
    const bNational = await createNational(TENANT_B);

    // Detail read under tenant A returns nothing for a B-owned id.
    const fetched = await service.getOrganization(TENANT_A, bNational.organizationId);
    expect(fetched).toBeUndefined();

    // And a raw same-role read under tenant A sees zero of B's rows.
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1,$2,true)', ['app.tenant_id', TENANT_A]);
      const visible = await client.query(
        `SELECT count(*)::int AS n FROM organization_registry.organization WHERE tenant_id = $1`,
        [TENANT_B],
      );
      await client.query('COMMIT');
      expect(Number(visible.rows[0].n)).toBe(0);
    } finally {
      client.release();
    }
  });

  // (13) Tenant A cannot set parentOrganizationId to a tenant B parent (cross-tenant parent
  //      rejected — RLS makes the B parent unresolvable, so it reads as PARENT_NOT_FOUND).
  it('rejects a cross-tenant parent reference (parent owned by tenant B)', async () => {
    const bNational = await createNational(TENANT_B);
    await expect(
      service.createOrganization({
        tenantId: TENANT_A,
        organizationId: randomUUID(),
        organizationType: 'regional',
        displayName: 'Cross-tenant child attempt',
        parentOrganizationId: bNational.organizationId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_PARENT_NOT_FOUND });

    // No A-owned row was written by the rejected attempt.
    expect(await countForTenants(admin, 'organization_registry.organization')).toBe(1); // only B's
  });

  // (14) A parent cycle is rejected (A -> B -> A).
  it('rejects a parent relationship that would introduce a cycle', async () => {
    const a = await createNational(TENANT_A);
    const b = await service.createOrganization({
      tenantId: TENANT_A,
      organizationId: randomUUID(),
      organizationType: 'regional',
      displayName: 'Child B',
      parentOrganizationId: a.organizationId,
    });
    // Now try to make A's parent be B -> cycle (B already descends from A).
    await expect(
      service.updateOrganization({
        tenantId: TENANT_A,
        organizationId: a.organizationId,
        parentOrganizationId: b.organizationId,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_PARENT_CYCLE });
  });

  // (15) List returns only the current tenant's organizations.
  it('lists only the current tenant organizations', async () => {
    await createNational(TENANT_A);
    await createNational(TENANT_A);
    await createNational(TENANT_B);

    const alpha = await service.listOrganizations(TENANT_A);
    expect(alpha.items).toHaveLength(2);
    for (const item of alpha.items) expect(item.tenantId).toBe(TENANT_A);

    const beta = await service.listOrganizations(TENANT_B);
    expect(beta.items).toHaveLength(1);
    expect(beta.items[0]!.tenantId).toBe(TENANT_B);
  });

  // (17) Status update to suspended/archived retains the row (records are never deleted).
  it('retains the row when status moves to suspended then archived', async () => {
    const national = await createNational();
    await service.changeOrganizationStatus({
      tenantId: TENANT_A,
      organizationId: national.organizationId,
      status: 'suspended',
    });
    await service.changeOrganizationStatus({
      tenantId: TENANT_A,
      organizationId: national.organizationId,
      status: 'archived',
    });

    const row = await adminGetOrg(admin, national.organizationId);
    expect(row).toBeDefined();
    expect(row!['status']).toBe('archived');
    // The row still counts (archived != deleted).
    expect(await countForTenants(admin, 'organization_registry.organization')).toBe(1);
  });

  // (18) An organization projected from an approved affiliation application requires and records
  //      its sourceEntityId; an active affiliation-sourced org without it fails closed.
  it('records the affiliation source id for a projected organization and requires it', async () => {
    const affiliationApplicationId = randomUUID();
    const projected = await service.registerOrganizationFromApprovedAffiliationApplication({
      tenantId: TENANT_A,
      affiliationApplicationId,
      organizationType: 'local',
      displayName: 'Projected Local Organization',
    });
    expect(projected.source).toBe('affiliation_application');
    expect(projected.status).toBe('active');
    expect(projected.sourceEntityId).toBe(affiliationApplicationId);

    const row = await adminGetOrg(admin, projected.organizationId);
    expect(row!['source']).toBe('affiliation_application');
    expect(row!['source_entity_type']).toBe('AffiliationApplication');
    expect(row!['source_entity_id']).toBe(affiliationApplicationId);

    // An active affiliation-sourced org WITHOUT a source id fails closed (no row written).
    await expect(
      service.createOrganization({
        tenantId: TENANT_A,
        organizationId: randomUUID(),
        organizationType: 'local',
        displayName: 'Sourceless affiliation org',
        status: 'active',
        source: 'affiliation_application',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_SOURCE_REFERENCE_REQUIRED });
  });

  // (19)(22) Creating an organization emits a single organization.registry.created outbox event
  //          in the SAME transaction as the row (both present, same tenant).
  it('emits an organization.registry.created outbox event transactionally with the row', async () => {
    const national = await createNational();

    const out = await adminGetOutboxByDedupe(
      admin,
      organizationCreatedDedupeKey(national.organizationId),
    );
    expect(out).toBeDefined();
    expect(out!.message_type).toBe(ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE);
    expect(out!.tenant_id).toBe(TENANT_A);
    expect(out!.payload['organizationId']).toBe(national.organizationId);

    // Row + outbox both exist (transactional outbox).
    const row = await adminGetOrg(admin, national.organizationId);
    expect(row).toBeDefined();
  });

  // (20) A status change emits an organization.registry.status_changed outbox event.
  it('emits an organization.registry.status_changed outbox event on a status change', async () => {
    const national = await createNational();
    await service.changeOrganizationStatus({
      tenantId: TENANT_A,
      organizationId: national.organizationId,
      status: 'suspended',
    });

    const out = await adminGetOutboxByTypeAndOrg(
      admin,
      ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
      national.organizationId,
    );
    expect(out).toBeDefined();
    expect(out!.message_type).toBe(ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE);
    expect(out!.payload['previousStatus']).toBe('draft');
    expect(out!.payload['newStatus']).toBe('suspended');
  });

  // (21) Outbox payloads carry no raw names, headers, bearer tokens, secrets, or bytes.
  it('emits a sanitized created payload (no display/legal names, headers, tokens, or bytes)', async () => {
    const id = randomUUID();
    await service.createOrganization({
      tenantId: TENANT_A,
      organizationId: id,
      organizationType: 'national',
      displayName: 'SECRET-DISPLAY-MARKER',
      legalName: 'SECRET-LEGAL-MARKER',
    });

    const out = await adminGetOutboxByDedupe(admin, organizationCreatedDedupeKey(id));
    expect(out).toBeDefined();
    const serialized = JSON.stringify(out!.payload);
    // The human-readable names are NOT projected into the signal.
    expect(serialized).not.toContain('SECRET-DISPLAY-MARKER');
    expect(serialized).not.toContain('SECRET-LEGAL-MARKER');
    expect(out!.payload['displayName']).toBeUndefined();
    expect(out!.payload['legalName']).toBeUndefined();
    // No transport/auth/secret material leaks into the signal.
    const lowered = serialized.toLowerCase();
    for (const banned of ['bearer', 'authorization', 'password', 'secret=', 'apikey', 'set-cookie']) {
      expect(lowered).not.toContain(banned);
    }
  });

  // (23) If the outbox insert fails, the organization insert does NOT silently succeed (atomic
  //      rollback) — proven by transiently revoking INSERT on the shared outbox table.
  it('rolls the organization row back when the outbox insert fails (no silent partial write)', async () => {
    const before = await countForTenants(admin, 'organization_registry.organization');
    await admin.query(`REVOKE INSERT ON governance.outbox_message FROM ${APP_ROLE}`);
    try {
      await expect(createNational()).rejects.toMatchObject({ code: '42501' });
    } finally {
      await admin.query(`GRANT INSERT ON governance.outbox_message TO ${APP_ROLE}`);
    }
    const after = await countForTenants(admin, 'organization_registry.organization');
    expect(after).toBe(before); // the organization row was rolled back with the failed outbox insert
  });

  // (24)(25)(26) The registry never creates or mutates a governed lifecycle row.
  it('does not create or mutate any governed lifecycle row (entity_state/state_transition/audit_event)', async () => {
    const tables = [
      'governance.entity_state',
      'governance.state_transition',
      'governance.audit_event',
    ] as const;
    const before = await Promise.all(tables.map((t) => countForTenants(admin, t)));

    const national = await createNational();
    await service.changeOrganizationStatus({
      tenantId: TENANT_A,
      organizationId: national.organizationId,
      status: 'active',
    });
    await service.registerOrganizationFromApprovedAffiliationApplication({
      tenantId: TENANT_A,
      affiliationApplicationId: randomUUID(),
      organizationType: 'local',
      displayName: 'Projected Org (no governance mutation)',
    });

    const after = await Promise.all(tables.map((t) => countForTenants(admin, t)));
    expect(after).toEqual(before);
    // All governed counts for this suite's tenants stay at zero — the registry touches none.
    expect(after).toEqual([0, 0, 0]);
  });

  // (27) The registry table carries no sport-specific column terminology (NSO-generic core).
  it('exposes no sport-specific column terminology (NSO-generic platform core)', async () => {
    const { rows } = await admin.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'organization_registry' AND table_name = 'organization'`,
    );
    const SPORT = /curl|curler|bonspiel|hockey|skip|rink|sheet|athlete|coach|club|league|team|ptso/i;
    for (const { column_name } of rows) {
      expect(SPORT.test(column_name), `column ${column_name} leaks sport terminology`).toBe(false);
    }
  });
});
