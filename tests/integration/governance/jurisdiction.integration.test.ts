import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgJurisdictionStore } from '../../../src/domains/jurisdiction/PgJurisdictionStore.js';
import { JurisdictionCatalogService } from '../../../src/domains/jurisdiction/JurisdictionCatalogService.js';
import {
  GovernedJurisdictionResolver,
  type JurisdictionOrganizationReader,
} from '../../../src/domains/jurisdiction/index.js';
import {
  JURISDICTION_ASSIGNED_MESSAGE_TYPE,
  JURISDICTION_CREATED_MESSAGE_TYPE,
  jurisdictionDedupeKey,
} from '../../../src/domains/jurisdiction/JurisdictionStore.js';
import type { OrganizationView } from '../../../src/domains/organization-registry/OrganizationTypes.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';

/**
 * Gated PostgreSQL integration tests for GOVERNED JURISDICTION RESOLUTION (migration 0023 +
 * PgJurisdictionStore + JurisdictionCatalogService + GovernedJurisdictionResolver).
 *
 * These prove, against REAL PostgreSQL, that an organization's governing jurisdiction is a
 * PERSISTED, tenant-isolated, governed fact — never derived from its type. Every governed command
 * mutates the head (catalog row / assignment edge), appends the append-only event, writes a
 * `governance.audit_event`, and enqueues a transactional outbox message ATOMICALLY, under FORCE
 * Row-Level Security, executed by a NON-superuser, NON-BYPASSRLS runtime role. We pin per-command
 * idempotency, the one-active-primary invariant, cross-tenant isolation, direct + inherited
 * resolution, optimistic version conflict on replace, and historical preservation of a superseded
 * assignment after replace/revoke.
 *
 * GATING: runs only when RUN_DB_TESTS=1 and an admin connection URL is provided
 * (MIGRATE_DATABASE_URL preferred, else DATABASE_URL). Otherwise skipped so `npm test` stays
 * hermetic. NO real Azure, Entra/JWKS, Service Bus, Key Vault, or external network.
 */

const ADMIN_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const RUN = process.env.RUN_DB_TESTS === '1' && ADMIN_URL !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '40000000-0000-4000-8000-00000000a1e1';
const TENANT_B = '40000000-0000-4000-8000-00000000b2f2';

const ORG_1 = '50000000-0000-4000-8000-000000000001';
const ORG_B = '50000000-0000-4000-8000-0000000000b0';
const ORG_PROV = '50000000-0000-4000-8000-0000000000a0';
const ORG_CLUB = '50000000-0000-4000-8000-0000000000c0';

const APP_ROLE = 'house_app_jur_test';
const APP_PW = 'jur_app_pw';

const PROVISION_LOCK_KEY = 918_275;
// The resolution instant must sit AFTER each assignment's persisted valid_from (now() at insert),
// so we anchor it one hour ahead of the wall clock rather than a fixed literal.
const NOW = new Date(Date.now() + 3_600_000).toISOString();

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
  // Least privilege: catalog head (S/I/U), append-only catalog event (S/I), assignment head
  // (S/I/U), append-only assignment event (S/I), governance audit (S/I), shared outbox (S/I/U).
  // No DELETE / TRUNCATE anywhere.
  await admin.query(`GRANT USAGE ON SCHEMA organization_registry TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON organization_registry.jurisdiction TO ${APP_ROLE}`,
  );
  await admin.query(
    `GRANT SELECT, INSERT ON organization_registry.jurisdiction_event TO ${APP_ROLE}`,
  );
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON organization_registry.organization_jurisdiction TO ${APP_ROLE}`,
  );
  await admin.query(
    `GRANT SELECT, INSERT ON organization_registry.organization_jurisdiction_event TO ${APP_ROLE}`,
  );
  await admin.query(`GRANT SELECT, INSERT ON governance.audit_event TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON governance.outbox_message TO ${APP_ROLE}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

/** Seed an organization row (admin bypasses RLS) so assignment FKs are satisfiable. */
async function seedOrg(
  admin: pg.Pool,
  tenantId: string,
  id: string,
  parentId?: string,
): Promise<void> {
  await admin.query(
    `INSERT INTO organization_registry.organization
       (id, tenant_id, organization_type, display_name, status, parent_organization_id)
     VALUES ($1,$2,'local',$3,'active',$4)
     ON CONFLICT (id) DO NOTHING`,
    [id, tenantId, `org-${id}`, parentId ?? null],
  );
}

