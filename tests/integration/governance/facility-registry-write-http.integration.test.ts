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
import { PgOrganizationRegistryStore } from '../../../src/domains/organization-registry/PgOrganizationRegistryStore.js';
import { FacilityRegistryService } from '../../../src/domains/facility-registry/FacilityRegistryService.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import { AuthorizationAction } from '../../../src/authz/index.js';

const { fetch } = globalThis;

/**
 * Gated PostgreSQL integration tests for the FACILITY REGISTRY HTTP WRITE surface (create + update
 * + status transition), driven through the REAL native HTTP server (`createAffiliationHttpServer`)
 * over an ephemeral loopback listener with `fetch`, backed by the REAL `PgFacilityRegistryStore`
 * + `FacilityRegistryService` running as a restricted, RLS-confined role.
 *
 * These prove, against REAL PostgreSQL, that an authorized operator can create and update
 * tenant-scoped facilities through `POST /v1/facilities` and `PATCH /v1/facilities/:facilityId`
 * while FORCE Row-Level Security keeps tenants isolated, the closed-key `FacilityDto` (which OMITS
 * `tenantId`) never leaks unsafe fields, each mutation atomically enqueues exactly one sanitized
 * registry outbox message in the SAME transaction as the row, and the write path NEVER touches the
 * Governance Kernel, any governed lifecycle table, or the Organization Registry. A facility STATUS
 * transition (`POST /v1/facilities/:facilityId/status-transitions`) is a distinct reference-data
 * route gated by the SEPARATE `facility.status.write` action (NOT implied by `facility.write`); the
 * `(S…)` section below validates it end-to-end over the same real PostgreSQL/RLS path — an
 * authorized status change flips the row status, emits exactly one sanitized
 * `facility.registry.status_changed` outbox row (never name/address/contact/coordinates/tags/
 * `reason`), a same-status POST is a 200 no-op emitting no new signal, and the path never mutates
 * the Organization Registry nor any governed lifecycle table.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, antivirus, Service Bus, Key Vault,
 * Docker, registry, Cosign, or external network is contacted.
 *
 * TELEMETRY: the server wires NO telemetry sink for the facility write transport here (the deps
 * are constructed directly without one), so telemetry privacy is proven by the hermetic adapter
 * unit tests, NOT re-asserted here.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege WRITE role (idempotent, re-runnable):
 *   * house_app_facility_http_write_test — LOGIN, NOSUPERUSER, NOBYPASSRLS; SELECT/INSERT/UPDATE
 *     on facility_registry.facility (the create duplicate pre-check + row read need SELECT, the
 *     create/update need INSERT/UPDATE), SELECT/INSERT/UPDATE on governance.outbox_message (the
 *     transactional outbox), SELECT on organization_registry.organization (create confirms a
 *     same-tenant organization exists), SELECT on the participant tables (only so the participant
 *     read routes stay live to prove the facility routes do not shadow them), and EXECUTE
 *     current_tenant_id(). NO DELETE anywhere; NO grants on governance lifecycle tables.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Suite-specific tenant UUIDs. These are DISTINCT from every other integration suite (a3/b4
// facility-registry, a9/ba facility-http-read, a7/b8 participant-http-write, e5/f6
// participant-registry-http, c3/d4 participant-registry, etc.): d5/e6 are reserved for THIS suite.
const TENANT_A = '40000000-0000-4000-8000-0000000000d5';
const TENANT_B = '40000000-0000-4000-8000-0000000000e6';

// Same-tenant organization ids (seeded via admin so a create can confirm org existence).
const ORG_A = '40000000-0000-4000-8000-0000000000d7';
const ORG_B = '40000000-0000-4000-8000-0000000000e7';

const APP_ROLE = 'house_app_facility_http_write_test';
const APP_PW = 'facility_http_write_pw';

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

/** Provision the least-privilege WRITE application role (idempotent, re-run safe). */
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
  // Least privilege for the WRITE surface: SELECT/INSERT/UPDATE on the facility table (the create
  // duplicate pre-check + row read need SELECT; create/update need INSERT/UPDATE), plus the
  // transactional outbox. SELECT on organization_registry.organization so create can confirm a
  // same-tenant organization exists. SELECT on the participant tables ONLY so the participant read
  // routes stay live (to prove the facility routes do not shadow them). NO DELETE anywhere, and NO
  // grants on governance lifecycle tables (entity_state / state_transition / audit_event) — the
  // registry never touches them.
  await admin.query(`REVOKE ALL ON facility_registry.facility FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON organization_registry.organization FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON participant_registry.participant FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON participant_registry.organization_participant FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON governance.outbox_message FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA facility_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA organization_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA participant_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON facility_registry.facility TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT ON organization_registry.organization TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT ON participant_registry.participant TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT ON participant_registry.organization_participant TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON governance.outbox_message TO ${APP_ROLE}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

// --- admin query helpers ---------------------------------------------------------------------

async function adminGetFacility(
  admin: pg.Pool,
  tenantId: string,
  facilityId: string,
): Promise<
  | {
      name: string;
      status: string;
      organization_id: string;
      facility_type: string;
      address_line1: string | null;
      contact_email: string | null;
      visibility: string | null;
    }
  | undefined
> {
  const { rows } = await admin.query<{
    name: string;
    status: string;
    organization_id: string;
    facility_type: string;
    address_line1: string | null;
    contact_email: string | null;
    visibility: string | null;
  }>(
    `SELECT name, status, organization_id, facility_type, address_line1, contact_email, visibility
       FROM facility_registry.facility WHERE tenant_id = $1 AND id = $2`,
    [tenantId, facilityId],
  );
  return rows[0];
}

async function adminCountFacilities(admin: pg.Pool, tenantId: string): Promise<number> {
  const { rows } = await admin.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM facility_registry.facility WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(rows[0]!.n);
}

async function adminGetOutboxByType(
  admin: pg.Pool,
  messageType: string,
  tenantId: string,
): Promise<Array<{ payload: Record<string, unknown> }>> {
  const { rows } = await admin.query<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM governance.outbox_message
       WHERE message_type = $1 AND tenant_id = $2`,
    [messageType, tenantId],
  );
  return rows;
}

async function adminCountGovernance(
  admin: pg.Pool,
  tenantId: string,
): Promise<{ entityState: number; stateTransition: number; auditEvent: number }> {
  const count = async (table: string): Promise<number> => {
    const { rows } = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM governance.${table} WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(rows[0]!.n);
  };
  return {
    entityState: await count('entity_state'),
    stateTransition: await count('state_transition'),
    auditEvent: await count('audit_event'),
  };
}

