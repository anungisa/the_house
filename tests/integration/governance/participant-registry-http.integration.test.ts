import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgParticipantRegistryStore } from '../../../src/domains/participant-registry/PgParticipantRegistryStore.js';
import {
  handleParticipantList,
  handleParticipantDetail,
  handleOrganizationParticipantList,
  type ParticipantReadHttpDeps,
} from '../../../src/http/participant/ParticipantReadHttpAdapter.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';

/**
 * Gated PostgreSQL integration tests for the PARTICIPANT REGISTRY HTTP READ surface (participant
 * list + detail and an organization's participant relationships) over the real
 * PgParticipantRegistryStore.
 *
 * These prove, against REAL PostgreSQL, that an authorized operator can list and read
 * tenant-scoped participants and relationships through the HTTP read adapter while RLS keeps
 * tenants isolated, and that reads are strictly READ-ONLY: they never enqueue an outbox message
 * and never mutate the registry. The runtime role holds SELECT only (no INSERT/UPDATE/DELETE),
 * proving reads require no write privileges.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, antivirus, Service Bus, Key Vault,
 * Docker, registry, Cosign, or external network is contacted.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege READ role (idempotent, re-runnable):
 *   * house_app_participant_http_read_test — LOGIN, NOSUPERUSER, NOBYPASSRLS; SELECT only on
 *     participant_registry.participant and participant_registry.organization_participant; EXECUTE
 *     current_tenant_id(). No INSERT/UPDATE/DELETE.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Suite-specific tenant UUIDs (distinct from other integration suites).
const TENANT_A = '40000000-0000-4000-8000-0000000000e5';
const TENANT_B = '40000000-0000-4000-8000-0000000000f6';

const APP_ROLE = 'house_app_participant_http_read_test';
const APP_PW = 'participant_http_read_pw';
const TRUSTED = new TrustedHeadersAuthContextResolver();

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
  // Least privilege for a READ surface: SELECT only on the two registry tables. No INSERT, UPDATE,
  // DELETE, or TRUNCATE anywhere — reads require no write grants.
  await admin.query(`REVOKE ALL ON participant_registry.participant FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON participant_registry.organization_participant FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA participant_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT ON participant_registry.participant TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT ON participant_registry.organization_participant TO ${APP_ROLE}`,
  );
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

/** Seed a participant row directly via the admin (RLS-bypassing) connection. */
async function seedParticipant(
  admin: pg.Pool,
  tenantId: string,
  over: Partial<{
    id: string;
    displayName: string;
    givenName: string;
    familyName: string;
    email: string;
    status: string;
  }> = {},
): Promise<string> {
  const id = over.id ?? randomUUID();
  await admin.query(
    `INSERT INTO participant_registry.participant
       (id, tenant_id, display_name, given_name, family_name, email, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      tenantId,
      over.displayName ?? 'Pat Reader',
      over.givenName ?? null,
      over.familyName ?? null,
      over.email ?? null,
      over.status ?? 'active',
    ],
  );
  return id;
}

/** Seed an organization-participant relationship row directly via the admin connection. */
async function seedLink(
  admin: pg.Pool,
  tenantId: string,
  organizationId: string,
  participantId: string,
  over: Partial<{ id: string; relationshipType: string; status: string }> = {},
): Promise<string> {
  const id = over.id ?? randomUUID();
  await admin.query(
    `INSERT INTO participant_registry.organization_participant
       (id, tenant_id, organization_id, participant_id, relationship_type, status)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      id,
      tenantId,
      organizationId,
      participantId,
      over.relationshipType ?? 'member',
      over.status ?? 'active',
    ],
  );
  return id;
}

function readerHeaders(tenantId: string): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'participant_reader',
  };
}

function memberHeaders(tenantId: string): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'member',
  };
}

const ALLOWED_PARTICIPANT_DTO_KEYS = new Set([
  'tenantId',
  'participantId',
  'displayName',
  'givenName',
  'familyName',
  'email',
  'status',
  'externalRefs',
  'createdAt',
  'updatedAt',
]);

