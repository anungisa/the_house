import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgParticipantRegistryStore } from '../../../src/domains/participant-registry/PgParticipantRegistryStore.js';
import { ParticipantRegistryService } from '../../../src/domains/participant-registry/ParticipantRegistryService.js';
import {
  handleParticipantCreate,
  handleParticipantUpdate,
  handleParticipantStatusTransition,
  type ParticipantWriteHttpDeps,
} from '../../../src/http/participant/ParticipantWriteHttpAdapter.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';

/**
 * Gated PostgreSQL integration tests for the PARTICIPANT REGISTRY HTTP *WRITE* surface — create,
 * update, and the reference-data status transition — over the real
 * {@link PgParticipantRegistryStore} and the real HTTP write adapter
 * (`POST /v1/participants`, `PATCH /v1/participants/:participantId`,
 * `POST /v1/participants/:participantId/status-transitions`).
 *
 * These prove, against REAL PostgreSQL with RLS FORCED and a least-privilege NON-superuser,
 * NON-BYPASSRLS runtime role, that the HTTP write path:
 *   * creates, updates, and transitions the status of only the AUTHENTICATED tenant's participant
 *     (tenant from the trusted `x-house-*` headers, never the body);
 *   * enforces the centralized `participant.write` / `participant.status.write` actions (read-only
 *     actors get 403);
 *   * is idempotency-gated on create (missing key → 400; duplicate id → 409);
 *   * normalizes email in the persisted row AND the authorized read-back;
 *   * writes the participant row and its transactional outbox row together (atomic), with a
 *     SANITIZED outbox payload that never carries email, names, raw headers, bearer tokens,
 *     connection strings, or raw bytes;
 *   * treats a status transition as a service-validated reference-data change: a real change emits a
 *     single sanitized `participant.registry.status_changed` outbox row, while re-applying the
 *     current status is an idempotent no-op that emits NO row;
 *   * NEVER mutates governance.entity_state / governance.state_transition / governance.audit_event
 *     (participant registry is reference data — it never calls the Governance Kernel);
 *   * keeps tenants isolated: a cross-tenant update/transition returns 404 (never revealing
 *     existence) and a duplicate-id pre-check is tenant-scoped (so it cannot leak another tenant's
 *     row).
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise the suite is skipped so the
 * default `npm test` stays hermetic. NO real Azure, Entra/JWKS, antivirus, Service Bus, Key Vault,
 * Docker, registry, Cosign, transparency log, or external network is contacted.
 *
 * SELF-PROVISIONING: using the admin connection, the suite applies migrations and creates one
 * least-privilege WRITE role (idempotent, re-runnable):
 *   * house_app_participant_http_write_test — LOGIN, NOSUPERUSER, NOBYPASSRLS; SELECT/INSERT/UPDATE
 *     on participant_registry.participant and governance.outbox_message; EXECUTE
 *     current_tenant_id(). No DELETE, no governance lifecycle-table grants.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Suite-specific tenant UUIDs (distinct from other integration suites to avoid interference).
const TENANT_A = '40000000-0000-4000-8000-0000000000a7';
const TENANT_B = '40000000-0000-4000-8000-0000000000b8';

const APP_ROLE = 'house_app_participant_http_write_test';
const APP_PW = 'participant_http_write_pw';
const TRUSTED = new TrustedHeadersAuthContextResolver();

// Shared provisioning advisory-lock key (every gated suite that provisions a role MUST use it).
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
  // Least privilege for the phase-1 WRITE surface: SELECT/INSERT/UPDATE on the participant table
  // (the create duplicate pre-check needs SELECT; create/update need INSERT/UPDATE) plus the
  // transactional outbox. NO DELETE anywhere, and NO grants on governance lifecycle tables
  // (entity_state / state_transition / audit_event) — the registry never touches them.
  await admin.query(`REVOKE ALL ON participant_registry.participant FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON governance.outbox_message FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA participant_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON participant_registry.participant TO ${APP_ROLE}`,
  );
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON governance.outbox_message TO ${APP_ROLE}`,
  );
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

/** Trusted-header identity for a participant.write-capable actor. */
function writerHeaders(
  tenantId: string,
  over: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'participant_admin',
    'idempotency-key': `idem-${randomUUID()}`,
    ...over,
  };
}

