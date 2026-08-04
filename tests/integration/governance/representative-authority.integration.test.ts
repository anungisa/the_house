import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgRepresentativeAuthorityStore } from '../../../src/domains/representative-authority/PgRepresentativeAuthorityStore.js';
import { RepresentativeAuthorityService } from '../../../src/domains/representative-authority/RepresentativeAuthorityService.js';
import {
  AUTHORITY_GRANTED_MESSAGE_TYPE,
  AUTHORITY_REVOKED_MESSAGE_TYPE,
  authorityGrantedDedupeKey,
  authorityRevokedDedupeKey,
} from '../../../src/domains/representative-authority/RepresentativeAuthorityStore.js';
import { resolveEffectiveState } from '../../../src/domains/representative-authority/effectiveStatus.js';
import { HOUSE_TRUSTED_ISSUER } from '../../../src/domains/representative-authority/RepresentativeAuthorityTypes.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';

/**
 * Gated PostgreSQL integration tests for the GOVERNED REPRESENTATIVE AUTHORITY source
 * (migration 0021 + PgRepresentativeAuthorityStore + RepresentativeAuthorityService).
 *
 * These prove, against REAL PostgreSQL, that representative authority is a PERSISTED,
 * tenant-isolated, time-aware fact — never manufactured by a trusted identity alone. A grant
 * writes the authority head, the append-only authority event, the governance audit event, and the
 * transactional outbox message ATOMICALLY, under FORCE Row-Level Security, executed by a
 * NON-superuser, NON-BYPASSRLS runtime role. Cross-tenant authorities never resolve; effective
 * expiry is DERIVED (never stored); revoke is idempotent (revoke once).
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise skipped so `npm test` stays
 * hermetic. NO real Azure, Entra/JWKS, Service Bus, Key Vault, Docker, or external network.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '40000000-0000-4000-8000-0000000000e5';
const TENANT_B = '40000000-0000-4000-8000-0000000000f6';

const APP_ROLE = 'house_app_authority_test';
const APP_PW = 'authority_app_pw';

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
  // Least privilege: authority head + subject (SELECT/INSERT/UPDATE), append-only event
  // (SELECT/INSERT), governance audit (SELECT/INSERT), shared outbox (SELECT/INSERT/UPDATE).
  // No DELETE / TRUNCATE anywhere.
  await admin.query(`REVOKE ALL ON authority.identity_subject FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON authority.representative_authority FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON authority.authority_event FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON governance.audit_event FROM ${APP_ROLE}`);
  await admin.query(`REVOKE ALL ON governance.outbox_message FROM ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA authority TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON authority.identity_subject TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON authority.representative_authority TO ${APP_ROLE}`,
  );
  await admin.query(`GRANT SELECT, INSERT ON authority.authority_event TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT ON governance.audit_event TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON governance.outbox_message TO ${APP_ROLE}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

async function adminGetAuthority(
  admin: pg.Pool,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await admin.query(
    `SELECT * FROM authority.representative_authority WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function adminCountEvents(admin: pg.Pool, authorityId: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM authority.authority_event WHERE authority_id = $1`,
    [authorityId],
  );
  return rows[0]!.n;
}

async function adminCountAudit(admin: pg.Pool, authorityId: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM governance.audit_event
       WHERE entity_type = 'RepresentativeAuthority' AND entity_id = $1`,
    [authorityId],
  );
  return rows[0]!.n;
}

async function adminGetOutbox(
  admin: pg.Pool,
  dedupeKey: string,
): Promise<{ message_type: string; tenant_id: string; payload: Record<string, unknown> } | undefined> {
  const { rows } = await admin.query<{
    message_type: string;
    tenant_id: string;
    payload: Record<string, unknown>;
  }>(
    `SELECT message_type, tenant_id, payload FROM governance.outbox_message WHERE dedupe_key = $1`,
    [dedupeKey],
  );
  return rows[0];
}

const AUTHORITY_TYPE = 'club_affiliation_representative' as const;

d('representative authority — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let service: RepresentativeAuthorityService;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    service = new RepresentativeAuthorityService(new PgRepresentativeAuthorityStore(appPool));
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    await admin.query(`DELETE FROM authority.authority_event WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
    await admin.query(
      `DELETE FROM authority.representative_authority WHERE tenant_id = ANY($1::uuid[])`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM authority.identity_subject WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
    await admin.query(
      `DELETE FROM governance.audit_event WHERE tenant_id = ANY($1::uuid[])
         AND entity_type = 'RepresentativeAuthority'`,
      [[TENANT_A, TENANT_B]],
    );
    await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = ANY($1::uuid[])`, [
      [TENANT_A, TENANT_B],
    ]);
  });

  const grant = (over: Record<string, unknown> = {}) =>
    service.grant({
      tenantId: TENANT_A,
      issuer: HOUSE_TRUSTED_ISSUER,
      externalSubject: 'subject-1',
      organizationId: randomUUID(),
      authorityType: AUTHORITY_TYPE,
      issuedBy: 'admin',
      sourceReference: 'seed:1',
      idempotencyKey: `idem-${randomUUID()}`,
      meta: { correlationId: 'corr-1', causationId: 'cause-1', actorUserId: 'admin' },
      ...over,
    });

  it('applies migration 0021', async () => {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.schema_migrations WHERE filename = $1`,
      ['0021_representative_authority.sql'],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('runs as a NON-superuser, NON-BYPASSRLS runtime role', async () => {
    const { rows } = await admin.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE],
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  it('grants an active authority and writes head + event + audit + outbox atomically', async () => {
    const org = randomUUID();
    const view = await grant({ organizationId: org, idempotencyKey: 'idem-atomic' });
    expect(view.status).toBe('active');

    const head = await adminGetAuthority(admin, view.authorityId);
    expect(head?.['status']).toBe('active');
    expect(head?.['tenant_id']).toBe(TENANT_A);
    expect(await adminCountEvents(admin, view.authorityId)).toBe(1);
    expect(await adminCountAudit(admin, view.authorityId)).toBe(1);

    const outbox = await adminGetOutbox(admin, authorityGrantedDedupeKey('idem-atomic'));
    expect(outbox?.message_type).toBe(AUTHORITY_GRANTED_MESSAGE_TYPE);
    expect(outbox?.tenant_id).toBe(TENANT_A);
    expect(outbox?.payload['organizationId']).toBe(org);
  });

  it('cross-tenant isolation: a tenant-A authority never resolves for tenant B', async () => {
    const view = await grant();
    expect(await service.readEffective(TENANT_A, view.authorityId)).toBeDefined();
    expect(await service.readEffective(TENANT_B, view.authorityId)).toBeUndefined();
  });

  it('is idempotent: replaying a grant key returns the original and writes no duplicate rows', async () => {
    const org = randomUUID();
    const first = await grant({ organizationId: org, idempotencyKey: 'idem-replay' });
    const second = await grant({ organizationId: org, idempotencyKey: 'idem-replay' });
    expect(second.authorityId).toBe(first.authorityId);
    expect(await adminCountEvents(admin, first.authorityId)).toBe(1);
    expect(await adminCountAudit(admin, first.authorityId)).toBe(1);
  });

  it('rejects a second live active grant for the same subject+org (conflict, no partial writes)', async () => {
    const org = randomUUID();
    const first = await grant({ organizationId: org, idempotencyKey: 'idem-a' });
    await expect(
      grant({ organizationId: org, idempotencyKey: 'idem-b' }),
    ).rejects.toMatchObject({ code: ErrorCode.REPRESENTATIVE_AUTHORITY_CONFLICT });
    // The conflict path returns before any event/outbox insert: still exactly one of each.
    expect(await adminCountEvents(admin, first.authorityId)).toBe(1);
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM authority.representative_authority
         WHERE tenant_id = $1 AND organization_id = $2`,
      [TENANT_A, org],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('revokes once: a revoke terminates the authority; a second revoke is an idempotent no-op', async () => {
    const view = await grant();
    const revoked = await service.revoke({
      tenantId: TENANT_A,
      authorityId: view.authorityId,
      revokedBy: 'admin',
      revocationReasonCode: 'compliance',
      idempotencyKey: 'rev-1',
      meta: { correlationId: 'corr-2', causationId: 'cause-2' },
    });
    expect(revoked.status).toBe('revoked');

    const again = await service.revoke({
      tenantId: TENANT_A,
      authorityId: view.authorityId,
      revokedBy: 'admin',
      idempotencyKey: 'rev-2',
    });
    expect(again.status).toBe('revoked');

    // One granted event + one revoked event (the second revoke is a no-op).
    expect(await adminCountEvents(admin, view.authorityId)).toBe(2);
    const outbox = await adminGetOutbox(admin, authorityRevokedDedupeKey('rev-1'));
    expect(outbox?.message_type).toBe(AUTHORITY_REVOKED_MESSAGE_TYPE);
  });

  it('derives expiry: a past validUntil resolves as expired without any stored mutation', async () => {
    const view = await grant({
      validFrom: '2020-01-01T00:00:00.000Z',
      validUntil: '2020-06-01T00:00:00.000Z',
    });
    const head = await adminGetAuthority(admin, view.authorityId);
    // Stored status remains 'active' — expiry is derived, never written.
    expect(head?.['status']).toBe('active');
    const record = await service.readEffective(TENANT_A, view.authorityId);
    expect(record?.status).toBe('expired');
    expect(resolveEffectiveState({ status: 'active', validFrom: '2020-01-01T00:00:00.000Z', validUntil: '2020-06-01T00:00:00.000Z' }, new Date().toISOString())).toBe('expired');
  });

  it('lists effective authorities for a subject and omits future-dated grants', async () => {
    await grant({ organizationId: randomUUID(), idempotencyKey: 'k-active' });
    await grant({
      organizationId: randomUUID(),
      idempotencyKey: 'k-future',
      validFrom: '2999-01-01T00:00:00.000Z',
    });
    const effective = await service.listEffectiveForSubject(
      TENANT_A,
      HOUSE_TRUSTED_ISSUER,
      'subject-1',
      AUTHORITY_TYPE,
    );
    expect(effective).toHaveLength(1);
    expect(effective[0]!.status).toBe('active');
  });

  it('an unlinked identity subject resolves to no authority', async () => {
    await grant({ organizationId: randomUUID(), idempotencyKey: 'k-unlink' });
    // Unlink the subject (admin) — the provider read requires an ACTIVE linkage.
    await admin.query(
      `UPDATE authority.identity_subject SET status = 'unlinked', unlinked_at = now()
         WHERE tenant_id = $1 AND issuer = $2 AND external_subject = $3`,
      [TENANT_A, HOUSE_TRUSTED_ISSUER, 'subject-1'],
    );
    const effective = await service.listEffectiveForSubject(
      TENANT_A,
      HOUSE_TRUSTED_ISSUER,
      'subject-1',
      AUTHORITY_TYPE,
    );
    expect(effective).toHaveLength(0);
  });
});
