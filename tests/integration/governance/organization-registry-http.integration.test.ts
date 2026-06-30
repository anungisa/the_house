import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgOrganizationRegistryStore } from '../../../src/domains/organization-registry/PgOrganizationRegistryStore.js';
import {
  handleOrganizationList,
  handleOrganizationDetail,
  type OrganizationReadHttpDeps,
} from '../../../src/http/organization/OrganizationReadHttpAdapter.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';

/**
 * Gated PostgreSQL integration tests for the ORGANIZATION REGISTRY HTTP READ surface
 * (list + detail) over the real PgOrganizationRegistryStore.
 *
 * These prove, against REAL PostgreSQL, that an authorized operator can list and read
 * tenant-scoped organizations through the HTTP read adapter while RLS keeps tenants isolated,
 * and that reads are strictly READ-ONLY: they never enqueue an outbox message and never mutate
 * the registry. The runtime role holds SELECT only (no INSERT/UPDATE/DELETE), proving reads
 * require no write privileges.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, antivirus, Service Bus, Key
 * Vault, Docker, registry, Cosign, or external network is contacted.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege READ role (idempotent, re-runnable):
 *   * house_app_org_http_read_test — LOGIN, NOSUPERUSER, NOBYPASSRLS; SELECT only on
 *     organization_registry.organization; EXECUTE current_tenant_id(). No INSERT/UPDATE/DELETE.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Shared provisioning advisory-lock key. Self-provisioning gated suites run in parallel and mutate
// the SAME shared catalog ACL rows (governance schema USAGE, current_tenant_id() EXECUTE, and the
// outbox_message grant), which throws "tuple concurrently updated" unless the whole migrate+grant
// setup phase is serialized. Every self-provisioning suite MUST hold this lock during setup.
const PROVISION_LOCK_KEY = 918273;

/** Run `fn` while holding the shared provisioning advisory lock on a single dedicated connection. */
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

// Suite-specific tenant UUIDs (distinct from other integration suites).
const TENANT_A = '40000000-0000-4000-8000-0000000000c1';
const TENANT_B = '40000000-0000-4000-8000-0000000000d2';

const APP_ROLE = 'house_app_org_http_read_test';
const APP_PW = 'org_http_read_pw';
const TRUSTED = new TrustedHeadersAuthContextResolver();

function deriveUrl(base: string, user: string, password: string): string {
  const u = new URL(base);
  u.username = user;
  u.password = password;
  return u.toString();
}

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