/** Trusted-header identity for a read-only actor (participant.read but NOT participant.write). */
function readerHeaders(
  tenantId: string,
  over: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': randomUUID(),
    'x-house-actor-role-keys': 'participant_reader',
    'idempotency-key': `idem-${randomUUID()}`,
    ...over,
  };
}

interface CreateBody {
  participantId?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  email?: string;
  status?: string;
  externalRefs?: unknown;
  [key: string]: unknown;
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

/**
 * The CLOSED set of safe outbox-payload keys: stable identifiers plus correlation lineage only.
 * NEVER displayName, givenName, familyName, email, externalRefs, headers, tokens, or bytes.
 */
const SAFE_PAYLOAD_KEYS = new Set([
  'participantId',
  'tenantId',
  'status',
  'requestId',
  'correlationId',
  'actorUserId',
]);

/**
 * The CLOSED set of safe keys for a status_changed outbox payload: stable identifiers, the
 * before/after status, and correlation lineage only. NEVER names, email, headers, tokens, or bytes.
 */
const SAFE_STATUS_PAYLOAD_KEYS = new Set([
  'participantId',
  'tenantId',
  'previousStatus',
  'newStatus',
  'requestId',
  'correlationId',
  'actorUserId',
]);

/** Sentinels that MUST NOT appear anywhere in an outbox payload (privacy / no-secret-leak). */
const FORBIDDEN_PAYLOAD_SENTINELS = [
  'Pat', // given name
  'Writer', // family name
  '@example.test', // email fragment
  'Bearer ', // bearer token prefix
  'x-house-', // raw header name
  'postgres://', // connection string
  'postgresql://', // connection string
  'password', // connection-string secret hint
];

async function adminCountParticipants(admin: pg.Pool, tenantId: string): Promise<number> {
  const { rows } = await admin.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM participant_registry.participant WHERE tenant_id = $1`,
    [tenantId],
  );
  return Number(rows[0]!.n);
}

async function adminGetParticipant(
  admin: pg.Pool,
  tenantId: string,
  participantId: string,
): Promise<{ email: string | null; display_name: string; status: string } | undefined> {
  const { rows } = await admin.query<{ email: string | null; display_name: string; status: string }>(
    `SELECT email, display_name, status FROM participant_registry.participant
       WHERE tenant_id = $1 AND id = $2`,
    [tenantId, participantId],
  );
  return rows[0];
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

async function adminCountGovernance(admin: pg.Pool, tenantId: string): Promise<{
  entityState: number;
  stateTransition: number;
  auditEvent: number;
}> {
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

d('participant registry HTTP write surface (integration)', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let deps: ParticipantWriteHttpDeps;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    const store = new PgParticipantRegistryStore(appPool);
    const service = new ParticipantRegistryService(store);
    deps = { service, readStore: store };
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    await admin.query(
      `DELETE FROM participant_registry.participant WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  });

  function create(
    headers: Record<string, string | undefined>,
    body: CreateBody,
  ): ReturnType<typeof handleParticipantCreate> {
    return handleParticipantCreate(deps, { headers, body }, randomUUID(), TRUSTED);
  }

  function update(
    headers: Record<string, string | undefined>,
    participantId: string,
    body: Record<string, unknown>,
  ): ReturnType<typeof handleParticipantUpdate> {
    return handleParticipantUpdate(deps, { headers, participantId, body }, randomUUID(), TRUSTED);
  }

  function statusTransition(
    headers: Record<string, string | undefined>,
    participantId: string,
    body: Record<string, unknown>,
  ): ReturnType<typeof handleParticipantStatusTransition> {
    return handleParticipantStatusTransition(
      deps,
      { headers, participantId, body },
      randomUUID(),
      TRUSTED,
    );
  }

  // --- Role / RLS posture invariants -------------------------------------------------------

  // (C23) The participant table has RLS enabled AND forced.
  it('(C23) participant table has RLS enabled AND forced', async () => {
    const { rows } = await admin.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'participant_registry' AND c.relname = 'participant'`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  // (C24) The write role is non-superuser, non-BYPASSRLS, with SELECT/INSERT/UPDATE only (no DELETE).
  it('(C24) write role is NOSUPERUSER, NOBYPASSRLS, no DELETE grant', async () => {
    const { rows: role } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(role[0]!.rolsuper).toBe(false);
    expect(role[0]!.rolbypassrls).toBe(false);

    const { rows: grants } = await admin.query<{ privilege_type: string }>(
      `SELECT privilege_type FROM information_schema.role_table_grants
        WHERE grantee = $1 AND table_schema = 'participant_registry' AND table_name = 'participant'`,
      [APP_ROLE],
    );
    const privileges = new Set(grants.map((r) => r.privilege_type));
    expect(privileges).toEqual(new Set(['SELECT', 'INSERT', 'UPDATE']));
    expect(privileges.has('DELETE')).toBe(false);
  });

  // --- CREATE ------------------------------------------------------------------------------

  // (C1) The restricted write role creates an own-tenant participant via the HTTP write path.
  it('(C1) creates an own-tenant participant over the HTTP write path', async () => {
    const id = randomUUID();
    const res = await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Head Coach' });
    expect(res.status).toBe(201);
    const participant = res.body['participant'] as Record<string, unknown>;
    expect(participant['participantId']).toBe(id);
    expect(participant['tenantId']).toBe(TENANT_A);

    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.display_name).toBe('Head Coach');
  });

  // (C2 + C3) Create requires participant.write: a read-only actor is denied with 403.
  it('(C2/C3) create denies a read-only actor with 403', async () => {
    const id = randomUUID();
    const res = await create(readerHeaders(TENANT_A), { participantId: id, displayName: 'Denied' });
    expect(res.status).toBe(403);
    expect(await adminCountParticipants(admin, TENANT_A)).toBe(0);
  });

  // (C4) Create fails closed (401) when no tenant identity is present.
  it('(C4) create fails closed with 401 when tenant identity is absent', async () => {
    const res = await create(
      {
        'x-house-actor-user-id': randomUUID(),
        'x-house-actor-role-keys': 'participant_admin',
        'idempotency-key': `idem-${randomUUID()}`,
      },
      { participantId: randomUUID(), displayName: 'No Tenant' },
    );
    expect(res.status).toBe(401);
  });

  // (C5) Create rejects a missing displayName with 400 (and writes nothing).
  it('(C5) create rejects a missing displayName with 400', async () => {
    const res = await create(writerHeaders(TENANT_A), { participantId: randomUUID() });
    expect(res.status).toBe(400);
    expect(await adminCountParticipants(admin, TENANT_A)).toBe(0);
  });

  // (C6) Create rejects a missing Idempotency-Key with 400 (and writes nothing).
  it('(C6) create rejects a missing Idempotency-Key with 400', async () => {
    const headers = writerHeaders(TENANT_A);
    delete headers['idempotency-key'];
    const res = await create(headers, { participantId: randomUUID(), displayName: 'No Key' });
    expect(res.status).toBe(400);
    expect(await adminCountParticipants(admin, TENANT_A)).toBe(0);
  });

  // (C7) Create rejects a duplicate participantId with 409 (and does not write a second row/outbox).
  it('(C7) create rejects a duplicate participantId with 409', async () => {
    const id = randomUUID();
    expect((await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'First' })).status).toBe(201);

    const dup = await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Second' });
    expect(dup.status).toBe(409);

    expect(await adminCountParticipants(admin, TENANT_A)).toBe(1);
    const created = await adminGetOutboxByType(admin, 'participant.registry.created', TENANT_A);
    expect(created.length).toBe(1);
  });

  // (C8) Create normalizes email in the persisted row AND the authorized response.
  it('(C8) create normalizes email in the persisted row and the response', async () => {
    const id = randomUUID();
    const res = await create(writerHeaders(TENANT_A), {
      participantId: id,
      displayName: 'Pat Writer',
      email: '  Pat.Writer@Example.TEST ',
    });
    expect(res.status).toBe(201);
    const participant = res.body['participant'] as Record<string, unknown>;
    expect(participant['email']).toBe('pat.writer@example.test');

    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.email).toBe('pat.writer@example.test');
  });

  // (C9) Create writes the participant row AND its transactional outbox row together (atomic).
  it('(C9) create writes the participant row and outbox row atomically', async () => {
    const id = randomUUID();
    const res = await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Atomic' });
    expect(res.status).toBe(201);

    expect(await adminCountParticipants(admin, TENANT_A)).toBe(1);
    const created = await adminGetOutboxByType(admin, 'participant.registry.created', TENANT_A);
    expect(created.length).toBe(1);
    expect(created[0]!.payload['participantId']).toBe(id);
    expect(created[0]!.payload['tenantId']).toBe(TENANT_A);
  });

  // (C10) The create outbox payload excludes email, names, raw headers, tokens, connection strings.
  it('(C10) create outbox payload excludes unsafe fields', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), {
      participantId: id,
      displayName: 'Pat Writer',
      givenName: 'Pat',
      familyName: 'Writer',
      email: 'pat.writer@example.test',
    });
    const created = await adminGetOutboxByType(admin, 'participant.registry.created', TENANT_A);
    expect(created.length).toBe(1);
    const serialized = JSON.stringify(created[0]!.payload);
    for (const sentinel of FORBIDDEN_PAYLOAD_SENTINELS) {
      expect(serialized.includes(sentinel)).toBe(false);
    }
    // The payload carries ONLY safe lineage/reference fields — never names, email, or bytes.
    for (const key of Object.keys(created[0]!.payload)) {
      expect(SAFE_PAYLOAD_KEYS.has(key)).toBe(true);
    }
  });

  // (C28) Cross-tenant existence is never revealed through a status/code difference: an update of
  // a Tenant B participant from Tenant A is INDISTINGUISHABLE from an update of an id that exists
  // nowhere — both return an identical 404 / PARTICIPANT_NOT_FOUND. (Participant ids are globally
  // unique UUIDs, so a tenant cannot even probe another tenant's id space via create — a forced
  // cross-tenant id collision surfaces as an opaque 500, never a semantic 409 "already exists".)
  it('(C28) cross-tenant and not-found updates are indistinguishable (no existence leak)', async () => {
    const existingInB = randomUUID();
    await create(writerHeaders(TENANT_B), { participantId: existingInB, displayName: 'B Member' });
    const neverExisted = randomUUID();

    const crossTenant = await update(writerHeaders(TENANT_A), existingInB, { displayName: 'Probe' });
    const notFound = await update(writerHeaders(TENANT_A), neverExisted, { displayName: 'Probe' });

    expect(crossTenant.status).toBe(404);
    expect(notFound.status).toBe(404);
    expect(crossTenant.status).toBe(notFound.status);
    expect(crossTenant.body['code']).toBe(notFound.body['code']);
    expect(crossTenant.body['code']).toBe('PARTICIPANT_NOT_FOUND');
  });

  // --- UPDATE ------------------------------------------------------------------------------

  // (C11) The restricted write role updates an own-tenant participant via the HTTP write path.
  it('(C11) updates an own-tenant participant over the HTTP write path', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Before' });

    const res = await update(writerHeaders(TENANT_A), id, { displayName: 'After' });
    expect(res.status).toBe(200);
    expect((res.body['participant'] as Record<string, unknown>)['displayName']).toBe('After');

    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.display_name).toBe('After');
  });

  // (C12 + C13) Update requires participant.write: a read-only actor is denied with 403.
  it('(C12/C13) update denies a read-only actor with 403', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Locked' });

    const res = await update(readerHeaders(TENANT_A), id, { displayName: 'Hacked' });
    expect(res.status).toBe(403);
    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.display_name).toBe('Locked');
  });

  // (C14) Tenant A updating Tenant B's participant returns 404 (never reveals existence).
  it('(C14) cross-tenant update returns 404 and never reveals existence', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_B), { participantId: id, displayName: 'B Member' });

    const res = await update(writerHeaders(TENANT_A), id, { displayName: 'A Tampering' });
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('PARTICIPANT_NOT_FOUND');

    // Tenant B's row is untouched.
    const row = await adminGetParticipant(admin, TENANT_B, id);
    expect(row?.display_name).toBe('B Member');
  });

  // (C15) Update rejects a status field with 400 (status transitions are NOT part of phase 1).
  it('(C15) update rejects a status field with 400', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'NoStatusChange' });
    const res = await update(writerHeaders(TENANT_A), id, { status: 'suspended' });
    expect(res.status).toBe(400);
  });

  // (C16) Update rejects organization-link fields with 400 (link writes are NOT part of phase 1).
  it('(C16) update rejects organization-link fields with 400', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'NoLinkWrite' });
    const res = await update(writerHeaders(TENANT_A), id, { organizationId: randomUUID() });
    expect(res.status).toBe(400);
  });

  // (C17) Update with null clears optional fields.
  it('(C17) update with null clears optional fields', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), {
      participantId: id,
      displayName: 'Clearable',
      email: 'clear.me@example.test',
    });
    const res = await update(writerHeaders(TENANT_A), id, { email: null });
    expect(res.status).toBe(200);
    expect((res.body['participant'] as Record<string, unknown>)['email']).toBeNull();
    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.email).toBeNull();
  });

  // (C18) Update writes the participant row AND its transactional outbox row together (atomic).
  it('(C18) update writes the participant row and outbox row atomically', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Before' });
    // Clear the create outbox so the assertion targets the update row only.
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [TENANT_A]);

    const res = await update(writerHeaders(TENANT_A), id, { displayName: 'After' });
    expect(res.status).toBe(200);

    const updated = await adminGetOutboxByType(admin, 'participant.registry.updated', TENANT_A);
    expect(updated.length).toBe(1);
    expect(updated[0]!.payload['participantId']).toBe(id);
    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.display_name).toBe('After');
  });

  // (C19) The update outbox payload excludes email, names, raw headers, tokens, connection strings.
  it('(C19) update outbox payload excludes unsafe fields', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Before' });
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [TENANT_A]);

    await update(writerHeaders(TENANT_A), id, {
      givenName: 'Pat',
      familyName: 'Writer',
      email: 'pat.writer@example.test',
    });
    const updated = await adminGetOutboxByType(admin, 'participant.registry.updated', TENANT_A);
    expect(updated.length).toBe(1);
    const serialized = JSON.stringify(updated[0]!.payload);
    for (const sentinel of FORBIDDEN_PAYLOAD_SENTINELS) {
      expect(serialized.includes(sentinel)).toBe(false);
    }
    for (const key of Object.keys(updated[0]!.payload)) {
      expect(SAFE_PAYLOAD_KEYS.has(key)).toBe(true);
    }
  });

  // --- Governance non-mutation + privacy projection ----------------------------------------

  // (C20/C21/C22) Write routes NEVER mutate governance.entity_state / state_transition / audit_event.
  it('(C20/C21/C22) write routes do not mutate governance lifecycle tables', async () => {
    const before = await adminCountGovernance(admin, TENANT_A);

    const id = randomUUID();
    await create(writerHeaders(TENANT_A), {
      participantId: id,
      displayName: 'Governed Never',
      email: 'g@example.test',
    });
    await update(writerHeaders(TENANT_A), id, { displayName: 'Still Not Governed' });

    const after = await adminCountGovernance(admin, TENANT_A);
    expect(after.entityState).toBe(before.entityState);
    expect(after.stateTransition).toBe(before.stateTransition);
    expect(after.auditEvent).toBe(before.auditEvent);
  });

  // The authorized write read-back exposes ONLY the closed, safe DTO field set.
  it('write responses expose only the safe closed DTO field set', async () => {
    const id = randomUUID();
    const res = await create(writerHeaders(TENANT_A), {
      participantId: id,
      displayName: 'Pat Writer',
      givenName: 'Pat',
      familyName: 'Writer',
      email: 'pat.writer@example.test',
    });
    const participant = res.body['participant'] as Record<string, unknown>;
    expect(new Set(Object.keys(participant))).toEqual(ALLOWED_PARTICIPANT_DTO_KEYS);
  });

  // --- STATUS TRANSITION -------------------------------------------------------------------

  // (S1) The restricted write role transitions an own-tenant participant's status (draft → active).
  it('(S1) transitions an own-tenant participant status over the HTTP write path', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Status Subject' });

    const res = await statusTransition(writerHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(200);
    expect((res.body['participant'] as Record<string, unknown>)['status']).toBe('active');

    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.status).toBe('active');
  });

  // (S2) The status transition requires participant.status.write: a read-only actor is denied 403.
  it('(S2) status transition denies a read-only actor with 403', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Guarded' });

    const res = await statusTransition(readerHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(403);
    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.status).toBe('draft'); // unchanged
  });

  // (S3) The status transition fails closed (401) when no tenant identity is present.
  it('(S3) status transition fails closed with 401 when tenant identity is absent', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'NoTenant' });
    const res = await statusTransition(
      {
        'x-house-actor-user-id': randomUUID(),
        'x-house-actor-role-keys': 'participant_admin',
        'idempotency-key': `idem-${randomUUID()}`,
      },
      id,
      { targetStatus: 'active' },
    );
    expect(res.status).toBe(401);
  });

  // (S4) The status transition rejects a missing Idempotency-Key with 400.
  it('(S4) status transition rejects a missing Idempotency-Key with 400', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'NoKey' });
    const headers = writerHeaders(TENANT_A);
    delete headers['idempotency-key'];
    const res = await statusTransition(headers, id, { targetStatus: 'active' });
    expect(res.status).toBe(400);
  });

  // (S5/S6) The status transition rejects a missing/invalid targetStatus with 400.
  it('(S5/S6) status transition rejects a missing or invalid targetStatus with 400', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'BadTarget' });
    expect((await statusTransition(writerHeaders(TENANT_A), id, {})).status).toBe(400);
    expect(
      (await statusTransition(writerHeaders(TENANT_A), id, { targetStatus: 'banished' })).status,
    ).toBe(400);
    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.status).toBe('draft'); // unchanged
  });

  // (S7) The status transition rejects a misplaced profile / organization-link field with 400.
  it('(S7) status transition rejects misplaced body fields with 400', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Closed' });
    expect(
      (await statusTransition(writerHeaders(TENANT_A), id, {
        targetStatus: 'active',
        displayName: 'Nope',
      })).status,
    ).toBe(400);
    expect(
      (await statusTransition(writerHeaders(TENANT_A), id, {
        targetStatus: 'active',
        organizationId: randomUUID(),
      })).status,
    ).toBe(400);
  });

  // (S8) The status transition returns 404 for a participant that exists nowhere.
  it('(S8) status transition returns 404 for a missing participant', async () => {
    const res = await statusTransition(writerHeaders(TENANT_A), randomUUID(), {
      targetStatus: 'active',
    });
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('PARTICIPANT_NOT_FOUND');
  });

  // (S9) Tenant A transitioning Tenant B's participant returns 404 (never reveals existence).
  it('(S9) cross-tenant status transition returns 404 and never touches the other tenant', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_B), { participantId: id, displayName: 'B Member' });

    const res = await statusTransition(writerHeaders(TENANT_A), id, { targetStatus: 'suspended' });
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('PARTICIPANT_NOT_FOUND');

    const row = await adminGetParticipant(admin, TENANT_B, id);
    expect(row?.status).toBe('draft'); // Tenant B's row untouched
  });

  // (S10) A real status transition writes the participant row AND a sanitized status_changed outbox
  //       row together (atomic); the payload carries no email, names, headers, tokens, or bytes.
  it('(S10) status transition writes the row and a sanitized status_changed outbox atomically', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), {
      participantId: id,
      displayName: 'Pat Writer',
      givenName: 'Pat',
      familyName: 'Writer',
      email: 'pat.writer@example.test',
    });
    // Clear the create outbox so the assertion targets the status_changed row only.
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [TENANT_A]);

    const res = await statusTransition(writerHeaders(TENANT_A), id, { targetStatus: 'suspended' });
    expect(res.status).toBe(200);

    const changed = await adminGetOutboxByType(
      admin,
      'participant.registry.status_changed',
      TENANT_A,
    );
    expect(changed.length).toBe(1);
    expect(changed[0]!.payload['participantId']).toBe(id);
    expect(changed[0]!.payload['previousStatus']).toBe('draft');
    expect(changed[0]!.payload['newStatus']).toBe('suspended');
    const serialized = JSON.stringify(changed[0]!.payload);
    for (const sentinel of FORBIDDEN_PAYLOAD_SENTINELS) {
      expect(serialized.includes(sentinel)).toBe(false);
    }
    for (const key of Object.keys(changed[0]!.payload)) {
      expect(SAFE_STATUS_PAYLOAD_KEYS.has(key)).toBe(true);
    }
    const row = await adminGetParticipant(admin, TENANT_A, id);
    expect(row?.status).toBe('suspended');
  });

  // (S11) Re-applying the current status is an idempotent no-op: 200, and NO status_changed outbox
  //       row is written (the service short-circuits an unchanged status).
  it('(S11) re-applying the current status is a no-op with no status_changed outbox row', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'Idem', status: 'active' });
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [TENANT_A]);

    const res = await statusTransition(writerHeaders(TENANT_A), id, { targetStatus: 'active' });
    expect(res.status).toBe(200);
    expect((res.body['participant'] as Record<string, unknown>)['status']).toBe('active');

    const changed = await adminGetOutboxByType(
      admin,
      'participant.registry.status_changed',
      TENANT_A,
    );
    expect(changed.length).toBe(0);
  });

  // (S12) The status transition NEVER mutates governance.entity_state / state_transition /
  //       audit_event (participant status is reference data, not a governed lifecycle FSM).
  it('(S12) status transition does not mutate governance lifecycle tables', async () => {
    const before = await adminCountGovernance(admin, TENANT_A);

    const id = randomUUID();
    await create(writerHeaders(TENANT_A), { participantId: id, displayName: 'NotGoverned' });
    await statusTransition(writerHeaders(TENANT_A), id, { targetStatus: 'active' });
    await statusTransition(writerHeaders(TENANT_A), id, { targetStatus: 'suspended' });

    const after = await adminCountGovernance(admin, TENANT_A);
    expect(after.entityState).toBe(before.entityState);
    expect(after.stateTransition).toBe(before.stateTransition);
    expect(after.auditEvent).toBe(before.auditEvent);
  });

  // (S13) The status-transition read-back exposes ONLY the closed, safe DTO field set.
  it('(S13) status transition responses expose only the safe closed DTO field set', async () => {
    const id = randomUUID();
    await create(writerHeaders(TENANT_A), {
      participantId: id,
      displayName: 'Pat Writer',
      email: 'pat.writer@example.test',
    });
    const res = await statusTransition(writerHeaders(TENANT_A), id, { targetStatus: 'active' });
    const participant = res.body['participant'] as Record<string, unknown>;
    expect(new Set(Object.keys(participant))).toEqual(ALLOWED_PARTICIPANT_DTO_KEYS);
  });
});
