import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgParticipantRegistryStore } from '../../../src/domains/participant-registry/PgParticipantRegistryStore.js';
import { ParticipantRegistryService } from '../../../src/domains/participant-registry/ParticipantRegistryService.js';
import {
  PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
} from '../../../src/domains/participant-registry/ParticipantTypes.js';
import {
  buildOrganizationLinkedOutbox,
} from '../../../src/domains/participant-registry/ParticipantRegistryStore.js';
import type { OrganizationParticipantRecord } from '../../../src/domains/participant-registry/ParticipantTypes.js';
import { PgOrganizationRegistryStore } from '../../../src/domains/organization-registry/PgOrganizationRegistryStore.js';
import { OrganizationRegistryService } from '../../../src/domains/organization-registry/OrganizationRegistryService.js';

/**
 * Gated PostgreSQL integration tests for PARTICIPANT REGISTRY *WRITE BRANCHES* not exercised by
 * `participant-registry.integration.test.ts` (which covers create/read/link/cross-tenant/RLS/
 * outbox-on-create+link/no-governance-mutation/sanitization). This file targets the residual
 * write paths against REAL PostgreSQL:
 *   * the profile-update path (PgParticipantRegistryStore.updateParticipant) + its transactional
 *     `participant.registry.updated` outbox row;
 *   * the relationship status-change `organization_link_status_changed` outbox row;
 *   * the DATABASE BACKSTOP for the single-active-relationship rule
 *     (organization_participant_active_unique_idx) — a duplicate non-ended relationship of the
 *     same type is rejected with a unique violation even if the service's idempotency guard is
 *     bypassed, and a fresh active relationship is allowed once the prior one has ended.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin URL is provided (MIGRATE_DATABASE_URL
 * preferred, else DATABASE_URL); otherwise skipped so the default `npm test` stays hermetic. NO
 * real Azure, Entra/JWKS, antivirus, Service Bus, Key Vault, Docker, registry, Cosign,
 * transparency log, or external network is contacted. The restricted role is NON-superuser,
 * NON-BYPASSRLS, RLS-confined, with no DELETE.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

// Distinct tenant UUIDs + role for this suite (avoids cross-suite interference on a shared DB).
// NOTE: these MUST NOT overlap any other integration suite — the suites run in parallel with
// destructive `beforeEach` cleanup, and THIS suite also writes to organization_registry, so the
// pair must be unique across BOTH the participant and organization suites. Current 40000000-…
// map: org=a1/b2, org-http=c1/d2, participant-main=c3/d4, participant-read-http=e5/f6,
// participant-write-http=a7/b8, participant-write-branches=91/92 (here).
const TENANT_A = '40000000-0000-4000-8000-000000000091';
const TENANT_B = '40000000-0000-4000-8000-000000000092';
const APP_ROLE = 'house_app_participant_writebranch_test';
const APP_PW = 'participant_writebranch_pw';

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

/**
 * Fetch the single outbox row of a given message type for a tenant. The DB reformats the
 * timestamptz used inside a dedupe key, so write-path assertions look up by message type +
 * tenant (the per-test cleanup guarantees at most one matching row).
 */
async function adminGetOutboxByType(
  admin: pg.Pool,
  messageType: string,
  tenantId: string,
): Promise<{ message_type: string; payload: Record<string, unknown>; tenant_id: string } | undefined> {
  const { rows } = await admin.query<{
    message_type: string;
    payload: Record<string, unknown>;
    tenant_id: string;
  }>(
    `SELECT message_type, payload, tenant_id FROM governance.outbox_message
       WHERE message_type = $1 AND tenant_id = $2`,
    [messageType, tenantId],
  );
  return rows[0];
}

