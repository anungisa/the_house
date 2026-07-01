import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';

import { createAffiliationHttpServer } from '../../../src/http/server.js';
import type { AffiliationCommandExecutor } from '../../../src/http/AffiliationHttpAdapter.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import { PgFacilityRegistryStore } from '../../../src/domains/facility-registry/PgFacilityRegistryStore.js';
import { PgParticipantRegistryStore } from '../../../src/domains/participant-registry/PgParticipantRegistryStore.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';

const { fetch } = globalThis;
const { Buffer } = globalThis;

/**
 * Gated PostgreSQL integration tests for the FACILITY REGISTRY HTTP READ surface, driven through
 * the REAL native HTTP server (`createAffiliationHttpServer`) over an ephemeral loopback listener
 * with `fetch`, backed by the REAL `PgFacilityRegistryStore` running as a restricted, RLS-confined
 * role.
 *
 * These prove, against REAL PostgreSQL, that an authorized operator can list and read tenant-scoped
 * facilities through the three GET routes while FORCE Row-Level Security keeps tenants isolated, the
 * closed-key `FacilityDto` (which OMITS `tenantId`) never leaks unsafe fields, and reads are
 * strictly READ-ONLY: they NEVER enqueue an outbox message, NEVER mutate the facility registry, the
 * Organization Registry, or any governed lifecycle table. The runtime role holds SELECT only (no
 * INSERT/UPDATE/DELETE), proving reads require no write privileges. Telemetry privacy is proven by
 * the hermetic adapter unit tests (the server wires no telemetry sink), so it is not re-asserted
 * here.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, antivirus, Service Bus, Key Vault,
 * Docker, registry, Cosign, or external network is contacted.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege READ role (idempotent, re-runnable):
 *   * house_app_facility_http_read_test — LOGIN, NOSUPERUSER, NOBYPASSRLS; SELECT only on
 *     facility_registry.facility, participant_registry.participant, and
 *     participant_registry.organization_participant (the last two only so the participant read
 *     routes stay live to prove the facility routes do not shadow them); EXECUTE
 *     current_tenant_id(). No INSERT/UPDATE/DELETE anywhere.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Suite-specific tenant UUIDs (distinct from every other integration suite: a9/ba are reserved for
// THIS suite; do not reuse a3/b4 [facility-registry], e5/f6 [participant-registry-http], etc.).
const TENANT_A = '40000000-0000-4000-8000-0000000000a9';
const TENANT_B = '40000000-0000-4000-8000-0000000000ba';

// Same-tenant organization ids (plain uuids; the facility read path never probes org existence).
const ORG_A1 = '40000000-0000-4000-8000-0000000000c9';
const ORG_A2 = '40000000-0000-4000-8000-0000000000ca';
const ORG_B1 = '40000000-0000-4000-8000-0000000000cb';

const APP_ROLE = 'house_app_facility_http_read_test';
const APP_PW = 'facility_http_read_pw';

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
  // Least privilege for a READ surface: SELECT only. No INSERT/UPDATE/DELETE/TRUNCATE anywhere —
  // reads require no write grants.
  await admin.query(`REVOKE ALL ON facility_registry.facility FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON participant_registry.participant FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON participant_registry.organization_participant FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA facility_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA participant_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT ON facility_registry.facility TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT ON participant_registry.participant TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT ON participant_registry.organization_participant TO ${APP_ROLE}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

interface SeedFacilityOverrides {
  id?: string;
  organizationId?: string;
  name?: string;
  facilityType?: string;
  status?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  visibility?: string | null;
  capabilityTags?: string[] | null;
  createdAt?: string;
}

/** Seed a facility row directly via the admin (RLS-bypassing) connection. */
async function seedFacility(
  admin: pg.Pool,
  tenantId: string,
  over: SeedFacilityOverrides = {},
): Promise<string> {
  const id = over.id ?? randomUUID();
  const createdAt = over.createdAt ?? new Date().toISOString();
  await admin.query(
    `INSERT INTO facility_registry.facility
       (id, tenant_id, organization_id, name, facility_type, status,
        address_line1, address_line2, locality, region, postal_code, country_code,
        latitude, longitude, contact_name, contact_email, contact_phone,
        visibility, capability_tags, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20)`,
    [
      id,
      tenantId,
      over.organizationId ?? ORG_A1,
      over.name ?? 'Central Venue',
      over.facilityType ?? 'venue',
      over.status ?? 'active',
      over.addressLine1 ?? null,
      over.addressLine2 ?? null,
      over.locality ?? null,
      over.region ?? null,
      over.postalCode ?? null,
      over.countryCode ?? null,
      over.latitude ?? null,
      over.longitude ?? null,
      over.contactName ?? null,
      over.contactEmail ?? null,
      over.contactPhone ?? null,
      over.visibility ?? null,
      over.capabilityTags ?? null,
      createdAt,
    ],
  );
  return id;
}