/** Provision the least-privilege READ-ONLY application role (idempotent, re-run safe). */
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
  // Least privilege for a READ surface: SELECT only on the registry table. No INSERT, UPDATE,
  // DELETE, or TRUNCATE anywhere — reads require no write grants.
  await admin.query(`REVOKE ALL ON organization_registry.organization FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA organization_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT ON organization_registry.organization TO ${APP_ROLE}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

/** Seed an organization row directly via the admin (RLS-bypassing) connection. */
async function seedOrg(
  admin: pg.Pool,
  tenantId: string,
  over: Partial<{
    id: string;
    organizationType: string;
    displayName: string;
    status: string;
    parentOrganizationId: string;
  }> = {},
): Promise<string> {
  const id = over.id ?? randomUUID();
  await admin.query(
    `INSERT INTO organization_registry.organization
       (id, tenant_id, organization_type, display_name, status, source, parent_organization_id)
     VALUES ($1,$2,$3,$4,$5,'manual',$6)`,
    [
      id,
      tenantId,
      over.organizationType ?? 'regional',
      over.displayName ?? 'Region Office',
      over.status ?? 'active',
      over.parentOrganizationId ?? null,
    ],
  );
  return id;
}

function readerHeaders(tenantId: string): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'organization_reader',
  };
}

function memberHeaders(tenantId: string): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'member',
  };
}

d('organization registry HTTP read surfaces (integration)', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let deps: OrganizationReadHttpDeps;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    deps = { readStore: new PgOrganizationRegistryStore(appPool) };
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    await admin.query(
      `DELETE FROM organization_registry.organization WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  });

  // (1) The registry table has RLS enabled AND forced (the reads rely on it for isolation).
  it('(1) registry table has RLS enabled AND forced', async () => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'organization_registry' AND c.relname = 'organization'`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // (2) The read role is non-superuser, non-BYPASSRLS, with SELECT only (no write grants).
  it('(2) read role is NOSUPERUSER, NOBYPASSRLS, SELECT-only', async () => {
    const { rows: role } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(role[0]!.rolsuper).toBe(false);
    expect(role[0]!.rolbypassrls).toBe(false);

    const { rows: grants } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'organization_registry'
          AND table_name = 'organization'`,
      [APP_ROLE],
    );
    const privileges = new Set(grants.map((r) => r.privilege_type));
    expect(privileges).toEqual(new Set(['SELECT']));
    expect(privileges.has('INSERT')).toBe(false);
    expect(privileges.has('UPDATE')).toBe(false);
    expect(privileges.has('DELETE')).toBe(false);
  });

  // (3) The restricted role lists its own tenant's organizations over the HTTP read path.
  it('(3) lists own-tenant organizations over the HTTP read path', async () => {
    const id1 = await seedOrg(admin, TENANT_A, { organizationType: 'national' });
    const id2 = await seedOrg(admin, TENANT_A, { organizationType: 'local' });

    const res = await handleOrganizationList(
      deps,
      { headers: readerHeaders(TENANT_A), query: {} },
      'i3',
      TRUSTED,
    );
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(new Set(items.map((i) => i['organizationId']))).toEqual(new Set([id1, id2]));
  });

  // (4) The restricted role reads its own tenant's organization detail over the HTTP read path.
  it('(4) reads own-tenant organization detail over the HTTP read path', async () => {
    const id = await seedOrg(admin, TENANT_A, { displayName: 'Head Office' });
    const res = await handleOrganizationDetail(
      deps,
      { organizationId: id, headers: readerHeaders(TENANT_A) },
      'i4',
      TRUSTED,
    );
    expect(res.status).toBe(200);
    const org = res.body['organization'] as Record<string, unknown>;
    expect(org['organizationId']).toBe(id);
    expect(org['displayName']).toBe('Head Office');
  });

  // (5) Tenant A cannot see Tenant B's organizations in a list (RLS isolation).
  it('(5) does not list another tenant organizations (RLS isolation)', async () => {
    await seedOrg(admin, TENANT_A, { id: randomUUID() });
    const bId = await seedOrg(admin, TENANT_B, { id: randomUUID() });

    const res = await handleOrganizationList(
      deps,
      { headers: readerHeaders(TENANT_A), query: {} },
      'i5',
      TRUSTED,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.some((i) => i['organizationId'] === bId)).toBe(false);
    expect(items.every((i) => i['tenantId'] === TENANT_A)).toBe(true);
  });

  // (6) Reading another tenant's organization detail returns 404 (never reveals existence).
  it('(6) returns 404 for a cross-tenant detail read', async () => {
    const bId = await seedOrg(admin, TENANT_B);
    const res = await handleOrganizationDetail(
      deps,
      { organizationId: bId, headers: readerHeaders(TENANT_A) },
      'i6',
      TRUSTED,
    );
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('ORGANIZATION_NOT_FOUND');
  });

  // (7) An authenticated actor lacking organization.read is denied (403, fail closed).
  it('(7) denies an unauthorized actor (403)', async () => {
    await seedOrg(admin, TENANT_A);
    const res = await handleOrganizationList(
      deps,
      { headers: memberHeaders(TENANT_A), query: {} },
      'i7',
      TRUSTED,
    );
    expect(res.status).toBe(403);
  });

  // (8) Missing tenant context fails closed at the DB boundary (current_tenant_id raises P0001).
  it('(8) raw read without tenant context fails closed (P0001)', async () => {
    await expect(
      appPool.query(`SELECT id FROM organization_registry.organization`),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  // (9) Reads create NO outbox rows for the suite tenants.
  it('(9) reads enqueue no outbox messages', async () => {
    const id = await seedOrg(admin, TENANT_A);
    await handleOrganizationList(deps, { headers: readerHeaders(TENANT_A), query: {} }, 'i9a', TRUSTED);
    await handleOrganizationDetail(
      deps,
      { organizationId: id, headers: readerHeaders(TENANT_A) },
      'i9b',
      TRUSTED,
    );
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    expect(rows[0]!.n).toBe(0);
  });

  // (10) Reads mutate no registry rows (count + updated_at are unchanged after reads).
  it('(10) reads mutate no registry rows', async () => {
    const id = await seedOrg(admin, TENANT_A);
    const before = await admin.query<{ n: number; updated_at: string }>(
      `SELECT count(*)::int AS n, max(updated_at)::text AS updated_at
         FROM organization_registry.organization WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );

    await handleOrganizationList(deps, { headers: readerHeaders(TENANT_A), query: {} }, 'i10a', TRUSTED);
    await handleOrganizationDetail(
      deps,
      { organizationId: id, headers: readerHeaders(TENANT_A) },
      'i10b',
      TRUSTED,
    );

    const after = await admin.query<{ n: number; updated_at: string }>(
      `SELECT count(*)::int AS n, max(updated_at)::text AS updated_at
         FROM organization_registry.organization WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
    expect(after.rows[0]!.updated_at).toBe(before.rows[0]!.updated_at);
  });
});
