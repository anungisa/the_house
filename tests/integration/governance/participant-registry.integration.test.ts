import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgParticipantRegistryStore } from '../../../src/domains/participant-registry/PgParticipantRegistryStore.js';
import { ParticipantRegistryService } from '../../../src/domains/participant-registry/ParticipantRegistryService.js';
import {
  PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
} from '../../../src/domains/participant-registry/ParticipantTypes.js';
import {
  participantCreatedDedupeKey,
  organizationLinkedDedupeKey,
} from '../../../src/domains/participant-registry/ParticipantRegistryStore.js';
import { PgOrganizationRegistryStore } from '../../../src/domains/organization-registry/PgOrganizationRegistryStore.js';
import { OrganizationRegistryService } from '../../../src/domains/organization-registry/OrganizationRegistryService.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';
import { FORBIDDEN_DOMAIN_TERMS } from '../../../src/deployment/validateDeploymentBaseline.js';

/**
 * Gated PostgreSQL integration tests for the PARTICIPANT REGISTRY domain (migration 0010 +
 * PgParticipantRegistryStore + ParticipantRegistryService).
 *
 * These prove, against REAL PostgreSQL, that the tenant-scoped participant registry — a
 * REFERENCE-DATA structure, NOT a lifecycle engine — persists participants and their
 * organization relationships plus a sanitized `participant.registry.*` outbox signal, recorded
 * and emitted ATOMICALLY, under FORCE Row-Level Security, by a NON-superuser, NON-BYPASSRLS
 * application role, WITHOUT ever touching a governed lifecycle table
 * (governance.entity_state / state_transition / audit_event) and WITHOUT mutating the
 * Organization Registry (which is only READ as a same-tenant reference).
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, antivirus, Service Bus, Key
 * Vault, Docker, registry, Cosign, transparency log, or external network is contacted.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege role (idempotent, re-runnable):
 *   * house_app_participant_registry_test — LOGIN, NOSUPERUSER, NOBYPASSRLS;
 *     SELECT/INSERT/UPDATE on participant_registry.participant,
 *     participant_registry.organization_participant, organization_registry.organization (read
 *     reference) + governance.outbox_message; EXECUTE current_tenant_id(). No DELETE, no
 *     superuser, no BYPASSRLS. RLS-confined.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Suite-specific tenant UUIDs (distinct from other integration suites to avoid cross-suite
// interference when the gated suites share a database).
const TENANT_A = '40000000-0000-4000-8000-0000000000c3';
const TENANT_B = '40000000-0000-4000-8000-0000000000d4';

const APP_ROLE = 'house_app_participant_registry_test';
const APP_PW = 'participant_app_pw';

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
  // Least privilege: SELECT/INSERT/UPDATE on the two registry tables + the read-only org
  // reference + the shared outbox. No DELETE / TRUNCATE anywhere.
  await admin.query(`REVOKE ALL ON participant_registry.participant FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON participant_registry.organization_participant FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON organization_registry.organization FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON governance.outbox_message FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA participant_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA organization_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON participant_registry.participant TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON participant_registry.organization_participant TO ${APP_ROLE}`,
  );
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON organization_registry.organization TO ${APP_ROLE}`);
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

/** Read one participant row by id via the admin connection (no RLS confinement). */
async function adminGetParticipant(
  admin: pg.Pool,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await admin.query(`SELECT * FROM participant_registry.participant WHERE id = $1`, [
    id,
  ]);
  return rows[0];
}