/** Count rows for the suite's tenants in a tenant-owned table (admin bypasses RLS). */
async function countForTenants(admin: pg.Pool, table: string): Promise<number> {
  const { rows } = await admin.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${table} WHERE tenant_id = ANY($1::uuid[])`,
    [[TENANT_A, TENANT_B]],
  );
  return Number(rows[0]!.n);
}

class FailingExecutor implements AffiliationCommandExecutor {
  executeCommand(
    _command: string,
    _request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return Promise.reject(new Error('read routes must never call the command executor'));
  }
}

function headers(
  tenantId: string | undefined,
  over: Record<string, string> = {},
): Record<string, string> {
  const h: Record<string, string> = {
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'facility_reader',
    ...over,
  };
  if (tenantId !== undefined) h['x-house-tenant-id'] = tenantId;
  return h;
}

const ALLOWED_FACILITY_DTO_KEYS = new Set([
  'facilityId',
  'organizationId',
  'name',
  'facilityType',
  'status',
  'addressLine1',
  'addressLine2',
  'locality',
  'region',
  'postalCode',
  'countryCode',
  'latitude',
  'longitude',
  'contactName',
  'contactEmail',
  'contactPhone',
  'visibility',
  'capabilityTags',
  'createdAt',
  'updatedAt',
]);

d('facility registry HTTP read surface — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });

    server = createAffiliationHttpServer({
      executor: new FailingExecutor(),
      resolver: new TrustedHeadersAuthContextResolver(),
      facilityRead: { readStore: new PgFacilityRegistryStore(appPool) },
      participantRead: { readStore: new PgParticipantRegistryStore(appPool) },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    await admin.query(`DELETE FROM facility_registry.facility WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  });

  // ---- environment invariants -------------------------------------------------------------

  // (31) FORCE RLS remains enabled on facility_registry.facility.
  it('(31) facility table has RLS enabled AND forced', async () => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'facility_registry' AND c.relname = 'facility'`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // (32) The runtime role is non-superuser, non-BYPASSRLS, with SELECT only (no write grants).
  it('(32) runtime role is NOSUPERUSER, NOBYPASSRLS, SELECT-only', async () => {
    const { rows: role } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(role[0]!.rolsuper).toBe(false);
    expect(role[0]!.rolbypassrls).toBe(false);

    const { rows: grants } = await admin.query<{ privilege_type: string }>(
      `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = $1
          AND table_schema IN ('facility_registry', 'participant_registry')`,
      [APP_ROLE],
    );
    const privileges = new Set(grants.map((r) => r.privilege_type));
    expect(privileges).toEqual(new Set(['SELECT']));
    expect(privileges.has('INSERT')).toBe(false);
    expect(privileges.has('UPDATE')).toBe(false);
    expect(privileges.has('DELETE')).toBe(false);
  });

  // ---- happy-path reads through the real HTTP server --------------------------------------

  // (1) GET /v1/facilities lists same-tenant facilities.
  it('(1) lists same-tenant facilities over HTTP', async () => {
    const id1 = await seedFacility(admin, TENANT_A, { createdAt: '2026-01-01T00:00:00.000Z' });
    const id2 = await seedFacility(admin, TENANT_A, { createdAt: '2026-01-02T00:00:00.000Z' });
    await seedFacility(admin, TENANT_B); // other tenant — must not appear

    const res = await fetch(`${baseUrl}/v1/facilities`, { headers: headers(TENANT_A) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ facilityId: string }> };
    expect(new Set(body.items.map((i) => i.facilityId))).toEqual(new Set([id1, id2]));
  });

  // (2) GET /v1/facilities/:facilityId returns same-tenant detail.
  it('(2) returns same-tenant facility detail over HTTP', async () => {
    const id = await seedFacility(admin, TENANT_A, { name: 'Head Office' });
    const res = await fetch(`${baseUrl}/v1/facilities/${id}`, { headers: headers(TENANT_A) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { facility: { facilityId: string; name: string } };
    expect(body.facility.facilityId).toBe(id);
    expect(body.facility.name).toBe('Head Office');
  });

  // (3) GET /v1/organizations/:organizationId/facilities lists same-tenant org-scoped facilities.
  it('(3) lists same-tenant org-scoped facilities over HTTP', async () => {
    const inOrg = await seedFacility(admin, TENANT_A, { organizationId: ORG_A1 });
    await seedFacility(admin, TENANT_A, { organizationId: ORG_A2 }); // different org — excluded

    const res = await fetch(`${baseUrl}/v1/organizations/${ORG_A1}/facilities`, {
      headers: headers(TENANT_A),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ facilityId: string }> };
    expect(body.items.map((i) => i.facilityId)).toEqual([inOrg]);
  });

  // ---- DTO shape / privacy ----------------------------------------------------------------

  // (4) Facility DTO is closed-key and excludes tenantId.
  it('(4) facility DTO is closed-key and excludes tenantId', async () => {
    const id = await seedFacility(admin, TENANT_A, {
      addressLine1: '1 Main St',
      contactEmail: 'ops@example.test',
      latitude: 45.5,
      longitude: -73.6,
      capabilityTags: ['accessible'],
    });
    const res = await fetch(`${baseUrl}/v1/facilities/${id}`, { headers: headers(TENANT_A) });
    const body = (await res.json()) as { facility: Record<string, unknown> };
    expect(new Set(Object.keys(body.facility))).toEqual(ALLOWED_FACILITY_DTO_KEYS);
    expect('tenantId' in body.facility).toBe(false);
    // The tenant id string never appears anywhere in the response body.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(TENANT_A);
  });

  // (5) Facility DTO null-normalizes optional fields.
  it('(5) facility DTO null-normalizes optional fields', async () => {
    const id = await seedFacility(admin, TENANT_A); // all optionals null
    const res = await fetch(`${baseUrl}/v1/facilities/${id}`, { headers: headers(TENANT_A) });
    const f = ((await res.json()) as { facility: Record<string, unknown> }).facility;
    for (const key of [
      'addressLine1',
      'addressLine2',
      'locality',
      'region',
      'postalCode',
      'countryCode',
      'latitude',
      'longitude',
      'contactName',
      'contactEmail',
      'contactPhone',
      'visibility',
    ]) {
      expect(f[key]).toBeNull();
    }
    expect(f['capabilityTags']).toEqual([]);
  });

  // ---- authorization matrix ---------------------------------------------------------------

  // (6) The exact facility.read permission works.
  it('(6) exact facility.read permission is authorized', async () => {
    await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: headers(TENANT_A, {
        'x-house-actor-role-keys': '',
        'x-house-actor-permission-keys': 'facility.read',
      }),
    });
    expect(res.status).toBe(200);
  });

  // (7) The facility_reader role works.
  it('(7) facility_reader role is authorized', async () => {
    await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: headers(TENANT_A, { 'x-house-actor-role-keys': 'facility_reader' }),
    });
    expect(res.status).toBe(200);
  });

  // (8) The facility_admin role works.
  it('(8) facility_admin role is authorized', async () => {
    await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: headers(TENANT_A, { 'x-house-actor-role-keys': 'facility_admin' }),
    });
    expect(res.status).toBe(200);
  });

  // (9) The platform_admin wildcard works.
  it('(9) platform_admin wildcard is authorized', async () => {
    await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: headers(TENANT_A, { 'x-house-actor-role-keys': 'platform_admin' }),
    });
    expect(res.status).toBe(200);
  });

  // (10) Missing tenant identity returns 401.
  it('(10) missing tenant identity returns 401', async () => {
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: { 'x-house-actor-user-id': randomUUID(), 'x-house-actor-role-keys': 'facility_reader' },
    });
    expect(res.status).toBe(401);
  });

  // (11) An authenticated actor without facility.read returns 403.
  it('(11) authenticated actor without facility.read returns 403', async () => {
    await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: headers(TENANT_A, { 'x-house-actor-role-keys': 'member' }),
    });
    expect(res.status).toBe(403);
  });

  // (12) organization_reader alone cannot read facilities.
  it('(12) organization_reader alone cannot read facilities (403)', async () => {
    await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: headers(TENANT_A, { 'x-house-actor-role-keys': 'organization_reader' }),
    });
    expect(res.status).toBe(403);
  });

  // (13) participant_reader alone cannot read facilities.
  it('(13) participant_reader alone cannot read facilities (403)', async () => {
    await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: headers(TENANT_A, { 'x-house-actor-role-keys': 'participant_reader' }),
    });
    expect(res.status).toBe(403);
  });

  // ---- tenant isolation / not-found -------------------------------------------------------

  // (14) Cross-tenant facility detail returns 404 (never reveals existence).
  it('(14) cross-tenant facility detail returns 404', async () => {
    const bId = await seedFacility(admin, TENANT_B);
    const res = await fetch(`${baseUrl}/v1/facilities/${bId}`, { headers: headers(TENANT_A) });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('FACILITY_NOT_FOUND');
  });

  // (15) A missing facility detail returns 404.
  it('(15) missing facility detail returns 404', async () => {
    const res = await fetch(`${baseUrl}/v1/facilities/${randomUUID()}`, {
      headers: headers(TENANT_A),
    });
    expect(res.status).toBe(404);
  });

  // (16) A cross-tenant org-scoped list returns an empty list (never reveals existence).
  it('(16) cross-tenant org-scoped list returns empty', async () => {
    await seedFacility(admin, TENANT_B, { organizationId: ORG_B1 });
    const res = await fetch(`${baseUrl}/v1/organizations/${ORG_B1}/facilities`, {
      headers: headers(TENANT_A),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  // (17) An unknown org-scoped list returns an empty list.
  it('(17) unknown org-scoped list returns empty', async () => {
    const res = await fetch(`${baseUrl}/v1/organizations/${randomUUID()}/facilities`, {
      headers: headers(TENANT_A),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  // ---- filter validation (fail closed at the HTTP boundary) -------------------------------

  // (18) An invalid status filter returns 400.
  it('(18) invalid status filter returns 400', async () => {
    const res = await fetch(`${baseUrl}/v1/facilities?status=bogus`, { headers: headers(TENANT_A) });
    expect(res.status).toBe(400);
  });

  // (19) An invalid facilityType filter returns 400.
  it('(19) invalid facilityType filter returns 400', async () => {
    const res = await fetch(`${baseUrl}/v1/facilities?facilityType=stadium`, {
      headers: headers(TENANT_A),
    });
    expect(res.status).toBe(400);
  });

  // (20) An invalid limit returns 400.
  it('(20) invalid limit returns 400', async () => {
    const res = await fetch(`${baseUrl}/v1/facilities?limit=-1`, { headers: headers(TENANT_A) });
    expect(res.status).toBe(400);
  });

  // (21) An invalid cursor returns 400.
  it('(21) invalid cursor returns 400', async () => {
    const res = await fetch(`${baseUrl}/v1/facilities?cursor=not-a-cursor`, {
      headers: headers(TENANT_A),
    });
    expect(res.status).toBe(400);
  });

  // (22) The limit max (100) is enforced at the HTTP boundary (below the domain cap of 200).
  it('(22) limit max is clamped to 100 at the HTTP boundary', async () => {
    await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities?limit=150`, { headers: headers(TENANT_A) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { page: { limit: number } };
    expect(body.page.limit).toBe(100);
  });

  // (23) Cursor pagination works and the cursor exposes no tenant id or SQL internals.
  it('(23) cursor pagination works and the cursor leaks no tenant id', async () => {
    const id1 = await seedFacility(admin, TENANT_A, { createdAt: '2026-03-01T00:00:00.000Z' });
    const id2 = await seedFacility(admin, TENANT_A, { createdAt: '2026-03-02T00:00:00.000Z' });
    const id3 = await seedFacility(admin, TENANT_A, { createdAt: '2026-03-03T00:00:00.000Z' });

    const page1 = (await (
      await fetch(`${baseUrl}/v1/facilities?limit=2`, { headers: headers(TENANT_A) })
    ).json()) as { items: Array<{ facilityId: string }>; page: { nextCursor: string | null } };
    expect(page1.items.map((i) => i.facilityId)).toEqual([id1, id2]);
    expect(page1.page.nextCursor).not.toBeNull();

    // The opaque cursor decodes to ONLY { createdAt, id } — no tenant id, no SQL text.
    const decoded = JSON.parse(
      Buffer.from(page1.page.nextCursor!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(new Set(Object.keys(decoded))).toEqual(new Set(['createdAt', 'id']));
    expect(JSON.stringify(decoded)).not.toContain(TENANT_A);

    const page2 = (await (
      await fetch(
        `${baseUrl}/v1/facilities?limit=2&cursor=${encodeURIComponent(page1.page.nextCursor!)}`,
        { headers: headers(TENANT_A) },
      )
    ).json()) as { items: Array<{ facilityId: string }>; page: { nextCursor: string | null } };
    expect(page2.items.map((i) => i.facilityId)).toEqual([id3]);
    expect(page2.page.nextCursor).toBeNull();
  });

  // ---- routing / method / shadowing -------------------------------------------------------

  // (24) An unsupported method returns 405 with Allow: GET.
  it('(24) unsupported method returns 405 with Allow: GET', async () => {
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      method: 'POST',
      headers: headers(TENANT_A),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  // (25) A deeper unknown facility path returns 404.
  it('(25) deeper unknown facility path returns 404', async () => {
    const id = await seedFacility(admin, TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities/${id}/extra`, { headers: headers(TENANT_A) });
    expect(res.status).toBe(404);
  });

  // (26) The org-facilities route does not shadow the org-participants route.
  it('(26) org-facilities does not shadow org-participants', async () => {
    // The participant read route is live; with no relationships it returns an empty list (200),
    // proving the org-facilities regex did NOT capture the participants path.
    const res = await fetch(`${baseUrl}/v1/organizations/${ORG_A1}/participants`, {
      headers: headers(TENANT_A, { 'x-house-actor-role-keys': 'participant_reader' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  // ---- read-only invariants (no mutation, no outbox) --------------------------------------

  // (27) Reads create no outbox rows. (28/29/30) Reads mutate nothing.
  it('(27,28,29,30) reads enqueue no outbox and mutate no rows', async () => {
    const id = await seedFacility(admin, TENANT_A, { organizationId: ORG_A1 });

    const facilitiesBefore = await countForTenants(admin, 'facility_registry.facility');
    const orgsBefore = await countForTenants(admin, 'organization_registry.organization');
    const entityStateBefore = await countForTenants(admin, 'governance.entity_state');
    const stateTransitionBefore = await countForTenants(admin, 'governance.state_transition');
    const auditBefore = await countForTenants(admin, 'governance.audit_event');
    const outboxBefore = await countForTenants(admin, 'governance.outbox_message');

    await fetch(`${baseUrl}/v1/facilities`, { headers: headers(TENANT_A) });
    await fetch(`${baseUrl}/v1/facilities/${id}`, { headers: headers(TENANT_A) });
    await fetch(`${baseUrl}/v1/organizations/${ORG_A1}/facilities`, { headers: headers(TENANT_A) });

    expect(await countForTenants(admin, 'facility_registry.facility')).toBe(facilitiesBefore);
    expect(await countForTenants(admin, 'organization_registry.organization')).toBe(orgsBefore);
    expect(await countForTenants(admin, 'governance.entity_state')).toBe(entityStateBefore);
    expect(await countForTenants(admin, 'governance.state_transition')).toBe(stateTransitionBefore);
    expect(await countForTenants(admin, 'governance.audit_event')).toBe(auditBefore);
    // (27) specifically: still zero outbox rows for these tenants after three reads.
    expect(await countForTenants(admin, 'governance.outbox_message')).toBe(outboxBefore);
    expect(await countForTenants(admin, 'governance.outbox_message')).toBe(0);
  });
});
