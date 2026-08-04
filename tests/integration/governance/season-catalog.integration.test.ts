import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { PgSeasonCatalogStore } from '../../../src/domains/season-catalog/PgSeasonCatalogStore.js';
import { SeasonCatalogService } from '../../../src/domains/season-catalog/SeasonCatalogService.js';
import {
  SEASON_CREATED_MESSAGE_TYPE,
  SEASON_MADE_CURRENT_MESSAGE_TYPE,
  seasonDedupeKey,
} from '../../../src/domains/season-catalog/SeasonCatalogStore.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';

/**
 * Gated PostgreSQL integration tests for the GOVERNED SEASON CATALOG (migration 0022 +
 * PgSeasonCatalogStore + SeasonCatalogService).
 *
 * These prove, against REAL PostgreSQL, that a season is a PERSISTED, tenant-isolated,
 * operationally governed fact — never clock-derived. Every governed command mutates the season
 * head, appends the append-only `affiliation.season_event`, writes a `governance.audit_event`, and
 * enqueues a transactional outbox message ATOMICALLY, under FORCE Row-Level Security, executed by a
 * NON-superuser, NON-BYPASSRLS runtime role. We pin the single-current invariant (physical + under
 * concurrency), the persisted application window (accepting-applications is DERIVED), cross-tenant
 * isolation, application → season PHYSICAL referential integrity (including the migration's loud
 * preflight), per-command idempotency, optimistic version conflict, and that historical
 * applications remain readable after a season is retired.
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

const TENANT_A = '40000000-0000-4000-8000-00000000a5e1';
const TENANT_B = '40000000-0000-4000-8000-00000000b6f2';

const APP_ROLE = 'house_app_season_test';
const APP_PW = 'season_app_pw';

const PROVISION_LOCK_KEY = 918274;

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
  // Least privilege: season head (S/I/U), append-only season event (S/I),
  // affiliation application (S/I — historical read + FK physical integrity), governance audit
  // (S/I), shared outbox (S/I/U). No DELETE / TRUNCATE anywhere.
  await admin.query(`GRANT USAGE ON SCHEMA affiliation TO ${APP_ROLE}`);
  await admin.query(`GRANT USAGE ON SCHEMA governance TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON affiliation.season TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT ON affiliation.season_event TO ${APP_ROLE}`);
  await admin.query(
    `GRANT SELECT, INSERT ON affiliation.affiliation_application TO ${APP_ROLE}`,
  );
  await admin.query(`GRANT SELECT, INSERT ON governance.audit_event TO ${APP_ROLE}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE ON governance.outbox_message TO ${APP_ROLE}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO ${APP_ROLE}`);
}

async function adminGetSeason(
  admin: pg.Pool,
  tenantId: string,
  seasonId: string,
): Promise<Record<string, unknown> | undefined> {
  const { rows } = await admin.query(
    `SELECT * FROM affiliation.season WHERE tenant_id = $1 AND season_id = $2`,
    [tenantId, seasonId],
  );
  return rows[0];
}

async function adminCountEvents(admin: pg.Pool, seasonRowId: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM affiliation.season_event WHERE season_row_id = $1`,
    [seasonRowId],
  );
  return rows[0]!.n;
}

async function adminCountAudit(admin: pg.Pool, seasonRowId: string): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM governance.audit_event
       WHERE entity_type = 'Season' AND entity_id = $1`,
    [seasonRowId],
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

async function adminCountCurrent(
  admin: pg.Pool,
  tenantId: string,
): Promise<number> {
  const { rows } = await admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM affiliation.season
       WHERE tenant_id = $1 AND is_current`,
    [tenantId],
  );
  return rows[0]!.n;
}

const PAST_ISO = '2000-01-01T00:00:00.000Z';
const FUTURE_ISO = '2999-01-01T00:00:00.000Z';

d('governed season catalog — PostgreSQL RLS integration', () => {
  let admin: pg.Pool;
  let appPool: pg.Pool;
  let service: SeasonCatalogService;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: ADMIN_URL });
    await withProvisionLock(admin, async () => {
      await applyMigrations(admin);
      await provisionRole(admin);
    });
    const appUrl = deriveUrl(ADMIN_URL, APP_ROLE, APP_PW);
    appPool = new pg.Pool({ connectionString: appUrl });
    service = new SeasonCatalogService(new PgSeasonCatalogStore(appPool));
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appPool?.end()]);
  });

  beforeEach(async () => {
    for (const tenant of [TENANT_A, TENANT_B]) {
      await admin.query(`DELETE FROM affiliation.affiliation_application WHERE tenant_id = $1`, [
        tenant,
      ]);
      await admin.query(`DELETE FROM affiliation.season_event WHERE tenant_id = $1`, [tenant]);
      await admin.query(`DELETE FROM affiliation.season WHERE tenant_id = $1`, [tenant]);
      await admin.query(
        `DELETE FROM governance.audit_event WHERE tenant_id = $1 AND entity_type = 'Season'`,
        [tenant],
      );
      await admin.query(`DELETE FROM governance.outbox_message WHERE tenant_id = $1`, [tenant]);
    }
  });

  /** Drive a season to published + current + open window; returns the season head record. */
  async function seedCurrentOpen(
    tenantId: string,
    seasonId: string,
    prefix = 's',
  ): Promise<void> {
    await service.createDraft({
      tenantId,
      seasonId,
      labelEn: `${seasonId} EN`,
      labelFr: `${seasonId} FR`,
      seasonStartDate: '2025-09-01',
      seasonEndDate: '2026-08-31',
      idempotencyKey: `${prefix}-create-${seasonId}`,
    });
    await service.publish({ tenantId, seasonId, idempotencyKey: `${prefix}-publish-${seasonId}` });
    await service.makeCurrent({
      tenantId,
      seasonId,
      idempotencyKey: `${prefix}-current-${seasonId}`,
    });
    await service.openWindow({
      tenantId,
      seasonId,
      applicationOpensAt: PAST_ISO,
      applicationClosesAt: FUTURE_ISO,
      idempotencyKey: `${prefix}-open-${seasonId}`,
    });
  }

  it('applies migration 0022', async () => {
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.schema_migrations WHERE filename = $1`,
      ['0022_governed_season_catalog.sql'],
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

  it('createDraft writes head + event + audit + outbox atomically', async () => {
    const record = await service.createDraft({
      tenantId: TENANT_A,
      seasonId: '2025-26',
      labelEn: '2025-26 EN',
      labelFr: '2025-26 FR',
      seasonStartDate: '2025-09-01',
      seasonEndDate: '2026-08-31',
      idempotencyKey: 'atomic-create',
    });
    expect(record.status).toBe('draft');

    const head = await adminGetSeason(admin, TENANT_A, '2025-26');
    expect(head?.['status']).toBe('draft');
    expect(head?.['is_current']).toBe(false);
    expect(await adminCountEvents(admin, record.id)).toBe(1);
    expect(await adminCountAudit(admin, record.id)).toBe(1);
    expect(
      await adminCountOutbox(admin, seasonDedupeKey(SEASON_CREATED_MESSAGE_TYPE, 'atomic-create')),
    ).toBe(1);
  });

  it('publish is refused until the draft has bilingual labels AND a date span', async () => {
    await service.createDraft({
      tenantId: TENANT_A,
      seasonId: 'incomplete',
      labelEn: 'EN only',
      labelFr: 'FR only',
      idempotencyKey: 'inc-create',
    });
    await expect(
      service.publish({ tenantId: TENANT_A, seasonId: 'incomplete', idempotencyKey: 'inc-pub' }),
    ).rejects.toMatchObject({ code: ErrorCode.SEASON_CONFLICT });
    const head = await adminGetSeason(admin, TENANT_A, 'incomplete');
    expect(head?.['status']).toBe('draft');
  });

  it('enforces the single-current invariant PHYSICALLY (partial unique index)', async () => {
    await seedCurrentOpen(TENANT_A, 'cur-1');
    // A second published season, then a raw admin attempt to force it current alongside cur-1.
    await service.createDraft({
      tenantId: TENANT_A,
      seasonId: 'cur-2',
      labelEn: 'c2 EN',
      labelFr: 'c2 FR',
      seasonStartDate: '2026-09-01',
      seasonEndDate: '2027-08-31',
      idempotencyKey: 'c2-create',
    });
    await service.publish({ tenantId: TENANT_A, seasonId: 'cur-2', idempotencyKey: 'c2-pub' });
    await expect(
      admin.query(
        `UPDATE affiliation.season SET is_current = true WHERE tenant_id = $1 AND season_id = $2`,
        [TENANT_A, 'cur-2'],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('makeCurrent demotes the prior current so exactly one season is current', async () => {
    await seedCurrentOpen(TENANT_A, 'first');
    await service.createDraft({
      tenantId: TENANT_A,
      seasonId: 'second',
      labelEn: '2 EN',
      labelFr: '2 FR',
      seasonStartDate: '2026-09-01',
      seasonEndDate: '2027-08-31',
      idempotencyKey: 'second-create',
    });
    await service.publish({ tenantId: TENANT_A, seasonId: 'second', idempotencyKey: 'second-pub' });
    await service.makeCurrent({
      tenantId: TENANT_A,
      seasonId: 'second',
      idempotencyKey: 'second-current',
    });

    expect(await adminCountCurrent(admin, TENANT_A)).toBe(1);
    expect((await adminGetSeason(admin, TENANT_A, 'first'))?.['is_current']).toBe(false);
    expect((await adminGetSeason(admin, TENANT_A, 'second'))?.['is_current']).toBe(true);
  });

  it('serializes concurrent current-switches to a single converged current', async () => {
    await seedCurrentOpen(TENANT_A, 'race-a');
    await service.createDraft({
      tenantId: TENANT_A,
      seasonId: 'race-b',
      labelEn: 'b EN',
      labelFr: 'b FR',
      seasonStartDate: '2026-09-01',
      seasonEndDate: '2027-08-31',
      idempotencyKey: 'rb-create',
    });
    await service.publish({ tenantId: TENANT_A, seasonId: 'race-b', idempotencyKey: 'rb-pub' });

    await Promise.all([
      service.makeCurrent({ tenantId: TENANT_A, seasonId: 'race-a', idempotencyKey: 'rc-a' }),
      service.makeCurrent({ tenantId: TENANT_A, seasonId: 'race-b', idempotencyKey: 'rc-b' }),
    ]);
    expect(await adminCountCurrent(admin, TENANT_A)).toBe(1);
  });

  it('derives acceptingApplications from the persisted window (open then closed)', async () => {
    await seedCurrentOpen(TENANT_A, 'win');
    const open = await service.resolveSeason(TENANT_A, 'win');
    expect(open.outcome).toBe('ok');
    if (open.outcome === 'ok') {
      expect(open.season.acceptingApplications).toBe(true);
      expect(open.season.current).toBe(true);
    }

    await service.closeWindow({
      tenantId: TENANT_A,
      seasonId: 'win',
      // Later than opens-at (2000) but still in the past relative to now -> window is closed.
      applicationClosesAt: '2001-01-01T00:00:00.000Z',
      idempotencyKey: 'win-close',
    });
    const closed = await service.resolveSeason(TENANT_A, 'win');
    expect(closed.outcome).toBe('ok');
    if (closed.outcome === 'ok') {
      expect(closed.season.acceptingApplications).toBe(false);
    }
  });

  it('cross-tenant isolation: a tenant-A season never resolves for tenant B', async () => {
    await seedCurrentOpen(TENANT_A, 'iso');
    expect(await service.getSeason(TENANT_A, 'iso')).toBeDefined();
    expect(await service.getSeason(TENANT_B, 'iso')).toBeUndefined();
    expect((await service.resolveSeason(TENANT_B, 'iso')).outcome).toBe('unavailable');
    expect(await service.seasons(TENANT_B)).toHaveLength(0);
  });

  it('enforces application -> season PHYSICAL integrity, including cross-tenant', async () => {
    await seedCurrentOpen(TENANT_A, 'fk-season');
    // An application in tenant A referencing the same-tenant season is accepted.
    await expect(
      admin.query(
        `INSERT INTO affiliation.affiliation_application (id, tenant_id, season_id)
         VALUES ($1, $2, $3)`,
        [randomUUID(), TENANT_A, 'fk-season'],
      ),
    ).resolves.toBeDefined();
    // The SAME season key under tenant B has no catalog row -> the composite FK rejects it.
    await expect(
      admin.query(
        `INSERT INTO affiliation.affiliation_application (id, tenant_id, season_id)
         VALUES ($1, $2, $3)`,
        [randomUUID(), TENANT_B, 'fk-season'],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it("migration 0022's orphan preflight fails LOUDLY on a dangling application reference", async () => {
    // Simulate the pre-migration world: drop the FK, introduce an orphan, run the preflight.
    await admin.query('BEGIN');
    try {
      await admin.query(
        `ALTER TABLE affiliation.affiliation_application
           DROP CONSTRAINT affiliation_application_season_fk`,
      );
      await admin.query(
        `INSERT INTO affiliation.affiliation_application (id, tenant_id, season_id)
         VALUES ($1, $2, $3)`,
        [randomUUID(), TENANT_A, 'ghost-season'],
      );
      await expect(
        admin.query(`
          DO $$
          DECLARE orphan_count integer;
          BEGIN
            SELECT count(*) INTO orphan_count
            FROM affiliation.affiliation_application a
            LEFT JOIN affiliation.season s
              ON s.tenant_id = a.tenant_id AND s.season_id = a.season_id
            WHERE s.id IS NULL;
            IF orphan_count > 0 THEN
              RAISE EXCEPTION 'orphan applications: %', orphan_count
                USING ERRCODE = 'foreign_key_violation';
            END IF;
          END $$;
        `),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      // Roll back the whole simulation: the orphan disappears and the FK is restored.
      await admin.query('ROLLBACK');
    }
    // The FK is intact again after rollback.
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'affiliation_application_season_fk'`,
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('is idempotent per command: replaying makeCurrent writes no duplicate lineage', async () => {
    await seedCurrentOpen(TENANT_A, 'idem');
    await service.createDraft({
      tenantId: TENANT_A,
      seasonId: 'idem-2',
      labelEn: 'i2 EN',
      labelFr: 'i2 FR',
      seasonStartDate: '2026-09-01',
      seasonEndDate: '2027-08-31',
      idempotencyKey: 'idem2-create',
    });
    await service.publish({ tenantId: TENANT_A, seasonId: 'idem-2', idempotencyKey: 'idem2-pub' });

    const first = await service.makeCurrent({
      tenantId: TENANT_A,
      seasonId: 'idem-2',
      idempotencyKey: 'idem2-current',
    });
    const second = await service.makeCurrent({
      tenantId: TENANT_A,
      seasonId: 'idem-2',
      idempotencyKey: 'idem2-current',
    });
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(first.version);
    expect(
      await adminCountOutbox(
        admin,
        seasonDedupeKey(SEASON_MADE_CURRENT_MESSAGE_TYPE, 'idem2-current'),
      ),
    ).toBe(1);
    expect(await adminCountCurrent(admin, TENANT_A)).toBe(1);
  });

  it('rejects a stale optimistic version with SEASON_CONFLICT', async () => {
    await service.createDraft({
      tenantId: TENANT_A,
      seasonId: 'ver',
      labelEn: 'v EN',
      labelFr: 'v FR',
      seasonStartDate: '2025-09-01',
      seasonEndDate: '2026-08-31',
      idempotencyKey: 'ver-create',
    });
    await expect(
      service.reviseDraft({
        tenantId: TENANT_A,
        seasonId: 'ver',
        labelEn: 'changed',
        expectedVersion: 99,
        idempotencyKey: 'ver-revise',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.SEASON_CONFLICT });
  });

  it('keeps historical applications readable after the season is retired', async () => {
    await seedCurrentOpen(TENANT_A, 'hist');
    const appId = randomUUID();
    await admin.query(
      `INSERT INTO affiliation.affiliation_application (id, tenant_id, season_id)
       VALUES ($1, $2, $3)`,
      [appId, TENANT_A, 'hist'],
    );
    await service.retire({ tenantId: TENANT_A, seasonId: 'hist', idempotencyKey: 'hist-retire' });

    // Season is retired and no longer current / selectable ...
    const head = await adminGetSeason(admin, TENANT_A, 'hist');
    expect(head?.['status']).toBe('retired');
    expect(head?.['is_current']).toBe(false);
    expect((await service.resolveSeason(TENANT_A, 'hist')).outcome).toBe('unavailable');
    // ... but the historical application row still references it (no cascade / orphaning).
    const { rows } = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM affiliation.affiliation_application WHERE id = $1`,
      [appId],
    );
    expect(rows[0]!.n).toBe(1);
  });
});