/** Read one relationship row by id via the admin connection (no RLS confinement). */
async function adminGetLink(
  admin: pg.Pool,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await admin.query(
    `SELECT * FROM participant_registry.organization_participant WHERE id = $1`,
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

d('participant registry — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let service: ParticipantRegistryService;
  let orgService: OrganizationRegistryService;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });

    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    // The store/service run as the restricted, RLS-confined role.
    const orgStore = new PgOrganizationRegistryStore(appPool);
    orgService = new OrganizationRegistryService(orgStore);
    service = new ParticipantRegistryService(new PgParticipantRegistryStore(appPool), {
      organizationReader: orgStore,
    });
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    // Deterministic counts per test: remove only this suite's tenant rows (admin bypasses RLS).
    // organization_participant first (FK references participant).
    await admin.query(
      `DELETE FROM participant_registry.organization_participant WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM participant_registry.participant WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
    await admin.query(`DELETE FROM organization_registry.organization WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  });

  const seedOrg = (tenantId: string, id = randomUUID()) =>
    orgService.createOrganization({
      tenantId,
      organizationId: id,
      organizationType: 'local',
      displayName: 'Reference Organization',
      status: 'active',
    });

  const createParticipant = (tenantId = TENANT_A, id = randomUUID(), status: 'draft' | 'active' = 'active') =>
    service.createParticipant({
      tenantId,
      participantId: id,
      displayName: 'Reference Person',
      status,
    });

  // (1) Migration 0010 applied.
  it('applies migration 0010', async () => {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.schema_migrations WHERE filename = $1`,
      ['0010_participant_registry.sql'],
    );
    expect(rows[0]!.n).toBe(1);
  });

  // (2) Both registry tables exist.
  it('creates participant_registry.participant and organization_participant', async () => {
    const { rows } = await admin.query<{ participant: string | null; link: string | null }>(
      `SELECT to_regclass('participant_registry.participant')::text AS participant,
              to_regclass('participant_registry.organization_participant')::text AS link`,
    );
    expect(rows[0]!.participant).toBe('participant_registry.participant');
    expect(rows[0]!.link).toBe('participant_registry.organization_participant');
  });

  // (3)(4) Both tables have RLS enabled AND forced.
  it('has ROW LEVEL SECURITY enabled AND forced on both tables', async () => {
    const { rows } = await admin.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'participant_registry'
          AND c.relname IN ('participant', 'organization_participant')`,
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname} rowsecurity`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname} forcerowsecurity`).toBe(true);
    }
  });

  // (5) Restricted app role is not superuser and does not bypass RLS.
  it('restricted app role is NOSUPERUSER and NOBYPASSRLS', async () => {
    const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  // (6) Missing tenant context fails closed (current_tenant_id() raises P0001).
  it('fails closed when tenant context is missing', async () => {
    await expect(
      appPool.query(
        `INSERT INTO participant_registry.participant (id, tenant_id, display_name, status)
         VALUES ($1, $2, 'No Context Person', 'draft')`,
        [randomUUID(), TENANT_A],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });

    await expect(
      appPool.query(`SELECT id FROM participant_registry.participant`),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  // (7) Tenant A inserts + reads its own participant (restricted role).
  it('inserts and reads a participant for its own tenant', async () => {
    const id = randomUUID();
    const p = await createParticipant(TENANT_A, id);
    expect(p.participantId).toBe(id);
    const read = await service.getParticipant(TENANT_A, id);
    expect(read?.tenantId).toBe(TENANT_A);
  });

  // (8) Tenant A cannot read a Tenant B participant.
  it('does not let Tenant A read a Tenant B participant', async () => {
    const id = randomUUID();
    await createParticipant(TENANT_B, id);
    expect(await service.getParticipant(TENANT_A, id)).toBeUndefined();
    expect(await service.getParticipant(TENANT_B, id)).toBeDefined();
  });

  // (9) Tenant A links a participant to its own organization.
  it('links a participant to a same-tenant organization', async () => {
    const orgId = randomUUID();
    const pId = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createParticipant(TENANT_A, pId);
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_A,
      organizationId: orgId,
      participantId: pId,
      relationshipType: 'member',
    });
    expect(link.organizationId).toBe(orgId);
    expect(link.participantId).toBe(pId);
    expect(link.status).toBe('active');
  });

  // (10) Tenant A cannot link a participant to a Tenant B organization (cross-tenant rejected).
  it('rejects linking a participant to a different tenant organization', async () => {
    const orgId = randomUUID();
    const pId = randomUUID();
    await seedOrg(TENANT_B, orgId);
    await createParticipant(TENANT_A, pId);
    await expect(
      service.linkParticipantToOrganization({
        tenantId: TENANT_A,
        organizationId: orgId,
        participantId: pId,
        relationshipType: 'member',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_NOT_FOUND });
  });

  // (11) Listing returns only the current tenant's participants.
  it('lists only the current tenant participants', async () => {
    await createParticipant(TENANT_A, randomUUID());
    await createParticipant(TENANT_B, randomUUID());
    const alpha = await service.listParticipants(TENANT_A);
    expect(alpha.items.every((p) => p.tenantId === TENANT_A)).toBe(true);
    expect(alpha.items).toHaveLength(1);
  });

  // (12) A participant status change retains the row (no delete).
  it('retains the participant row on a status change', async () => {
    const id = randomUUID();
    await createParticipant(TENANT_A, id);
    await service.changeParticipantStatus({ tenantId: TENANT_A, participantId: id, status: 'archived' });
    const row = await adminGetParticipant(admin, id);
    expect(row).toBeDefined();
    expect(row!['status']).toBe('archived');
  });

  // (13) A relationship status change retains the row (no delete).
  it('retains the relationship row on a status change', async () => {
    const orgId = randomUUID();
    const pId = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createParticipant(TENANT_A, pId);
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_A,
      organizationId: orgId,
      participantId: pId,
      relationshipType: 'member',
    });
    await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_A,
      relationshipId: link.relationshipId,
      status: 'ended',
      endDate: '2024-02-01',
    });
    const row = await adminGetLink(admin, link.relationshipId);
    expect(row).toBeDefined();
    expect(row!['status']).toBe('ended');
  });

  // (14) Creation writes a participant.registry.created outbox row transactionally with the row.
  it('emits a participant.registry.created outbox event transactionally with the row', async () => {
    const id = randomUUID();
    await createParticipant(TENANT_A, id);
    const out = await adminGetOutboxByDedupe(admin, participantCreatedDedupeKey(id));
    expect(out).toBeDefined();
    expect(out!.message_type).toBe(PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE);
    expect(out!.tenant_id).toBe(TENANT_A);
    expect(out!.payload['participantId']).toBe(id);

    const row = await adminGetParticipant(admin, id);
    expect(row).toBeDefined();
  });

  // (15) Linking writes a participant.registry.organization_linked outbox row.
  it('emits a participant.registry.organization_linked outbox event on a link', async () => {
    const orgId = randomUUID();
    const pId = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createParticipant(TENANT_A, pId);
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_A,
      organizationId: orgId,
      participantId: pId,
      relationshipType: 'official',
    });
    const out = await adminGetOutboxByDedupe(admin, organizationLinkedDedupeKey(link.relationshipId));
    expect(out).toBeDefined();
    expect(out!.message_type).toBe(PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE);
    expect(out!.payload['relationshipId']).toBe(link.relationshipId);
    expect(out!.payload['organizationId']).toBe(orgId);
  });

  // (16) Outbox payloads carry no email, names, secrets, tokens, or bytes.
  it('emits sanitized payloads that exclude email, names, and secret material', async () => {
    const id = randomUUID();
    await service.createParticipant({
      tenantId: TENANT_A,
      participantId: id,
      displayName: 'SECRET-NAME-MARKER',
      email: 'secret-email-marker@example.com',
      status: 'active',
    });
    const out = await adminGetOutboxByDedupe(admin, participantCreatedDedupeKey(id));
    expect(out).toBeDefined();
    const serialized = JSON.stringify(out!.payload).toLowerCase();
    expect(serialized).not.toContain('secret-email-marker');
    expect(serialized).not.toContain('secret-name-marker');
    expect(out!.payload['email']).toBeUndefined();
    expect(out!.payload['displayName']).toBeUndefined();
    for (const banned of ['bearer', 'authorization', 'password', 'secret=', 'apikey', 'set-cookie']) {
      expect(serialized).not.toContain(banned);
    }
  });

  // (17)(18)(19) The registry never creates or mutates a governed lifecycle row.
  it('does not create or mutate any governed lifecycle row (entity_state/state_transition/audit_event)', async () => {
    const tables = [
      'governance.entity_state',
      'governance.state_transition',
      'governance.audit_event',
    ] as const;
    const before = await Promise.all(tables.map((t) => countForTenants(admin, t)));

    const orgId = randomUUID();
    const pId = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createParticipant(TENANT_A, pId);
    await service.linkParticipantToOrganization({
      tenantId: TENANT_A,
      organizationId: orgId,
      participantId: pId,
      relationshipType: 'member',
    });
    await service.changeParticipantStatus({ tenantId: TENANT_A, participantId: pId, status: 'suspended' });

    const after = await Promise.all(tables.map((t) => countForTenants(admin, t)));
    expect(after).toEqual(before);
    expect(after).toEqual([0, 0, 0]);
  });

  // (extra) The registry tables carry no sport-specific column terminology (NSO-generic core).
  it('exposes no sport-specific column terminology (NSO-generic platform core)', async () => {
    const { rows } = await admin.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'participant_registry'
          AND table_name IN ('participant', 'organization_participant')`,
    );
    // Banned terms come from the shared deployment baseline so this file does not itself spell
    // them out (which would trip the static baseline validator).
    for (const { column_name } of rows) {
      const lowered = column_name.toLowerCase();
      for (const term of FORBIDDEN_DOMAIN_TERMS) {
        expect(lowered.includes(term), `column ${column_name} leaks sport term "${term}"`).toBe(
          false,
        );
      }
    }
  });
});