async function adminGetOrganization(
  admin: pg.Pool,
  tenantId: string,
  organizationId: string,
): Promise<{ display_name: string; status: string } | undefined> {
  const { rows } = await admin.query<{ display_name: string; status: string }>(
    `SELECT display_name, status FROM organization_registry.organization
       WHERE tenant_id = $1 AND id = $2`,
    [tenantId, organizationId],
  );
  return rows[0];
}

// --- trusted-header identities ---------------------------------------------------------------

type Headers = Record<string, string>;

/** A facility.write-capable actor (facility_admin role) + a fresh idempotency key. */
function writerHeaders(tenantId: string, over: Headers = {}): Headers {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'facility_admin',
    'idempotency-key': `idem-${randomUUID()}`,
    ...over,
  };
}

/** An actor holding the EXACT `facility.write` permission (no roles). */
function exactWriteHeaders(tenantId: string, over: Headers = {}): Headers {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-permission-keys': 'facility.write',
    'idempotency-key': `idem-${randomUUID()}`,
    ...over,
  };
}

/** A platform_admin actor (wildcard). */
function platformAdminHeaders(tenantId: string, over: Headers = {}): Headers {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'platform_admin',
    'idempotency-key': `idem-${randomUUID()}`,
    ...over,
  };
}

/** A read-only actor (facility_reader role → facility.read but NOT facility.write). */
function readerHeaders(tenantId: string, over: Headers = {}): Headers {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'facility_reader',
    'idempotency-key': `idem-${randomUUID()}`,
    ...over,
  };
}

/** An actor holding the EXACT `facility.read` permission ONLY (no facility.write). */
function exactReadHeaders(tenantId: string, over: Headers = {}): Headers {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-permission-keys': 'facility.read',
    'idempotency-key': `idem-${randomUUID()}`,
    ...over,
  };
}

/** An organization_reader actor (organization.read only → no facility.write). */
function orgReaderHeaders(tenantId: string, over: Headers = {}): Headers {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'organization_reader',
    'idempotency-key': `idem-${randomUUID()}`,
    ...over,
  };
}

// --- request helpers (real HTTP over fetch) --------------------------------------------------

interface HttpResult {
  status: number;
  allow: string | null;
  body: Record<string, unknown>;
}

async function readResult(res: Awaited<ReturnType<typeof fetch>>): Promise<HttpResult> {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text !== '') {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, allow: res.headers.get('allow'), body };
}

let baseUrl = '';

