import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgFacilityRegistryStore } from '../../../src/domains/facility-registry/PgFacilityRegistryStore.js';
import { FacilityRegistryService } from '../../../src/domains/facility-registry/FacilityRegistryService.js';
import {
  FACILITY_REGISTRY_CREATED_MESSAGE_TYPE,
  FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
  FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE,
} from '../../../src/domains/facility-registry/FacilityTypes.js';
import { facilityCreatedDedupeKey } from '../../../src/domains/facility-registry/FacilityRegistryStore.js';
import { PgOrganizationRegistryStore } from '../../../src/domains/organization-registry/PgOrganizationRegistryStore.js';
import { OrganizationRegistryService } from '../../../src/domains/organization-registry/OrganizationRegistryService.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';
import { FORBIDDEN_DOMAIN_TERMS } from '../../../src/deployment/validateDeploymentBaseline.js';

/**
 * Gated PostgreSQL integration tests for the FACILITY REGISTRY domain (migration 0011 +
 * PgFacilityRegistryStore + FacilityRegistryService).
 *
 * These prove, against REAL PostgreSQL, that the tenant-scoped facility registry — a
 * REFERENCE-DATA structure, NOT a lifecycle engine — persists facilities plus a sanitized
 * `facility.registry.*` outbox signal, recorded and emitted ATOMICALLY, under FORCE Row-Level
 * Security, by a NON-superuser, NON-BYPASSRLS application role, WITHOUT ever touching a governed
 * lifecycle table (governance.entity_state / state_transition / audit_event) and WITHOUT mutating
 * the Organization Registry (which is only READ as a same-tenant reference).
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, Service Bus, Key Vault, Docker,
 * registry, or external network is contacted.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege role (idempotent, re-runnable):
 *   * house_app_facility_registry_test — LOGIN, NOSUPERUSER, NOBYPASSRLS;
 *     SELECT/INSERT/UPDATE on facility_registry.facility,
 *     organization_registry.organization (read reference) + governance.outbox_message;
 *     EXECUTE current_tenant_id(). No DELETE, no superuser, no BYPASSRLS. RLS-confined.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Suite-specific tenant UUIDs (distinct from other integration suites to avoid cross-suite
// interference when the gated suites share a database). a3/b4 are reserved for THIS suite; do not
// reuse another suite's namespace (e5/f6 belongs to participant-registry-http).
const TENANT_A = '40000000-0000-4000-8000-0000000000a3';
const TENANT_B = '40000000-0000-4000-8000-0000000000b4';

const APP_ROLE = 'house_app_facility_registry_test';
const APP_PW = 'facility_app_pw';

// Shared advisory-lock key used to SERIALIZE schema setup (migrations + role provisioning) across
// gated integration suites that run in parallel. Every suite that provisions a role MUST use this
// same key so concurrent suites do not race on shared catalog rows.
const PROVISION_LOCK_KEY = 918273;

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
  // Least privilege: SELECT/INSERT/UPDATE on the facility table + the read-only org reference +
  // the shared outbox. No DELETE / TRUNCATE anywhere.
  await admin.query(`REVOKE ALL ON facility_registry.facility FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON organization_registry.organization FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON governance.outbox_message FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA facility_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA organization_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON facility_registry.facility TO ${APP_ROLE}`);
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

/** Read one facility row by id via the admin connection (no RLS confinement). */
async function adminGetFacility(
  admin: pg.Pool,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await admin.query(`SELECT * FROM facility_registry.facility WHERE id = $1`, [id]);
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

d('facility registry — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let service: FacilityRegistryService;
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
    service = new FacilityRegistryService(new PgFacilityRegistryStore(appPool), {
      organizationReader: orgStore,
    });
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    // Deterministic counts per test: remove only this suite's tenant rows (admin bypasses RLS).
    await admin.query(`DELETE FROM facility_registry.facility WHERE tenant_id = ANY($1::uuid[])`, [
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

  const createFacility = (
    tenantId = TENANT_A,
    organizationId: string,
    id = randomUUID(),
    status: 'draft' | 'active' = 'active',
  ) =>
    service.createFacility({
      tenantId,
      facilityId: id,
      organizationId,
      name: 'Reference Facility',
      facilityType: 'venue',
      status,
    });

  // (1) Migration 0011 applied.
  it('applies migration 0011', async () => {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.schema_migrations WHERE filename = $1`,
      ['0011_facility_registry.sql'],
    );
    expect(rows[0]!.n).toBe(1);
  });

  // (2) Facility table exists.
  it('creates facility_registry.facility', async () => {
    const { rows } = await admin.query<{ facility: string | null }>(
      `SELECT to_regclass('facility_registry.facility')::text AS facility`,
    );
    expect(rows[0]!.facility).toBe('facility_registry.facility');
  });

  // (3)(4) Table has RLS enabled AND forced.
  it('has ROW LEVEL SECURITY enabled AND forced on the facility table', async () => {
    const { rows } = await admin.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'facility_registry' AND c.relname = 'facility'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
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
        `INSERT INTO facility_registry.facility (id, tenant_id, organization_id, name, facility_type, status)
         VALUES ($1, $2, $3, 'No Context Facility', 'venue', 'draft')`,
        [randomUUID(), TENANT_A, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });

    await expect(
      appPool.query(`SELECT id FROM facility_registry.facility`),
    ).rejects.toMatchObject({ code: 'P0001' });
  });

  // (7) Tenant A inserts + reads its own facility (restricted role).
  it('inserts and reads a facility for its own tenant', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_A, orgId);
    const f = await createFacility(TENANT_A, orgId, id);
    expect(f.facilityId).toBe(id);
    const read = await service.getFacility(TENANT_A, id);
    expect(read?.tenantId).toBe(TENANT_A);
  });

  // (8) Tenant A cannot read a Tenant B facility.
  it('does not let Tenant A read a Tenant B facility', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_B, orgId);
    await createFacility(TENANT_B, orgId, id);
    expect(await service.getFacility(TENANT_A, id)).toBeUndefined();
    expect(await service.getFacility(TENANT_B, id)).toBeDefined();
  });

  // (8b) Same-tenant update mutates descriptive fields and emits a facility.registry.updated signal.
  it('updates a facility for its own tenant and emits an updated outbox signal', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createFacility(TENANT_A, orgId, id);
    const updated = await service.updateFacility({
      tenantId: TENANT_A,
      facilityId: id,
      name: 'Renamed Facility',
      locality: 'Ottawa',
    });
    expect(updated.name).toBe('Renamed Facility');
    expect(updated.locality).toBe('Ottawa');
    // Immutable attributes are preserved through the update.
    expect(updated.organizationId).toBe(orgId);
    expect(updated.facilityType).toBe('venue');

    const row = await adminGetFacility(admin, id);
    expect(row!['name']).toBe('Renamed Facility');
    expect(row!['locality']).toBe('Ottawa');

    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM governance.outbox_message
        WHERE message_type = $1 AND payload->>'facilityId' = $2`,
      [FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE, id],
    );
    expect(rows[0]!.n).toBe(1);
  });

  // (9) Tenant A cannot attach a facility to a Tenant B organization (cross-tenant rejected).
  it('rejects creating a facility for a different tenant organization', async () => {
    const orgId = randomUUID();
    await seedOrg(TENANT_B, orgId);
    await expect(
      service.createFacility({
        tenantId: TENANT_A,
        organizationId: orgId,
        name: 'Reference Facility',
        facilityType: 'venue',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FACILITY_ORGANIZATION_NOT_FOUND });
  });

  // (10) Listing returns only the current tenant's facilities.
  it('lists only the current tenant facilities', async () => {
    const orgA = randomUUID();
    const orgB = randomUUID();
    await seedOrg(TENANT_A, orgA);
    await seedOrg(TENANT_B, orgB);
    await createFacility(TENANT_A, orgA, randomUUID());
    await createFacility(TENANT_B, orgB, randomUUID());
    const alpha = await service.listFacilities(TENANT_A);
    expect(alpha.items.every((f) => f.tenantId === TENANT_A)).toBe(true);
    expect(alpha.items).toHaveLength(1);
  });

  // (11) A facility status change retains the row (no delete).
  it('retains the facility row on a status change', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createFacility(TENANT_A, orgId, id);
    await service.changeFacilityStatus({ tenantId: TENANT_A, facilityId: id, status: 'inactive' });
    const row = await adminGetFacility(admin, id);
    expect(row).toBeDefined();
    expect(row!['status']).toBe('inactive');
  });

  // (12) Creation writes a facility.registry.created outbox row transactionally with the row.
  it('emits a facility.registry.created outbox event transactionally with the row', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createFacility(TENANT_A, orgId, id);
    const out = await adminGetOutboxByDedupe(admin, facilityCreatedDedupeKey(id));
    expect(out).toBeDefined();
    expect(out!.message_type).toBe(FACILITY_REGISTRY_CREATED_MESSAGE_TYPE);
    expect(out!.tenant_id).toBe(TENANT_A);
    expect(out!.payload['facilityId']).toBe(id);

    const row = await adminGetFacility(admin, id);
    expect(row).toBeDefined();
  });

  // (13) A status change writes a facility.registry.status_changed outbox row.
  it('emits a facility.registry.status_changed outbox event on a status change', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createFacility(TENANT_A, orgId, id);
    await service.changeFacilityStatus({ tenantId: TENANT_A, facilityId: id, status: 'archived' });
    const { rows } = await admin.query<{ message_type: string; payload: Record<string, unknown> }>(
      `SELECT message_type, payload FROM governance.outbox_message
        WHERE message_type = $1 AND payload->>'facilityId' = $2`,
      [FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE, id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload['newStatus']).toBe('archived');
  });

  // (14) Outbox payloads carry no names, addresses, contact info, coordinates, tags, or secrets.
  it('emits sanitized payloads that exclude name, address, contact, coordinates, and tags', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await service.createFacility({
      tenantId: TENANT_A,
      facilityId: id,
      organizationId: orgId,
      name: 'SECRET-NAME-MARKER',
      facilityType: 'venue',
      addressLine1: 'SECRET-ADDRESS-MARKER',
      locality: 'SECRET-LOCALITY-MARKER',
      postalCode: 'K1A0B1',
      contactName: 'SECRET-CONTACT-MARKER',
      contactEmail: 'secret-email-marker@example.com',
      contactPhone: '+1-555-0100',
      latitude: 45.421532,
      longitude: -75.697189,
      capabilityTags: ['secret-tag-marker'],
      status: 'active',
    });
    const out = await adminGetOutboxByDedupe(admin, facilityCreatedDedupeKey(id));
    expect(out).toBeDefined();
    const serialized = JSON.stringify(out!.payload).toLowerCase();
    for (const marker of [
      'secret-name-marker',
      'secret-address-marker',
      'secret-locality-marker',
      'k1a0b1',
      'secret-contact-marker',
      'secret-email-marker',
      '555-0100',
      '45.421532',
      '-75.697189',
      'secret-tag-marker',
    ]) {
      expect(serialized, `payload must not contain ${marker}`).not.toContain(marker);
    }
    // Only the closed identity/routing key set is present.
    for (const key of [
      'name',
      'addressLine1',
      'locality',
      'postalCode',
      'contactName',
      'contactEmail',
      'contactPhone',
      'latitude',
      'longitude',
      'capabilityTags',
    ]) {
      expect(out!.payload[key], `payload must not carry ${key}`).toBeUndefined();
    }
    for (const banned of ['bearer', 'authorization', 'password', 'secret=', 'apikey', 'set-cookie']) {
      expect(serialized).not.toContain(banned);
    }
  });

  // (14b) An outbox write failure inside the create transaction rolls the facility row back
  //       (transactional-outbox atomicity: the row and its signal commit together or not at all).
  it('rolls back the facility row when the outbox write fails within the transaction', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_A, orgId);
    // Install a temporary trigger (admin) that fails the outbox INSERT for THIS facility only.
    await admin.query(`
      CREATE OR REPLACE FUNCTION facility_test_fail_outbox() RETURNS trigger AS $fn$
      BEGIN
        IF NEW.message_type LIKE 'facility.registry.%'
           AND NEW.payload->>'facilityId' = '${id}' THEN
          RAISE EXCEPTION 'forced outbox failure for rollback test';
        END IF;
        RETURN NEW;
      END;
      $fn$ LANGUAGE plpgsql;
    `);
    await admin.query(`
      CREATE TRIGGER facility_test_fail_outbox_trg
        BEFORE INSERT ON governance.outbox_message
        FOR EACH ROW EXECUTE FUNCTION facility_test_fail_outbox();
    `);
    try {
      await expect(
        service.createFacility({
          tenantId: TENANT_A,
          facilityId: id,
          organizationId: orgId,
          name: 'Rollback Facility',
          facilityType: 'venue',
          status: 'active',
        }),
      ).rejects.toBeDefined();

      // The whole transaction rolled back: neither the facility row nor any outbox row persisted.
      expect(await adminGetFacility(admin, id)).toBeUndefined();
      expect(await adminGetOutboxByDedupe(admin, facilityCreatedDedupeKey(id))).toBeUndefined();
    } finally {
      await admin.query(
        `DROP TRIGGER IF EXISTS facility_test_fail_outbox_trg ON governance.outbox_message`,
      );
      await admin.query(`DROP FUNCTION IF EXISTS facility_test_fail_outbox()`);
    }
  });

  // (15)(16)(17) The registry never creates or mutates a governed lifecycle row.
  it('does not create or mutate any governed lifecycle row (entity_state/state_transition/audit_event)', async () => {
    const tables = [
      'governance.entity_state',
      'governance.state_transition',
      'governance.audit_event',
    ] as const;
    const before = await Promise.all(tables.map((t) => countForTenants(admin, t)));

    const orgId = randomUUID();
    const id = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createFacility(TENANT_A, orgId, id);
    await service.changeFacilityStatus({ tenantId: TENANT_A, facilityId: id, status: 'inactive' });

    const after = await Promise.all(tables.map((t) => countForTenants(admin, t)));
    expect(after).toEqual(before);
    expect(after).toEqual([0, 0, 0]);
  });

  // (18) The registry only READS the Organization Registry; it never mutates an organization row.
  it('does not mutate any Organization Registry row', async () => {
    const orgId = randomUUID();
    const id = randomUUID();
    const org = await seedOrg(TENANT_A, orgId);
    const beforeRows = await admin.query<{ display_name: string; status: string; updated_at: string }>(
      `SELECT display_name, status, updated_at FROM organization_registry.organization WHERE id = $1`,
      [orgId],
    );
    const before = beforeRows.rows[0]!;

    await createFacility(TENANT_A, orgId, id);
    await service.updateFacility({ tenantId: TENANT_A, facilityId: id, locality: 'Ottawa' });
    await service.changeFacilityStatus({ tenantId: TENANT_A, facilityId: id, status: 'inactive' });

    const afterRows = await admin.query<{ display_name: string; status: string; updated_at: string }>(
      `SELECT display_name, status, updated_at FROM organization_registry.organization WHERE id = $1`,
      [orgId],
    );
    const after = afterRows.rows[0]!;
    expect(after.display_name).toBe(before.display_name);
    expect(after.status).toBe(before.status);
    expect(after.updated_at).toStrictEqual(before.updated_at);
    expect(org.organizationId).toBe(orgId);

    // Exactly one organization row exists for this tenant (no inserts/duplicates from the registry).
    expect(await countForTenants(admin, 'organization_registry.organization')).toBe(1);
  });

  // (19) The restricted app role has SELECT/INSERT/UPDATE only on the facility table — never DELETE.
  it('grants the restricted app role no DELETE on facility_registry.facility', async () => {
    const { rows } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'facility_registry' AND table_name = 'facility'`,
      [APP_ROLE],
    );
    const privileges = new Set(rows.map((r) => r.privilege_type));
    expect(privileges).toEqual(new Set(['SELECT', 'INSERT', 'UPDATE']));
    expect(privileges.has('DELETE')).toBe(false);
    expect(privileges.has('TRUNCATE')).toBe(false);
  });

  // (extra) The registry table carries no sport-specific column terminology (NSO-generic core).
  it('exposes no sport-specific column terminology (NSO-generic platform core)', async () => {
    const { rows } = await admin.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'facility_registry' AND table_name = 'facility'`,
    );
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