function orgView(
  tenantId: string,
  id: string,
  parentOrganizationId?: string,
): OrganizationView {
  return {
    organizationId: id,
    tenantId,
    organizationType: 'local',
    displayName: id,
    status: 'active',
    source: 'manual',
    createdAt: NOW,
    updatedAt: NOW,
    ...(parentOrganizationId !== undefined ? { parentOrganizationId } : {}),
  };
}

function reader(orgs: readonly OrganizationView[]): JurisdictionOrganizationReader {
  return {
    getById: (tenantId, organizationId) =>
      Promise.resolve(
        orgs.find((o) => o.tenantId === tenantId && o.organizationId === organizationId),
      ),
  };
}

async function adminCountCatalogEvents(admin: pg.Pool, rowId: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM organization_registry.jurisdiction_event
       WHERE jurisdiction_row_id = $1`,
    [rowId],
  );
  return rows[0]!.n;
}

async function adminCountAssignmentEvents(admin: pg.Pool, rowId: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM organization_registry.organization_jurisdiction_event
       WHERE assignment_row_id = $1`,
    [rowId],
  );
  return rows[0]!.n;
}

async function adminCountAudit(
  admin: pg.Pool,
  entityType: string,
  entityId: string,
): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM governance.audit_event
       WHERE entity_type = $1 AND entity_id = $2`,
    [entityType, entityId],
  );
  return rows[0]!.n;
}

async function adminCountOutbox(admin: pg.Pool, dedupeKey: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM governance.outbox_message WHERE dedupe_key = $1`,
    [dedupeKey],
  );
  return rows[0]!.n;
}