async function postFacility(headers: Headers, body: unknown): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}/v1/facilities`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return readResult(res);
}

async function patchFacility(
  headers: Headers,
  facilityId: string,
  body: unknown,
): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}/v1/facilities/${facilityId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return readResult(res);
}

async function patchFacilityRaw(
  headers: Headers,
  facilityId: string,
  raw: string,
): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}/v1/facilities/${facilityId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  });
  return readResult(res);
}

async function getJson(path: string, headers: Headers): Promise<HttpResult> {
  const res = await fetch(`${baseUrl}${path}`, { headers });
  return readResult(res);
}

// --- payload/DTO shape constants -------------------------------------------------------------

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

/**
 * The CLOSED set of safe keys a facility created/updated outbox payload may carry: stable
 * identifiers, the facility type/status, optional visibility, and correlation lineage only. NEVER
 * name, address, contact fields, coordinates, capability tags, headers, tokens, or bytes.
 */
const SAFE_FACILITY_OUTBOX_KEYS = new Set([
  'facilityId',
  'tenantId',
  'organizationId',
  'facilityType',
  'status',
  'visibility',
  'actorUserId',
  'requestId',
  'correlationId',
]);

// Sentinel PII/secret fragments seeded into a create/update body that MUST NOT appear in an outbox
// payload. Coordinates + tags are excluded from the sanitized signal entirely.
const SECRET_NAME = 'Central Venue Secret';
const SECRET_ADDRESS = '1 Secret Road';
const SECRET_CONTACT_NAME = 'Jane Manager';
const SECRET_EMAIL = 'ops@secret.test';
const SECRET_PHONE = '+1-555-0100';
const SECRET_TAG = 'secret-capability';

const FORBIDDEN_PAYLOAD_SENTINELS = [
  SECRET_NAME,
  'Secret',
  SECRET_ADDRESS,
  SECRET_CONTACT_NAME,
  'Manager',
  SECRET_EMAIL,
  '@secret.test',
  SECRET_PHONE,
  SECRET_TAG,
  'Bearer ',
  'x-house-',
  'postgres://',
  'postgresql://',
  'password',
];

/** A full-PII create body for the given org (facilityId defaults to a fresh uuid). */
function piiCreateBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    facilityId: randomUUID(),
    organizationId: ORG_A,
    name: SECRET_NAME,
    facilityType: 'venue',
    status: 'draft',
    addressLine1: SECRET_ADDRESS,
    locality: 'Secretville',
    region: 'QC',
    postalCode: 'H0H0H0',
    countryCode: 'CA',
    latitude: 45.5,
    longitude: -73.6,
    contactName: SECRET_CONTACT_NAME,
    contactEmail: SECRET_EMAIL,
    contactPhone: SECRET_PHONE,
    visibility: 'internal',
    capabilityTags: [SECRET_TAG],
    ...over,
  };
}

class FailingExecutor implements AffiliationCommandExecutor {
  executeCommand(
    _command: string,
    _request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return Promise.reject(new Error('facility routes must never call the command executor'));
  }
}

d('facility registry HTTP write surface — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let server: Server;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });

    const facilityStore = new PgFacilityRegistryStore(appPool);
    const service = new FacilityRegistryService(facilityStore, {
      organizationReader: new PgOrganizationRegistryStore(appPool),
    });

    server = createAffiliationHttpServer({
      executor: new FailingExecutor(),
      resolver: new TrustedHeadersAuthContextResolver(),
      facilityRead: { readStore: facilityStore },
      facilityWrite: { service, readStore: facilityStore },
      participantRead: { readStore: new PgParticipantRegistryStore(appPool) },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    // Seed one active organization per tenant via admin (superuser bypasses RLS) so a create can
    // confirm same-tenant organization existence.
    await admin.query(
      `INSERT INTO organization_registry.organization (id, tenant_id, organization_type, display_name, status)
         VALUES ($1, $2, 'local', 'Org A', 'active'), ($3, $4, 'local', 'Org B', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [ORG_A, TENANT_A, ORG_B, TENANT_B],
    );
  });

  afterAll(async () => {
    if (server !== undefined) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await admin?.query(`DELETE FROM organization_registry.organization WHERE id = ANY($1::uuid[])`, [
      [ORG_A, ORG_B],
    ]);
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

  // ==== environment / role / grant invariants (F) ==========================================

  // (F1) FORCE RLS remains enabled on facility_registry.facility.
  it('(F1) facility table has RLS enabled AND forced', async () => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'facility_registry' AND c.relname = 'facility'`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // (F2/F3/F4) The runtime role is NOSUPERUSER, NOBYPASSRLS, and has SELECT/INSERT/UPDATE (no
  // DELETE) on the facility table.
  it('(F2/F3/F4) runtime role is NOSUPERUSER, NOBYPASSRLS, no DELETE on facility', async () => {
    const { rows: role } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(role[0]!.rolsuper).toBe(false);
    expect(role[0]!.rolbypassrls).toBe(false);

    const { rows: grants } = await admin.query<{ privilege_type: string }>(
      `SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'facility_registry' AND table_name = 'facility'`,
      [APP_ROLE],
    );
    const privileges = new Set(grants.map((r) => r.privilege_type));
    expect(privileges).toEqual(new Set(['SELECT', 'INSERT', 'UPDATE']));
    expect(privileges.has('DELETE')).toBe(false);
    expect(privileges.has('TRUNCATE')).toBe(false);
  });

  // ==== CREATE (C) =========================================================================

  // (C1) A facility.write actor creates a same-tenant facility over the real HTTP/Pg path.
  it('(C1) creates a same-tenant facility over the HTTP write path', async () => {
    const id = randomUUID();
    const res = await postFacility(writerHeaders(TENANT_A), {
      facilityId: id,
      organizationId: ORG_A,
      name: 'Main Arena',
      facilityType: 'venue',
    });
    expect(res.status).toBe(201);
    expect(res.body['status']).toBe('ok');
    const facility = res.body['facility'] as Record<string, unknown>;
    expect(facility['facilityId']).toBe(id);
    expect(facility['status']).toBe('draft');

    const row = await adminGetFacility(admin, TENANT_A, id);
    expect(row?.name).toBe('Main Arena');
    expect(row?.organization_id).toBe(ORG_A);
  });

  // (C2) The EXACT `facility.write` permission (no roles) creates a facility.
  it('(C2) exact facility.write permission creates a facility', async () => {
    const id = randomUUID();
    const res = await postFacility(exactWriteHeaders(TENANT_A), {
      facilityId: id,
      organizationId: ORG_A,
      name: 'Permission Arena',
      facilityType: 'venue',
    });
    expect(res.status).toBe(201);
    expect(await adminGetFacility(admin, TENANT_A, id)).toBeDefined();
  });

  // (C3) A platform_admin creates a facility (wildcard).
  it('(C3) platform_admin creates a facility', async () => {
    const id = randomUUID();
    const res = await postFacility(platformAdminHeaders(TENANT_A), {
      facilityId: id,
      organizationId: ORG_A,
      name: 'Platform Arena',
      facilityType: 'office',
    });
    expect(res.status).toBe(201);
    expect(await adminGetFacility(admin, TENANT_A, id)).toBeDefined();
  });

  // (C4) A facility_reader CANNOT create (403); no row, no outbox written.
  it('(C4) facility_reader cannot create (403)', async () => {
    const id = randomUUID();
    const res = await postFacility(readerHeaders(TENANT_A), {
      facilityId: id,
      organizationId: ORG_A,
      name: 'Denied',
      facilityType: 'venue',
    });
    expect(res.status).toBe(403);
    expect(await adminGetFacility(admin, TENANT_A, id)).toBeUndefined();
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(0);
  });

  // (C5) The exact `facility.read` permission (only) CANNOT create (403).
  it('(C5) exact facility.read-only cannot create (403)', async () => {
    const res = await postFacility(exactReadHeaders(TENANT_A), {
      facilityId: randomUUID(),
      organizationId: ORG_A,
      name: 'Denied',
      facilityType: 'venue',
    });
    expect(res.status).toBe(403);
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(0);
  });

  // (C6) An organization_reader CANNOT create (403).
  it('(C6) organization_reader cannot create (403)', async () => {
    const res = await postFacility(orgReaderHeaders(TENANT_A), {
      facilityId: randomUUID(),
      organizationId: ORG_A,
      name: 'Denied',
      facilityType: 'venue',
    });
    expect(res.status).toBe(403);
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(0);
  });

  // (C7) Missing trusted tenant/auth → 401.
  it('(C7) missing tenant/auth returns 401', async () => {
    const noTenant: Headers = {
      'x-house-actor-user-id': randomUUID(),
      'x-house-actor-role-keys': 'facility_admin',
      'idempotency-key': `idem-${randomUUID()}`,
    };
    const res = await postFacility(noTenant, {
      facilityId: randomUUID(),
      organizationId: ORG_A,
      name: 'NoTenant',
      facilityType: 'venue',
    });
    expect(res.status).toBe(401);
  });

  // (C8) Missing Idempotency-Key → 400.
  it('(C8) missing Idempotency-Key returns 400', async () => {
    const headers = writerHeaders(TENANT_A);
    delete headers['idempotency-key'];
    const res = await postFacility(headers, {
      facilityId: randomUUID(),
      organizationId: ORG_A,
      name: 'NoIdem',
      facilityType: 'venue',
    });
    expect(res.status).toBe(400);
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(0);
  });

  // (C9) Missing required body fields → 400.
  it('(C9) missing required fields returns 400', async () => {
    const missingName = await postFacility(writerHeaders(TENANT_A), {
      facilityId: randomUUID(),
      organizationId: ORG_A,
      facilityType: 'venue',
    });
    expect(missingName.status).toBe(400);

    const missingFacilityId = await postFacility(writerHeaders(TENANT_A), {
      organizationId: ORG_A,
      name: 'X',
      facilityType: 'venue',
    });
    expect(missingFacilityId.status).toBe(400);

    const missingOrg = await postFacility(writerHeaders(TENANT_A), {
      facilityId: randomUUID(),
      name: 'X',
      facilityType: 'venue',
    });
    expect(missingOrg.status).toBe(400);
  });

  // (C10) Invalid facilityType → 400.
  it('(C10) invalid facilityType returns 400', async () => {
    const res = await postFacility(writerHeaders(TENANT_A), {
      facilityId: randomUUID(),
      organizationId: ORG_A,
      name: 'X',
      facilityType: 'stadium',
    });
    expect(res.status).toBe(400);
  });

  // (C11) Invalid status → 400.
  it('(C11) invalid status returns 400', async () => {
    const res = await postFacility(writerHeaders(TENANT_A), {
      facilityId: randomUUID(),
      organizationId: ORG_A,
      name: 'X',
      facilityType: 'venue',
      status: 'bogus',
    });
    expect(res.status).toBe(400);
  });

  // (C12) Unknown/misplaced fields → 400 (closed body allow-list).
  it('(C12) unknown fields return 400', async () => {
    const res = await postFacility(writerHeaders(TENANT_A), {
      facilityId: randomUUID(),
      organizationId: ORG_A,
      name: 'X',
      facilityType: 'venue',
      tenantId: TENANT_B, // body must never carry identity
    });
    expect(res.status).toBe(400);
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(0);
    expect(await adminCountFacilities(admin, TENANT_B)).toBe(0);
  });

  // (C13) An unknown same-tenant organization → 404.
  it('(C13) unknown same-tenant organization returns 404', async () => {
    const res = await postFacility(writerHeaders(TENANT_A), {
      facilityId: randomUUID(),
      organizationId: randomUUID(),
      name: 'X',
      facilityType: 'venue',
    });
    expect(res.status).toBe(404);
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(0);
  });

  // (C14) A cross-tenant organization is invisible (RLS) → 404 (never reveals existence).
  it('(C14) cross-tenant organization returns 404', async () => {
    const res = await postFacility(writerHeaders(TENANT_A), {
      facilityId: randomUUID(),
      organizationId: ORG_B, // belongs to TENANT_B
      name: 'X',
      facilityType: 'venue',
    });
    expect(res.status).toBe(404);
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(0);
  });

  // (C15) A duplicate facilityId for the tenant → 409 (deterministic, not a silent replay).
  it('(C15) duplicate facilityId returns 409', async () => {
    const id = randomUUID();
    const first = await postFacility(writerHeaders(TENANT_A), {
      facilityId: id,
      organizationId: ORG_A,
      name: 'First',
      facilityType: 'venue',
    });
    expect(first.status).toBe(201);

    const dup = await postFacility(writerHeaders(TENANT_A), {
      facilityId: id,
      organizationId: ORG_A,
      name: 'Second',
      facilityType: 'venue',
    });
    expect(dup.status).toBe(409);
    // Still exactly one row; the original name is untouched.
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(1);
    expect((await adminGetFacility(admin, TENANT_A, id))?.name).toBe('First');
  });

  // (C16/C17) The create response is a closed-key FacilityDto that EXCLUDES tenantId and
  // null-normalizes optionals.
  it('(C16/C17) create response is a closed-key DTO excluding tenantId', async () => {
    const id = randomUUID();
    const res = await postFacility(writerHeaders(TENANT_A), {
      facilityId: id,
      organizationId: ORG_A,
      name: 'Shape Arena',
      facilityType: 'venue',
    });
    expect(res.status).toBe(201);
    const facility = res.body['facility'] as Record<string, unknown>;
    for (const key of Object.keys(facility)) {
      expect(ALLOWED_FACILITY_DTO_KEYS.has(key)).toBe(true);
    }
    expect('tenantId' in facility).toBe(false);
    // capabilityTags null-normalizes to [] in the DTO.
    expect(facility['capabilityTags']).toEqual([]);
  });

  // (C18/C19) A create writes EXACTLY one facility row AND exactly one sanitized
  // `facility.registry.created` outbox row (atomic transactional outbox).
  it('(C18/C19) create writes one facility row and one sanitized created outbox row', async () => {
    const id = randomUUID();
    const res = await postFacility(writerHeaders(TENANT_A), piiCreateBody({ facilityId: id }));
    expect(res.status).toBe(201);

    expect(await adminCountFacilities(admin, TENANT_A)).toBe(1);
    const created = await adminGetOutboxByType(admin, 'facility.registry.created', TENANT_A);
    expect(created.length).toBe(1);
    expect(created[0]!.payload['facilityId']).toBe(id);
    expect(created[0]!.payload['tenantId']).toBe(TENANT_A);
    expect(created[0]!.payload['organizationId']).toBe(ORG_A);
  });

  // (C20) The created outbox payload EXCLUDES name/address/contact/coordinates/tags/headers/tokens
  // /connection strings, carrying only the closed set of safe keys.
  it('(C20) created outbox payload excludes all unsafe fields', async () => {
    const res = await postFacility(writerHeaders(TENANT_A), piiCreateBody());
    expect(res.status).toBe(201);
    const created = await adminGetOutboxByType(admin, 'facility.registry.created', TENANT_A);
    expect(created.length).toBe(1);
    const serialized = JSON.stringify(created[0]!.payload);
    for (const sentinel of FORBIDDEN_PAYLOAD_SENTINELS) {
      expect(serialized.includes(sentinel)).toBe(false);
    }
    for (const key of Object.keys(created[0]!.payload)) {
      expect(SAFE_FACILITY_OUTBOX_KEYS.has(key)).toBe(true);
    }
    // The optional visibility DOES pass through (it is a safe reference field).
    expect(created[0]!.payload['visibility']).toBe('internal');
  });

  // (C21/C22) A create does NOT mutate the Organization Registry NOR any governed lifecycle table,
  // and never writes GovernanceKernel lifecycle state.
  it('(C21/C22) create touches neither Organization Registry nor governed lifecycle tables', async () => {
    const orgBefore = await adminGetOrganization(admin, TENANT_A, ORG_A);
    const govBefore = await adminCountGovernance(admin, TENANT_A);

    const res = await postFacility(writerHeaders(TENANT_A), piiCreateBody());
    expect(res.status).toBe(201);

    expect(await adminGetOrganization(admin, TENANT_A, ORG_A)).toEqual(orgBefore);
    expect(await adminCountGovernance(admin, TENANT_A)).toEqual(govBefore);
    expect(govBefore.entityState).toBe(0);
    expect(govBefore.stateTransition).toBe(0);
    expect(govBefore.auditEvent).toBe(0);
  });

  // ==== UPDATE (D) =========================================================================

  /** Seed a facility over the HTTP write path and return its id. */
  async function seedViaHttp(tenantId: string, over: Record<string, unknown> = {}): Promise<string> {
    const id = randomUUID();
    const res = await postFacility(writerHeaders(tenantId), {
      facilityId: id,
      organizationId: tenantId === TENANT_A ? ORG_A : ORG_B,
      name: 'Seed Facility',
      facilityType: 'venue',
      ...over,
    });
    expect(res.status).toBe(201);
    return id;
  }

  // (D1) A facility.write actor updates a same-tenant facility over the real HTTP/Pg path.
  it('(D1) updates a same-tenant facility over the HTTP write path', async () => {
    const id = await seedViaHttp(TENANT_A, { name: 'Before' });
    const res = await patchFacility(writerHeaders(TENANT_A), id, { name: 'After' });
    expect(res.status).toBe(200);
    expect((res.body['facility'] as Record<string, unknown>)['name']).toBe('After');
    expect((await adminGetFacility(admin, TENANT_A, id))?.name).toBe('After');
  });

  // (D2) The EXACT facility.write permission updates.
  it('(D2) exact facility.write permission updates', async () => {
    const id = await seedViaHttp(TENANT_A, { name: 'Before' });
    const res = await patchFacility(exactWriteHeaders(TENANT_A), id, { name: 'ExactAfter' });
    expect(res.status).toBe(200);
    expect((await adminGetFacility(admin, TENANT_A, id))?.name).toBe('ExactAfter');
  });

  // (D3) A platform_admin updates.
  it('(D3) platform_admin updates', async () => {
    const id = await seedViaHttp(TENANT_A, { name: 'Before' });
    const res = await patchFacility(platformAdminHeaders(TENANT_A), id, { name: 'PlatAfter' });
    expect(res.status).toBe(200);
    expect((await adminGetFacility(admin, TENANT_A, id))?.name).toBe('PlatAfter');
  });

  // (D4/D5) A facility_reader and an exact facility.read-only actor are denied update (403).
  it('(D4/D5) read-only actors are denied update (403)', async () => {
    const id = await seedViaHttp(TENANT_A, { name: 'Locked' });

    const reader = await patchFacility(readerHeaders(TENANT_A), id, { name: 'Hacked' });
    expect(reader.status).toBe(403);
    const exactRead = await patchFacility(exactReadHeaders(TENANT_A), id, { name: 'Hacked' });
    expect(exactRead.status).toBe(403);

    expect((await adminGetFacility(admin, TENANT_A, id))?.name).toBe('Locked');
  });

  // (D6) Missing trusted tenant/auth → 401.
  it('(D6) missing tenant/auth returns 401', async () => {
    const id = await seedViaHttp(TENANT_A);
    const noTenant: Headers = {
      'x-house-actor-user-id': randomUUID(),
      'x-house-actor-role-keys': 'facility_admin',
      'idempotency-key': `idem-${randomUUID()}`,
    };
    const res = await patchFacility(noTenant, id, { name: 'X' });
    expect(res.status).toBe(401);
  });

  // (D7) An empty body → 400 (at least one updatable field required).
  it('(D7) empty body returns 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await patchFacility(writerHeaders(TENANT_A), id, {});
    expect(res.status).toBe(400);
  });

  // (D8) Malformed JSON → 400.
  it('(D8) malformed JSON returns 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await patchFacilityRaw(writerHeaders(TENANT_A), id, '{ not valid json');
    expect(res.status).toBe(400);
  });

  // (D9) status / facilityType / organizationId / facilityId in a PATCH body → 400 (unknown keys).
  it('(D9) immutable/identity keys in PATCH body return 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    for (const bad of [
      { status: 'active' },
      { facilityType: 'office' },
      { organizationId: ORG_A },
      { facilityId: id },
    ]) {
      const res = await patchFacility(writerHeaders(TENANT_A), id, bad);
      expect(res.status).toBe(400);
    }
  });

  // (D10) Unknown/misplaced fields → 400.
  it('(D10) unknown fields return 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await patchFacility(writerHeaders(TENANT_A), id, { tenantId: TENANT_B });
    expect(res.status).toBe(400);
  });

  // (D11) A missing facility → 404.
  it('(D11) missing facility returns 404', async () => {
    const res = await patchFacility(writerHeaders(TENANT_A), randomUUID(), { name: 'X' });
    expect(res.status).toBe(404);
  });

  // (D12) A cross-tenant facility is invisible (RLS) → 404, INDISTINGUISHABLE from not-found.
  it('(D12) cross-tenant and not-found updates are indistinguishable 404', async () => {
    const inB = await seedViaHttp(TENANT_B, { name: 'B Facility' });
    const neverExisted = randomUUID();

    const crossTenant = await patchFacility(writerHeaders(TENANT_A), inB, { name: 'Probe' });
    const notFound = await patchFacility(writerHeaders(TENANT_A), neverExisted, { name: 'Probe' });

    expect(crossTenant.status).toBe(404);
    expect(notFound.status).toBe(404);
    expect(crossTenant.body['code']).toBe(notFound.body['code']);
    // Tenant B's row is untouched.
    expect((await adminGetFacility(admin, TENANT_B, inB))?.name).toBe('B Facility');
  });

  // (D13) Explicit null clears an optional field.
  it('(D13) explicit null clears an optional field', async () => {
    const id = await seedViaHttp(TENANT_A, { addressLine1: '1 Old Road' });
    expect((await adminGetFacility(admin, TENANT_A, id))?.address_line1).toBe('1 Old Road');

    const res = await patchFacility(writerHeaders(TENANT_A), id, { addressLine1: null });
    expect(res.status).toBe(200);
    expect((await adminGetFacility(admin, TENANT_A, id))?.address_line1).toBeNull();
  });

  // (D14) The update response is a closed-key FacilityDto that EXCLUDES tenantId.
  it('(D14) update response is a closed-key DTO excluding tenantId', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await patchFacility(writerHeaders(TENANT_A), id, { name: 'Shaped' });
    const facility = res.body['facility'] as Record<string, unknown>;
    for (const key of Object.keys(facility)) {
      expect(ALLOWED_FACILITY_DTO_KEYS.has(key)).toBe(true);
    }
    expect('tenantId' in facility).toBe(false);
  });

  // (D15) A successful update writes a sanitized `facility.registry.updated` outbox row (and the
  // adapter never enqueues outbox itself — the row is emitted by the service's Pg transaction).
  it('(D15) update writes a sanitized updated outbox row', async () => {
    const id = await seedViaHttp(TENANT_A);
    // Clear pre-existing outbox from the seed create so we isolate the update signal.
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [TENANT_A]);

    const res = await patchFacility(writerHeaders(TENANT_A), id, {
      name: SECRET_NAME,
      contactEmail: SECRET_EMAIL,
      addressLine1: SECRET_ADDRESS,
    });
    expect(res.status).toBe(200);

    const updated = await adminGetOutboxByType(admin, 'facility.registry.updated', TENANT_A);
    expect(updated.length).toBe(1);
    expect(updated[0]!.payload['facilityId']).toBe(id);
    const serialized = JSON.stringify(updated[0]!.payload);
    for (const sentinel of FORBIDDEN_PAYLOAD_SENTINELS) {
      expect(serialized.includes(sentinel)).toBe(false);
    }
    for (const key of Object.keys(updated[0]!.payload)) {
      expect(SAFE_FACILITY_OUTBOX_KEYS.has(key)).toBe(true);
    }
  });

  // (D16) An update does NOT mutate the Organization Registry NOR any governed lifecycle table.
  it('(D16) update touches neither Organization Registry nor governed lifecycle tables', async () => {
    const id = await seedViaHttp(TENANT_A);
    const orgBefore = await adminGetOrganization(admin, TENANT_A, ORG_A);
    const govBefore = await adminCountGovernance(admin, TENANT_A);

    const res = await patchFacility(writerHeaders(TENANT_A), id, { name: 'Updated' });
    expect(res.status).toBe(200);

    expect(await adminGetOrganization(admin, TENANT_A, ORG_A)).toEqual(orgBefore);
    expect(await adminCountGovernance(admin, TENANT_A)).toEqual(govBefore);
    expect(govBefore.entityState).toBe(0);
  });

  // ==== ROUTING / ABSENCE (E) ==============================================================

  // (E1/E2) The status-transition sub-resource IS implemented and gated by `facility.status.write`.
  // Full PostgreSQL/RLS status validation is deferred to a dedicated pass; here we only assert the
  // route is served (an authorized writer gets 200) and the action exists in the catalog.
  it('(E1/E2) status-transition route is served and facility.status.write exists', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities/${id}/status-transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...writerHeaders(TENANT_A) },
      body: JSON.stringify({ targetStatus: 'active' }),
    });
    expect(res.status).toBe(200);
    expect(Object.values(AuthorizationAction as Record<string, string>)).toContain(
      'facility.status.write',
    );
  });

  // (E3) An unsupported method on the collection → 405 with Allow: GET, POST.
  it('(E3) unsupported method on /v1/facilities returns 405 Allow: GET, POST', async () => {
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      method: 'DELETE',
      headers: writerHeaders(TENANT_A),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });

  // (E4) An unsupported method on the item → 405 with Allow: GET, PATCH.
  it('(E4) unsupported method on /v1/facilities/:id returns 405 Allow: GET, PATCH', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities/${id}`, {
      method: 'DELETE',
      headers: writerHeaders(TENANT_A),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, PATCH');
  });

  // (E5) A deeper unknown facility path → 404.
  it('(E5) deeper unknown facility path returns 404', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await getJson(`/v1/facilities/${id}/extra`, writerHeaders(TENANT_A));
    expect(res.status).toBe(404);
  });

  // (E6/E7/E8) GET list, detail, and org-facilities still work after a create + update.
  it('(E6/E7/E8) GET routes still work after create/update', async () => {
    const id = await seedViaHttp(TENANT_A, { name: 'Listed' });
    await patchFacility(writerHeaders(TENANT_A), id, { name: 'Relisted' });

    const list = await getJson('/v1/facilities', readerHeaders(TENANT_A));
    expect(list.status).toBe(200);
    expect(
      (list.body['items'] as Array<{ facilityId: string }>).map((i) => i.facilityId),
    ).toContain(id);

    const detail = await getJson(`/v1/facilities/${id}`, readerHeaders(TENANT_A));
    expect(detail.status).toBe(200);
    expect((detail.body['facility'] as Record<string, unknown>)['name']).toBe('Relisted');

    const orgList = await getJson(`/v1/organizations/${ORG_A}/facilities`, readerHeaders(TENANT_A));
    expect(orgList.status).toBe(200);
    expect(
      (orgList.body['items'] as Array<{ facilityId: string }>).map((i) => i.facilityId),
    ).toContain(id);
  });

  // (E9) The org-facilities route does not shadow the org-participants route.
  it('(E9) org-facilities does not shadow org-participants', async () => {
    const res = await getJson(`/v1/organizations/${ORG_A}/participants`, {
      'x-house-tenant-id': TENANT_A,
      'x-house-actor-user-id': randomUUID(),
      'x-house-actor-role-keys': 'participant_reader',
    });
    expect(res.status).toBe(200);
    expect(res.body['items']).toEqual([]);
  });

  // ==== RLS / privacy (F5/F6, G) ===========================================================

  // (F5) The runtime role cannot read another tenant's facility through the HTTP detail route.
  it('(F5) runtime role cannot see cross-tenant facilities', async () => {
    const inB = await seedViaHttp(TENANT_B, { name: 'B Only' });
    const res = await getJson(`/v1/facilities/${inB}`, readerHeaders(TENANT_A));
    expect(res.status).toBe(404);
  });

  // (F6) Missing tenant context fails closed at the trusted edge (401 before any DB access).
  it('(F6) missing tenant context fails closed (401)', async () => {
    const res = await postFacility(
      { 'x-house-actor-user-id': randomUUID(), 'x-house-actor-role-keys': 'facility_admin' },
      { facilityId: randomUUID(), organizationId: ORG_A, name: 'X', facilityType: 'venue' },
    );
    expect(res.status).toBe(401);
  });

  // (G) Error responses never leak PII, the request body, headers, tokens, connection strings, SQL
  // details, or stack traces — only { status, code, message, requestId }.
  it('(G) error responses carry no PII, secrets, or SQL/stack details', async () => {
    const res = await postFacility(writerHeaders(TENANT_A), piiCreateBody({ organizationId: randomUUID() }));
    expect(res.status).toBe(404);
    const serialized = JSON.stringify(res.body);
    for (const sentinel of FORBIDDEN_PAYLOAD_SENTINELS) {
      expect(serialized.includes(sentinel)).toBe(false);
    }
    expect(serialized).not.toContain('facility_registry.facility');
    expect(serialized).not.toContain('SELECT');
    expect(serialized).not.toContain('at Object.');
    expect(new Set(Object.keys(res.body))).toEqual(
      new Set(['status', 'code', 'message', 'requestId']),
    );
  });

  // ==== STATUS TRANSITION (S) ==============================================================
  // POST /v1/facilities/:facilityId/status-transitions — a reference-data status change ONLY. These
  // prove, over REAL PostgreSQL/RLS with the restricted runtime role, that the DISTINCT
  // `facility.status.write` action gates the route (NOT implied by `facility.write`), the change is
  // same-tenant and RLS-confined, the closed FacilityDto never leaks `tenantId` or `reason`, a real
  // change emits EXACTLY one sanitized `facility.registry.status_changed` outbox row (never a name,
  // address, contact field, coordinate, capability tag, `reason`, header, token, or connection
  // string), a same-status POST is a 200 no-op emitting no new signal, and the path mutates NEITHER
  // the Organization Registry NOR any governed lifecycle table (facility status is reference data,
  // not a governed lifecycle FSM). The runtime role/grant + FORCE-RLS invariants proven in (F1) and
  // (F2/F3/F4) above apply unchanged (the status change reuses the SELECT/UPDATE grants, no DELETE).

  /**
   * The CLOSED set of safe keys a status-changed outbox payload may carry: stable identifiers, the
   * facility type, the previous/new status, optional visibility, and correlation lineage only.
   * NEVER name, address, contact fields, coordinates, capability tags, `reason`, headers, or tokens.
   */
  const SAFE_STATUS_OUTBOX_KEYS = new Set([
    'facilityId',
    'tenantId',
    'organizationId',
    'facilityType',
    'previousStatus',
    'newStatus',
    'visibility',
    'actorUserId',
    'requestId',
    'correlationId',
  ]);

  // A sentinel free-text reason that is accepted at the HTTP boundary but MUST NOT be persisted nor
  // appear in the outbox payload or the response.
  const SECRET_REASON = 'do-not-persist-secret-reason';

  /** An actor holding the EXACT `facility.status.write` permission ONLY (no roles). */
  function statusWriteHeaders(tenantId: string, over: Headers = {}): Headers {
    return {
      'x-house-tenant-id': tenantId,
      'x-house-actor-user-id': randomUUID(),
      'x-house-actor-permission-keys': 'facility.status.write',
      'idempotency-key': `idem-${randomUUID()}`,
      ...over,
    };
  }

  async function postStatus(
    headers: Headers,
    facilityId: string,
    body: unknown,
  ): Promise<HttpResult> {
    const res = await fetch(`${baseUrl}/v1/facilities/${facilityId}/status-transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return readResult(res);
  }

  async function postStatusRaw(
    headers: Headers,
    facilityId: string,
    raw: string,
  ): Promise<HttpResult> {
    const res = await fetch(`${baseUrl}/v1/facilities/${facilityId}/status-transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: raw,
    });
    return readResult(res);
  }

  /** Seed a full-PII facility (status draft) over the HTTP write path and return its id. */
  async function seedPiiViaHttp(tenantId: string): Promise<string> {
    const id = randomUUID();
    const res = await postFacility(writerHeaders(tenantId), piiCreateBody({ facilityId: id }));
    expect(res.status).toBe(201);
    return id;
  }

  // (S1/S3) A facility_admin changes a same-tenant facility's status over the real HTTP/Pg path.
  it('(S1/S3) facility_admin transitions status over the HTTP write path', async () => {
    const id = await seedViaHttp(TENANT_A);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
    const res = await postStatus(writerHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(200);
    expect((res.body['facility'] as Record<string, unknown>)['status']).toBe('active');
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('active');
  });

  // (S2) The EXACT `facility.status.write` permission (no roles) transitions status.
  it('(S2) exact facility.status.write permission transitions status', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(statusWriteHeaders(TENANT_A), id, { targetStatus: 'inactive' });
    expect(res.status).toBe(200);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('inactive');
  });

  // (S4) A platform_admin transitions status (wildcard).
  it('(S4) platform_admin transitions status', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(platformAdminHeaders(TENANT_A), id, { targetStatus: 'archived' });
    expect(res.status).toBe(200);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('archived');
  });

  // (S5) The EXACT `facility.write` permission WITHOUT status.write CANNOT transition (403); the
  // status is a distinct action, so a write-only actor is denied and the row is untouched.
  it('(S5) exact facility.write cannot transition status (403)', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(exactWriteHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(403);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S6) A facility_reader CANNOT transition (403).
  it('(S6) facility_reader cannot transition status (403)', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(readerHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(403);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S7) The exact `facility.read` permission (only) CANNOT transition (403).
  it('(S7) exact facility.read-only cannot transition status (403)', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(exactReadHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(403);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S8) An organization_reader CANNOT transition (403).
  it('(S8) organization_reader cannot transition status (403)', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(orgReaderHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(403);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S9) Missing trusted tenant/auth → 401 (fails closed before any DB access); row untouched.
  it('(S9) missing tenant/auth returns 401', async () => {
    const id = await seedViaHttp(TENANT_A);
    const noTenant: Headers = {
      'x-house-actor-user-id': randomUUID(),
      'x-house-actor-role-keys': 'facility_admin',
      'idempotency-key': `idem-${randomUUID()}`,
    };
    const res = await postStatus(noTenant, id, { targetStatus: 'active' });
    expect(res.status).toBe(401);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S10) Missing Idempotency-Key → 400; row untouched.
  it('(S10) missing Idempotency-Key returns 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const headers = writerHeaders(TENANT_A);
    delete headers['idempotency-key'];
    const res = await postStatus(headers, id, { targetStatus: 'active' });
    expect(res.status).toBe(400);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S11) Malformed JSON → 400.
  it('(S11) malformed JSON returns 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatusRaw(writerHeaders(TENANT_A), id, '{ not valid json');
    expect(res.status).toBe(400);
  });

  // (S12) A non-object JSON body (array) → 400.
  it('(S12) non-object body returns 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(writerHeaders(TENANT_A), id, []);
    expect(res.status).toBe(400);
  });

  // (S13) Missing `targetStatus` → 400.
  it('(S13) missing targetStatus returns 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(writerHeaders(TENANT_A), id, { reason: 'no target' });
    expect(res.status).toBe(400);
  });

  // (S14) Invalid `targetStatus` → 400; row untouched.
  it('(S14) invalid targetStatus returns 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(writerHeaders(TENANT_A), id, { targetStatus: 'bogus' });
    expect(res.status).toBe(400);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S15) Unknown/misplaced fields → 400 (closed body allow-list is targetStatus + optional reason).
  it('(S15) unknown fields return 400', async () => {
    const id = await seedViaHttp(TENANT_A);
    const bogus = await postStatus(writerHeaders(TENANT_A), id, {
      targetStatus: 'active',
      bogus: 1,
    });
    expect(bogus.status).toBe(400);
    const identity = await postStatus(writerHeaders(TENANT_A), id, {
      targetStatus: 'active',
      tenantId: TENANT_B,
    });
    expect(identity.status).toBe(400);
  });

  // (S16) create/update/profile body fields are rejected (only targetStatus + reason are allowed).
  it('(S16) create/update/profile fields are rejected (400)', async () => {
    const id = await seedViaHttp(TENANT_A);
    for (const bad of [
      { targetStatus: 'active', name: 'X' },
      { targetStatus: 'active', organizationId: ORG_A },
      { targetStatus: 'active', facilityType: 'office' },
      { targetStatus: 'active', contactEmail: SECRET_EMAIL },
      { targetStatus: 'active', capabilityTags: [SECRET_TAG] },
    ]) {
      const res = await postStatus(writerHeaders(TENANT_A), id, bad);
      expect(res.status).toBe(400);
    }
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S17) A missing facility → 404.
  it('(S17) missing facility returns 404', async () => {
    const res = await postStatus(writerHeaders(TENANT_A), randomUUID(), { targetStatus: 'active' });
    expect(res.status).toBe(404);
  });

  // (S18) A cross-tenant facility is invisible (RLS) → 404, INDISTINGUISHABLE from not-found.
  it('(S18) cross-tenant and not-found are indistinguishable 404', async () => {
    const inB = await seedViaHttp(TENANT_B);
    const crossTenant = await postStatus(writerHeaders(TENANT_A), inB, { targetStatus: 'active' });
    const notFound = await postStatus(writerHeaders(TENANT_A), randomUUID(), {
      targetStatus: 'active',
    });
    expect(crossTenant.status).toBe(404);
    expect(notFound.status).toBe(404);
    expect(crossTenant.body['code']).toBe(notFound.body['code']);
    // Tenant B's row is untouched.
    expect((await adminGetFacility(admin, TENANT_B, inB))?.status).toBe('draft');
  });

  // (S19) The status response is a closed-key FacilityDto that EXCLUDES tenantId AND reason.
  it('(S19) status response is a closed-key DTO excluding tenantId and reason', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await postStatus(writerHeaders(TENANT_A), id, {
      targetStatus: 'active',
      reason: SECRET_REASON,
    });
    expect(res.status).toBe(200);
    const facility = res.body['facility'] as Record<string, unknown>;
    for (const key of Object.keys(facility)) {
      expect(ALLOWED_FACILITY_DTO_KEYS.has(key)).toBe(true);
    }
    expect('tenantId' in facility).toBe(false);
    expect('reason' in facility).toBe(false);
    expect(JSON.stringify(res.body).includes(SECRET_REASON)).toBe(false);
  });

  // (S20/S21) A real status change writes EXACTLY one sanitized `facility.registry.status_changed`
  // outbox row carrying only the closed set of safe keys — never name/address/contact/coordinates/
  // capability tags/reason/headers/tokens/connection strings.
  it('(S20/S21) status change writes exactly one sanitized status_changed outbox row', async () => {
    const id = await seedPiiViaHttp(TENANT_A);
    // Isolate the status signal from the seed create's `facility.registry.created` row.
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [TENANT_A]);

    const res = await postStatus(writerHeaders(TENANT_A), id, {
      targetStatus: 'active',
      reason: SECRET_REASON,
    });
    expect(res.status).toBe(200);

    const changed = await adminGetOutboxByType(admin, 'facility.registry.status_changed', TENANT_A);
    expect(changed.length).toBe(1);
    expect(changed[0]!.payload['facilityId']).toBe(id);
    expect(changed[0]!.payload['previousStatus']).toBe('draft');
    expect(changed[0]!.payload['newStatus']).toBe('active');
    const serialized = JSON.stringify(changed[0]!.payload);
    for (const sentinel of [...FORBIDDEN_PAYLOAD_SENTINELS, SECRET_REASON]) {
      expect(serialized.includes(sentinel)).toBe(false);
    }
    for (const key of Object.keys(changed[0]!.payload)) {
      expect(SAFE_STATUS_OUTBOX_KEYS.has(key)).toBe(true);
    }
    // Only ONE status_changed row total (no duplicate signal).
    expect(await adminCountFacilities(admin, TENANT_A)).toBe(1);
  });

  // (S22) A same-status POST is a 200 no-op that writes NO new status_changed outbox row.
  it('(S22) same-status transition is a 200 no-op with no new outbox row', async () => {
    const id = await seedViaHttp(TENANT_A); // seeded at status 'draft'
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [TENANT_A]);

    const res = await postStatus(writerHeaders(TENANT_A), id, { targetStatus: 'draft' });
    expect(res.status).toBe(200);
    expect((res.body['facility'] as Record<string, unknown>)['status']).toBe('draft');

    const changed = await adminGetOutboxByType(admin, 'facility.registry.status_changed', TENANT_A);
    expect(changed.length).toBe(0);
    expect((await adminGetFacility(admin, TENANT_A, id))?.status).toBe('draft');
  });

  // (S23/S24/S25) A status change mutates NEITHER the Organization Registry NOR any governed
  // lifecycle table, and never writes GovernanceKernel lifecycle state.
  it('(S23/S24/S25) status change touches neither Organization Registry nor governed lifecycle tables', async () => {
    const id = await seedViaHttp(TENANT_A);
    const orgBefore = await adminGetOrganization(admin, TENANT_A, ORG_A);
    const govBefore = await adminCountGovernance(admin, TENANT_A);

    const res = await postStatus(writerHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(200);

    expect(await adminGetOrganization(admin, TENANT_A, ORG_A)).toEqual(orgBefore);
    expect(await adminCountGovernance(admin, TENANT_A)).toEqual(govBefore);
    expect(govBefore.entityState).toBe(0);
    expect(govBefore.stateTransition).toBe(0);
    expect(govBefore.auditEvent).toBe(0);
  });

  // (S32) An unsupported method on the status-transition route → 405 with Allow: POST.
  it('(S32) unsupported method on the status route returns 405 Allow: POST', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities/${id}/status-transitions`, {
      method: 'GET',
      headers: writerHeaders(TENANT_A),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  // (S33) A deeper unknown status path → 404 (the status route does not swallow sub-paths).
  it('(S33) deeper unknown status path returns 404', async () => {
    const id = await seedViaHttp(TENANT_A);
    const res = await fetch(`${baseUrl}/v1/facilities/${id}/status-transitions/extra`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...writerHeaders(TENANT_A) },
      body: JSON.stringify({ targetStatus: 'active' }),
    });
    expect(res.status).toBe(404);
  });
});