d('participant registry HTTP read surfaces (integration)', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let deps: ParticipantReadHttpDeps;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    deps = { readStore: new PgParticipantRegistryStore(appPool) };
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    await admin.query(
      `DELETE FROM participant_registry.organization_participant WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(
      `DELETE FROM participant_registry.participant WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  });

  // (1) The participant table has RLS enabled AND forced.
  it('(1) participant table has RLS enabled AND forced', async () => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'participant_registry' AND c.relname = 'participant'`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // (2) The organization_participant table has RLS enabled AND forced.
  it('(2) organization_participant table has RLS enabled AND forced', async () => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'participant_registry' AND c.relname = 'organization_participant'`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // (3) The read role is non-superuser, non-BYPASSRLS, with SELECT only (no write grants).
  it('(3) read role is NOSUPERUSER, NOBYPASSRLS, SELECT-only', async () => {
    const { rows: role } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(role[0]!.rolsuper).toBe(false);
    expect(role[0]!.rolbypassrls).toBe(false);

    const { rows: grants } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'participant_registry'`,
      [APP_ROLE],
    );
    const privileges = new Set(grants.map((r) => r.privilege_type));
    expect(privileges).toEqual(new Set(['SELECT']));
    expect(privileges.has('INSERT')).toBe(false);
    expect(privileges.has('UPDATE')).toBe(false);
    expect(privileges.has('DELETE')).toBe(false);
  });

  // (4) The restricted role lists its own tenant's participants over the HTTP read path.
  it('(4) lists own-tenant participants over the HTTP read path', async () => {
    const id1 = await seedParticipant(admin, TENANT_A);
    const id2 = await seedParticipant(admin, TENANT_A);

    const res = await handleParticipantList(
      deps,
      { headers: readerHeaders(TENANT_A), query: {} },
      'i4',
      TRUSTED,
    );
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(new Set(items.map((i) => i['participantId']))).toEqual(new Set([id1, id2]));
  });

  // (5) The restricted role reads its own tenant's participant detail over the HTTP read path.
  it('(5) reads own-tenant participant detail over the HTTP read path', async () => {
    const id = await seedParticipant(admin, TENANT_A, { displayName: 'Head Contact' });
    const res = await handleParticipantDetail(
      deps,
      { participantId: id, headers: readerHeaders(TENANT_A) },
      'i5',
      TRUSTED,
    );
    expect(res.status).toBe(200);
    const participant = res.body['participant'] as Record<string, unknown>;
    expect(participant['participantId']).toBe(id);
    expect(participant['displayName']).toBe('Head Contact');
  });

  // (6) The restricted role lists an organization's relationships over the HTTP read path.
  it('(6) lists own-tenant organization relationships over the HTTP read path', async () => {
    const pid = await seedParticipant(admin, TENANT_A);
    const rid = await seedLink(admin, TENANT_A, randomUUID(), pid);
    const orgId = (
      await admin.query<{ organization_id: string }>(
        `SELECT organization_id FROM participant_registry.organization_participant WHERE id = $1`,
        [rid],
      )
    ).rows[0]!.organization_id;

    const res = await handleOrganizationParticipantList(
      deps,
      { organizationId: orgId, headers: readerHeaders(TENANT_A), query: {} },
      'i6',
      TRUSTED,
    );
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['relationshipId'])).toEqual([rid]);
  });

  // (7) Tenant A cannot see Tenant B's participants in a list (RLS isolation).
  it('(7) does not list another tenant participants (RLS isolation)', async () => {
    await seedParticipant(admin, TENANT_A);
    const bId = await seedParticipant(admin, TENANT_B);

    const res = await handleParticipantList(
      deps,
      { headers: readerHeaders(TENANT_A), query: {} },
      'i7',
      TRUSTED,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.some((i) => i['participantId'] === bId)).toBe(false);
    expect(items.every((i) => i['tenantId'] === TENANT_A)).toBe(true);
  });

  // (8) Reading another tenant's participant detail returns 404 (never reveals existence).
  it('(8) returns 404 for a cross-tenant detail read', async () => {
    const bId = await seedParticipant(admin, TENANT_B);
    const res = await handleParticipantDetail(
      deps,
      { participantId: bId, headers: readerHeaders(TENANT_A) },
      'i8',
      TRUSTED,
    );
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('PARTICIPANT_NOT_FOUND');
  });

  // (9) Tenant A cannot see Tenant B's organization relationships (RLS isolation).
  it('(9) does not list another tenant organization relationships (RLS isolation)', async () => {
    const orgId = randomUUID();
    const bPid = await seedParticipant(admin, TENANT_B);
    const bRid = await seedLink(admin, TENANT_B, orgId, bPid);

    const res = await handleOrganizationParticipantList(
      deps,
      { organizationId: orgId, headers: readerHeaders(TENANT_A), query: {} },
      'i9',
      TRUSTED,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.some((i) => i['relationshipId'] === bRid)).toBe(false);
  });

  // (10) An authenticated actor lacking participant.read is denied (403, fail closed).
  it('(10) denies an unauthorized actor (403)', async () => {
    await seedParticipant(admin, TENANT_A);
    const res = await handleParticipantList(
      deps,
      { headers: memberHeaders(TENANT_A), query: {} },
      'i10',
      TRUSTED,
    );
    expect(res.status).toBe(403);
  });

  // (11) A blank tenant identity fails closed (401).
  it('(11) fails closed with 401 when no tenant identity is present', async () => {
    const res = await handleParticipantList(
      deps,
      {
        headers: { 'x-house-actor-user-id': randomUUID(), 'x-house-actor-role-keys': 'participant_reader' },
        query: {},
      },
      'i11',
      TRUSTED,
    );
    expect(res.status).toBe(401);
  });

  // (12) Reads never enqueue an outbox message.
  it('(12) reads enqueue no outbox messages', async () => {
    const pid = await seedParticipant(admin, TENANT_A);
    const orgId = randomUUID();
    await seedLink(admin, TENANT_A, orgId, pid);

    await handleParticipantList(deps, { headers: readerHeaders(TENANT_A), query: {} }, 'i12a', TRUSTED);
    await handleParticipantDetail(
      deps,
      { participantId: pid, headers: readerHeaders(TENANT_A) },
      'i12b',
      TRUSTED,
    );
    await handleOrganizationParticipantList(
      deps,
      { organizationId: orgId, headers: readerHeaders(TENANT_A), query: {} },
      'i12c',
      TRUSTED,
    );

    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  // (13) Reads never mutate the registry (row counts unchanged).
  it('(13) reads cause no registry mutation', async () => {
    const pid = await seedParticipant(admin, TENANT_A);
    const orgId = randomUUID();
    await seedLink(admin, TENANT_A, orgId, pid);

    const countRows = async (table: string): Promise<number> => {
      const { rows } = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM participant_registry.${table} WHERE tenant_id = ANY($1::uuid[])`,
        [[TENANT_A, TENANT_B]],
      );
      return Number(rows[0]!.n);
    };
    const participantsBefore = await countRows('participant');
    const linksBefore = await countRows('organization_participant');

    await handleParticipantList(deps, { headers: readerHeaders(TENANT_A), query: {} }, 'i13a', TRUSTED);
    await handleParticipantDetail(
      deps,
      { participantId: pid, headers: readerHeaders(TENANT_A) },
      'i13b',
      TRUSTED,
    );
    await handleOrganizationParticipantList(
      deps,
      { organizationId: orgId, headers: readerHeaders(TENANT_A), query: {} },
      'i13c',
      TRUSTED,
    );

    expect(await countRows('participant')).toBe(participantsBefore);
    expect(await countRows('organization_participant')).toBe(linksBefore);
  });

  // (14) The participant payload exposes ONLY the closed, safe field set.
  it('(14) participant payload excludes unsafe fields', async () => {
    const id = await seedParticipant(admin, TENANT_A, {
      givenName: 'Pat',
      familyName: 'Reader',
      email: 'pat@example.test',
    });
    const res = await handleParticipantDetail(
      deps,
      { participantId: id, headers: readerHeaders(TENANT_A) },
      'i14',
      TRUSTED,
    );
    const participant = res.body['participant'] as Record<string, unknown>;
    expect(new Set(Object.keys(participant))).toEqual(ALLOWED_PARTICIPANT_DTO_KEYS);
  });

  // (15) Email is returned ONLY on an authorized same-tenant read (and never to other tenants).
  it('(15) email is returned only on an authorized same-tenant read', async () => {
    const email = 'contact@example.test';
    const id = await seedParticipant(admin, TENANT_A, { email });

    // Same-tenant authorized read exposes the email.
    const ownRes = await handleParticipantDetail(
      deps,
      { participantId: id, headers: readerHeaders(TENANT_A) },
      'i15a',
      TRUSTED,
    );
    expect((ownRes.body['participant'] as Record<string, unknown>)['email']).toBe(email);

    // Cross-tenant read never reveals the row (or its email).
    const crossRes = await handleParticipantDetail(
      deps,
      { participantId: id, headers: readerHeaders(TENANT_B) },
      'i15b',
      TRUSTED,
    );
    expect(crossRes.status).toBe(404);
    expect(JSON.stringify(crossRes.body)).not.toContain(email);
  });
});