d('participant registry — PostgreSQL write-branch integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let store: PgParticipantRegistryStore;
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
    const orgStore = new PgOrganizationRegistryStore(appPool);
    orgService = new OrganizationRegistryService(orgStore);
    store = new PgParticipantRegistryStore(appPool);
    service = new ParticipantRegistryService(store, { organizationReader: orgStore });
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
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

  const createParticipant = (id = randomUUID(), tenantId = TENANT_A) =>
    service.createParticipant({
      tenantId,
      participantId: id,
      displayName: 'Reference Person',
      status: 'active',
    });

  // (1) The profile-update write path persists new attributes and emits a transactional
  //     participant.registry.updated outbox row.
  it('updates a participant profile and emits a transactional updated outbox row', async () => {
    const id = randomUUID();
    await createParticipant(id);
    const updated = await service.updateParticipant({
      tenantId: TENANT_A,
      participantId: id,
      displayName: 'Renamed Reference Person',
      email: '  New.Contact@Example.COM  ',
    });
    expect(updated.displayName).toBe('Renamed Reference Person');
    expect(updated.email).toBe('new.contact@example.com');

    const out = await adminGetOutboxByType(admin, PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE, TENANT_A);
    expect(out).toBeDefined();
    expect(out!.message_type).toBe(PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE);
    expect(out!.tenant_id).toBe(TENANT_A);
    expect(out!.payload['participantId']).toBe(id);
    // Sanitized: the email/name are NEVER projected into the signal.
    const serialized = JSON.stringify(out!.payload).toLowerCase();
    expect(serialized).not.toContain('new.contact@example.com');
    expect(serialized).not.toContain('renamed reference person');
  });

  // (2) A relationship status change emits a transactional organization_link_status_changed row.
  it('emits a transactional organization_link_status_changed outbox row on a relationship status change', async () => {
    const orgId = randomUUID();
    const pId = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createParticipant(pId);
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_A,
      organizationId: orgId,
      participantId: pId,
      relationshipType: 'member',
    });
    const ended = await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_A,
      relationshipId: link.relationshipId,
      status: 'ended',
      endDate: '2024-12-31',
    });
    expect(ended.status).toBe('ended');
    const out = await adminGetOutboxByType(
      admin,
      PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
      TENANT_A,
    );
    expect(out).toBeDefined();
    expect(out!.message_type).toBe(PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE);
    expect(out!.payload['previousStatus']).toBe('active');
    expect(out!.payload['newStatus']).toBe('ended');
  });

  // (3) The DB partial-unique index rejects a duplicate NON-ended relationship of the same type,
  //     even when the service-level idempotency guard is bypassed (direct store insert).
  it('rejects a duplicate active relationship at the database backstop', async () => {
    const orgId = randomUUID();
    const pId = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createParticipant(pId);

    const base: Omit<OrganizationParticipantRecord, 'relationshipId'> = {
      tenantId: TENANT_A,
      organizationId: orgId,
      participantId: pId,
      relationshipType: 'member',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const first: OrganizationParticipantRecord = { ...base, relationshipId: randomUUID() };
    const firstResult = await store.createOrganizationLink(first, buildOrganizationLinkedOutbox(first, {}));
    expect(firstResult.outcome).toBe('created');

    // A SECOND active relationship with a different PK but the same (org, participant, type)
    // violates organization_participant_active_unique_idx.
    const second: OrganizationParticipantRecord = { ...base, relationshipId: randomUUID() };
    await expect(
      store.createOrganizationLink(second, buildOrganizationLinkedOutbox(second, {})),
    ).rejects.toMatchObject({ code: '23505' });
  });

  // (4) Once the prior relationship of a type is ended, a fresh active relationship is allowed.
  it('allows a fresh active relationship after the prior one of the same type has ended', async () => {
    const orgId = randomUUID();
    const pId = randomUUID();
    await seedOrg(TENANT_A, orgId);
    await createParticipant(pId);
    const first = await service.linkParticipantToOrganization({
      tenantId: TENANT_A,
      organizationId: orgId,
      participantId: pId,
      relationshipType: 'staff',
    });
    await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_A,
      relationshipId: first.relationshipId,
      status: 'ended',
    });
    const second = await service.linkParticipantToOrganization({
      tenantId: TENANT_A,
      organizationId: orgId,
      participantId: pId,
      relationshipType: 'staff',
    });
    expect(second.relationshipId).not.toBe(first.relationshipId);
    expect(second.status).toBe('active');
  });

  // (5) The profile-update write path never touches a governed lifecycle table.
  it('does not create or mutate any governed lifecycle row on a profile update', async () => {
    const id = randomUUID();
    await createParticipant(id);
    const tables = [
      'governance.entity_state',
      'governance.state_transition',
      'governance.audit_event',
    ] as const;
    const countFor = async (table: string): Promise<number> => {
      const { rows } = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = ANY($1::uuid[])`,
        [[TENANT_A, TENANT_B]],
      );
      return rows[0]!.n;
    };
    const before = await Promise.all(tables.map(countFor));
    await service.updateParticipant({
      tenantId: TENANT_A,
      participantId: id,
      displayName: 'Renamed Reference Person',
    });
    const after = await Promise.all(tables.map(countFor));
    expect(after).toEqual(before);
    expect(after).toEqual([0, 0, 0]);
  });
});