d('governed jurisdiction — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let store: PgJurisdictionStore;
  let service: JurisdictionCatalogService;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    store = new PgJurisdictionStore(appPool);
    service = new JurisdictionCatalogService(store);
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    for (const tenant of [TENANT_A, TENANT_B]) {
      await admin.query(
        `DELETE FROM organization_registry.organization_jurisdiction_event WHERE tenant_id = $1`,
        [tenant],
      );
      await admin.query(
        `DELETE FROM organization_registry.organization_jurisdiction WHERE tenant_id = $1`,
        [tenant],
      );
      await admin.query(
        `DELETE FROM organization_registry.jurisdiction_event WHERE tenant_id = $1`,
        [tenant],
      );
      await admin.query(`DELETE FROM organization_registry.jurisdiction WHERE tenant_id = $1`, [
        tenant,
      ]);
      await admin.query(
        `DELETE FROM governance.audit_event WHERE tenant_id = $1
           AND entity_type IN ('Jurisdiction', 'OrganizationJurisdiction')`,
        [tenant],
      );
      await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [tenant]);
      await admin.query(
        `DELETE FROM organization_registry.organization
           WHERE tenant_id = $1 AND source = 'manual' AND display_name LIKE 'org-%'`,
        [tenant],
      );
    }
  });

  async function seedPublished(tenantId: string, code: string, level = 'subdivision'): Promise<string> {
    const draft = await service.createDraft({
      tenantId,
      idempotencyKey: `create:${code}`,
      code,
      level: level as 'subdivision',
      labelEn: `${code} EN`,
      labelFr: `${code} FR`,
    });
    await service.publish({ tenantId, idempotencyKey: `publish:${code}`, code });
    return draft.id;
  }

  it('applies migration 0023', async () => {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.schema_migrations WHERE filename = $1`,
      ['0023_governed_jurisdiction_resolution.sql'],
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

  it('create + publish write head, events, audit and outbox atomically', async () => {
    const rowId = await seedPublished(TENANT_A, 'on');
    const head = await service.getJurisdiction(TENANT_A, 'on');

    expect(head?.status).toBe('published');
    // created + published events, both audited, both enqueued.
    expect(await adminCountCatalogEvents(admin, rowId)).toBe(2);
    expect(await adminCountAudit(admin, 'Jurisdiction', rowId)).toBe(2);
    expect(
      await adminCountOutbox(admin, jurisdictionDedupeKey(JURISDICTION_CREATED_MESSAGE_TYPE, 'create:on')),
    ).toBe(1);
  });

  it('assignPrimary writes assignment, event, audit and outbox atomically', async () => {
    await seedPublished(TENANT_A, 'on');
    await seedOrg(admin, TENANT_A, ORG_1);
    const assignment = await service.assignPrimary({
      tenantId: TENANT_A,
      idempotencyKey: 'assign:1',
      organizationId: ORG_1,
      jurisdictionCode: 'on',
      inheritanceMode: 'inheritable',
      sourceReference: 'board-motion',
    });

    expect(assignment.status).toBe('active');
    expect(await adminCountAssignmentEvents(admin, assignment.id)).toBe(1);
    expect(await adminCountAudit(admin, 'OrganizationJurisdiction', assignment.id)).toBe(1);
    expect(
      await adminCountOutbox(
        admin,
        jurisdictionDedupeKey(JURISDICTION_ASSIGNED_MESSAGE_TYPE, 'assign:1'),
      ),
    ).toBe(1);
  });

  it('is idempotent: a replayed create adds no second event/audit/outbox', async () => {
    const rowId = await seedPublished(TENANT_A, 'on');
    const replay = await service.createDraft({
      tenantId: TENANT_A,
      idempotencyKey: 'create:on',
      code: 'on',
      level: 'subdivision',
      labelEn: 'on EN',
      labelFr: 'on FR',
    });
    expect(replay.id).toBe(rowId);
    // Still just the created + published events (replay collapsed).
    expect(await adminCountCatalogEvents(admin, rowId)).toBe(2);
    expect(
      await adminCountOutbox(
        admin,
        jurisdictionDedupeKey(JURISDICTION_CREATED_MESSAGE_TYPE, 'create:on'),
      ),
    ).toBe(1);
  });

  it('is idempotent: a replayed assign returns the same row, no duplicate', async () => {
    await seedPublished(TENANT_A, 'on');
    await seedOrg(admin, TENANT_A, ORG_1);
    const command = {
      tenantId: TENANT_A,
      idempotencyKey: 'assign:1',
      organizationId: ORG_1,
      jurisdictionCode: 'on',
      inheritanceMode: 'direct' as const,
      sourceReference: 'ref',
    };
    const first = await service.assignPrimary(command);
    const replay = await service.assignPrimary(command);
    expect(replay.id).toBe(first.id);
    expect(await adminCountAssignmentEvents(admin, first.id)).toBe(1);
  });

  it('enforces the one-active-primary invariant (JURISDICTION_CONFLICT)', async () => {
    await seedPublished(TENANT_A, 'on');
    await seedPublished(TENANT_A, 'qc');
    await seedOrg(admin, TENANT_A, ORG_1);
    await service.assignPrimary({
      tenantId: TENANT_A,
      idempotencyKey: 'assign:1',
      organizationId: ORG_1,
      jurisdictionCode: 'on',
      inheritanceMode: 'direct',
      sourceReference: 'ref',
    });
    await expect(
      service.assignPrimary({
        tenantId: TENANT_A,
        idempotencyKey: 'assign:2',
        organizationId: ORG_1,
        jurisdictionCode: 'qc',
        inheritanceMode: 'direct',
        sourceReference: 'ref',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_CONFLICT });
  });

  it('is TENANT-ISOLATED: a jurisdiction in tenant A is invisible to tenant B', async () => {
    await seedPublished(TENANT_A, 'on');
    expect(await service.getJurisdiction(TENANT_B, 'on')).toBeUndefined();
    await seedOrg(admin, TENANT_B, ORG_B);
    // Assigning under tenant B referencing tenant A's code cannot resolve → unavailable (isolation).
    await expect(
      service.assignPrimary({
        tenantId: TENANT_B,
        idempotencyKey: 'assign:b',
        organizationId: ORG_B,
        jurisdictionCode: 'on',
        inheritanceMode: 'direct',
        sourceReference: 'ref',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_UNAVAILABLE });
  });

  it('resolves a DIRECT assignment through the persisted resolver', async () => {
    await seedPublished(TENANT_A, 'on');
    await seedOrg(admin, TENANT_A, ORG_1);
    await service.assignPrimary({
      tenantId: TENANT_A,
      idempotencyKey: 'assign:1',
      organizationId: ORG_1,
      jurisdictionCode: 'on',
      inheritanceMode: 'direct',
      sourceReference: 'ref',
    });
    const club = orgView(TENANT_A, ORG_1);
    const resolver = new GovernedJurisdictionResolver(store, reader([club]));

    const result = await resolver.jurisdictionFor(TENANT_A, club, NOW, 'en');
    expect(result).toMatchObject({ outcome: 'resolved', jurisdiction: { code: 'on' } });
  });

  it('INHERITS a parent inheritable assignment through the persisted resolver', async () => {
    await seedPublished(TENANT_A, 'on');
    await seedOrg(admin, TENANT_A, ORG_PROV);
    await seedOrg(admin, TENANT_A, ORG_CLUB, ORG_PROV);
    await service.assignPrimary({
      tenantId: TENANT_A,
      idempotencyKey: 'assign:prov',
      organizationId: ORG_PROV,
      jurisdictionCode: 'on',
      inheritanceMode: 'inheritable',
      sourceReference: 'ref',
    });
    const prov = orgView(TENANT_A, ORG_PROV);
    const club = orgView(TENANT_A, ORG_CLUB, ORG_PROV);
    const resolver = new GovernedJurisdictionResolver(store, reader([prov, club]));

    const result = await resolver.jurisdictionFor(TENANT_A, club, NOW, 'en');
    expect(result).toMatchObject({ outcome: 'resolved', jurisdiction: { code: 'on' } });
  });

  it('replace supersedes the prior assignment, preserving it as history', async () => {
    await seedPublished(TENANT_A, 'on');
    await seedPublished(TENANT_A, 'qc');
    await seedOrg(admin, TENANT_A, ORG_1);
    const first = await service.assignPrimary({
      tenantId: TENANT_A,
      idempotencyKey: 'assign:1',
      organizationId: ORG_1,
      jurisdictionCode: 'on',
      inheritanceMode: 'direct',
      sourceReference: 'ref',
    });
    const replaced = await service.replacePrimary({
      tenantId: TENANT_A,
      idempotencyKey: 'replace:1',
      organizationId: ORG_1,
      jurisdictionCode: 'qc',
      inheritanceMode: 'direct',
      sourceReference: 'ref-2',
    });

    // The superseded row physically remains (append-only history), now revoked.
    const { rows } = await admin.query<{ status: string }>(
      `SELECT status FROM organization_registry.organization_jurisdiction WHERE id = $1`,
      [first.id],
    );
    expect(rows[0]?.status).toBe('revoked');

    const club = orgView(TENANT_A, ORG_1);
    const resolver = new GovernedJurisdictionResolver(store, reader([club]));
    const result = await resolver.jurisdictionFor(TENANT_A, club, NOW, 'en');
    expect(result).toMatchObject({ outcome: 'resolved', jurisdiction: { code: 'qc' } });
    expect(replaced.id).not.toBe(first.id);
  });

  it('rejects replace with a stale expectedVersion (optimistic conflict)', async () => {
    await seedPublished(TENANT_A, 'on');
    await seedPublished(TENANT_A, 'qc');
    await seedOrg(admin, TENANT_A, ORG_1);
    await service.assignPrimary({
      tenantId: TENANT_A,
      idempotencyKey: 'assign:1',
      organizationId: ORG_1,
      jurisdictionCode: 'on',
      inheritanceMode: 'direct',
      sourceReference: 'ref',
    });
    await expect(
      service.replacePrimary({
        tenantId: TENANT_A,
        idempotencyKey: 'replace:stale',
        organizationId: ORG_1,
        jurisdictionCode: 'qc',
        inheritanceMode: 'direct',
        sourceReference: 'ref-2',
        expectedVersion: 99,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.JURISDICTION_CONFLICT });
  });

  it('revoke leaves no active assignment and the resolver returns unresolved', async () => {
    await seedPublished(TENANT_A, 'on');
    await seedOrg(admin, TENANT_A, ORG_1);
    await service.assignPrimary({
      tenantId: TENANT_A,
      idempotencyKey: 'assign:1',
      organizationId: ORG_1,
      jurisdictionCode: 'on',
      inheritanceMode: 'direct',
      sourceReference: 'ref',
    });
    await service.revoke({ tenantId: TENANT_A, idempotencyKey: 'revoke:1', organizationId: ORG_1 });

    expect(await service.activeAssignments(TENANT_A, ORG_1)).toHaveLength(0);
    const club = orgView(TENANT_A, ORG_1);
    const resolver = new GovernedJurisdictionResolver(store, reader([club]));
    expect(await resolver.jurisdictionFor(TENANT_A, club, NOW, 'en')).toEqual({
      outcome: 'unresolved',
    });
  });
});
