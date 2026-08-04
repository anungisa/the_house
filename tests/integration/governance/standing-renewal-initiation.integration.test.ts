import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import {
  AffiliationDraftService,
  PgAffiliationDraftStore,
  PgRequirementCatalogStore,
  PgAffiliationLifecycleReader,
  InMemoryEvidenceReferenceValidator,
  type RequirementResolutionContext,
} from '../../../src/domains/affiliation-requirements/index.js';
import { closePool, withTenantTransaction } from '../../../src/db/pool.js';

/**
 * Integration proofs for STARTING a standing renewal against a real PostgreSQL database (migration
 * 0024 + RLS). GATED: runs only when RUN_DB_TESTS=1 and DATABASE_URL are set. The runtime
 * connection MUST be a non-superuser, non-BYPASSRLS role so RLS holds; DDL is applied via
 * MIGRATE_DATABASE_URL. All data is synthetic and per-run unique (dirty-DB immune).
 *
 * Proves the durable, governed attribution of a renewal WITHOUT a second workflow and WITHOUT any
 * standing-state mutation: the renewal_application_link + audit_event + outbox_message are written
 * atomically with the (existing-machinery) renewal application; the captured source version/season
 * are the SERVER-observed facts; an idempotent replay resumes the application and never duplicates
 * the link/audit/outbox; RLS makes another tenant's link invisible; the standing head is UNCHANGED;
 * and a same-season "renewal" is physically rejected by the distinct-season CHECK.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const SOURCE_SEASON = '2025-26';
const TARGET_SEASON = '2026-27';

function renewalContext(): RequirementResolutionContext {
  return { orgType: 'local', jurisdiction: 'member', pathway: 'renewal', season: TARGET_SEASON };
}

async function applyMigrations(): Promise<void> {
  const adminUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString: adminUrl });
  const client = await pool.connect();
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
    const runtimeUser = new URL(process.env.DATABASE_URL ?? '').username;
    if (runtimeUser !== '' && runtimeUser !== 'house_app') {
      const role = `"${runtimeUser.replace(/"/gu, '""')}"`;
      await client.query(`GRANT SELECT ON affiliation.requirement_definition TO ${role}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE ON affiliation.application_draft TO ${role}`);
      await client.query(`GRANT SELECT, INSERT ON affiliation.application_requirement TO ${role}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE ON affiliation.draft_response TO ${role}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON affiliation.draft_evidence_link TO ${role}`);
      await client.query(`GRANT SELECT, INSERT ON affiliation.draft_change_event TO ${role}`);
      await client.query(`GRANT SELECT ON affiliation_standing.affiliation_standing TO ${role}`);
      await client.query(`GRANT SELECT, INSERT ON affiliation_standing.renewal_application_link TO ${role}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function buildService(): AffiliationDraftService {
  return new AffiliationDraftService({
    store: new PgAffiliationDraftStore(),
    catalog: new PgRequirementCatalogStore(),
    lifecycle: new PgAffiliationLifecycleReader(),
    evidenceValidator: new InMemoryEvidenceReferenceValidator(),
  });
}

async function seedSeason(tenantId: string, seasonId: string): Promise<void> {
  await withTenantTransaction(tenantId, (client) =>
    client.query(
      `INSERT INTO affiliation.season (tenant_id, season_id, status, is_current)
       VALUES ($1, $2, 'published', true)
       ON CONFLICT (tenant_id, season_id) DO NOTHING`,
      [tenantId, seasonId],
    ),
  );
}

/** Seed a standing head directly (the renewal attribution FK-references it). Returns its id. */
async function seedStanding(
  tenantId: string,
  opts: { season?: string; version?: number } = {},
): Promise<string> {
  const standingId = randomUUID();
  await withTenantTransaction(tenantId, (client) =>
    client.query(
      `INSERT INTO affiliation_standing.affiliation_standing
         (id, tenant_id, affiliation_application_id, subject_id, season, standing_version,
          effective_from, effective_until, pathway, established_by)
       VALUES ($1, $2, $3, $4, $5, $6,
               '2025-09-01T00:00:00.000Z', '2026-08-31T00:00:00.000Z', 'new_affiliation', $7)`,
      [
        standingId,
        tenantId,
        randomUUID(),
        randomUUID(),
        opts.season ?? SOURCE_SEASON,
        opts.version ?? 5,
        randomUUID(),
      ],
    ),
  );
  return standingId;
}

interface LinkRow {
  readonly renewal_application_id: string;
  readonly standing_id: string;
  readonly source_standing_version: number;
  readonly source_season_id: string;
  readonly target_season_id: string;
  readonly [column: string]: unknown;
}

async function readLinks(tenantId: string, standingId: string): Promise<readonly LinkRow[]> {
  return withTenantTransaction(tenantId, (client) =>
    client.query<LinkRow>(
      `SELECT renewal_application_id, standing_id, source_standing_version,
              source_season_id, target_season_id
         FROM affiliation_standing.renewal_application_link
        WHERE tenant_id = $1 AND standing_id = $2`,
      [tenantId, standingId],
    ),
  );
}

d('standing renewal initiation (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });
  afterAll(async () => {
    await closePool();
  });

  it('attributes a renewal + writes audit + outbox atomically; captures server-observed source facts', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const actor = randomUUID();
    const idempotencyKey = randomUUID();
    const service = buildService();

    await seedSeason(tenantId, TARGET_SEASON);
    const standingId = await seedStanding(tenantId, { version: 5 });

    const { application, created } = await service.initiateDetailed({
      tenantId,
      organizationId,
      seasonId: TARGET_SEASON,
      actor,
      context: renewalContext(),
      renewal: {
        standingId,
        sourceStandingVersion: 5,
        sourceSeasonId: SOURCE_SEASON,
        targetSeasonId: TARGET_SEASON,
        idempotencyKey,
        correlationId: 'corr-1',
        causationId: idempotencyKey,
      },
    });

    expect(created).toBe(true);

    const links = await readLinks(tenantId, standingId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      renewal_application_id: application.applicationId,
      source_standing_version: 5,
      source_season_id: SOURCE_SEASON,
      target_season_id: TARGET_SEASON,
    });

    // The application head is an ordinary 'renewal'-type application in the SAME machinery.
    const appRows = await withTenantTransaction(tenantId, (client) =>
      client.query<{ application_type: string; season_id: string }>(
        `SELECT application_type, season_id FROM affiliation.affiliation_application WHERE id = $1`,
        [application.applicationId],
      ),
    );
    expect(appRows[0]).toMatchObject({ application_type: 'renewal', season_id: TARGET_SEASON });

    // Audit event + outbox message written in the same transaction.
    const audit = await withTenantTransaction(tenantId, (client) =>
      client.query<{ action: string; entity_id: string }>(
        `SELECT action, entity_id FROM governance.audit_event
          WHERE tenant_id = $1 AND entity_id = $2 AND action = 'renewal_application_initiated'`,
        [tenantId, standingId],
      ),
    );
    expect(audit).toHaveLength(1);

    const outbox = await withTenantTransaction(tenantId, (client) =>
      client.query<{ status: string; message_type: string; dedupe_key: string }>(
        `SELECT status, message_type, dedupe_key FROM governance.outbox_message
          WHERE tenant_id = $1 AND message_type = 'standing.renewal_application.initiated'`,
        [tenantId],
      ),
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ status: 'pending' });
    expect(outbox[0]!.dedupe_key).toContain(standingId);

    // The standing head is UNCHANGED: no version bump, no state mutation (kernel-only).
    const standing = await withTenantTransaction(tenantId, (client) =>
      client.query<{ standing_version: number }>(
        `SELECT standing_version FROM affiliation_standing.affiliation_standing WHERE id = $1`,
        [standingId],
      ),
    );
    expect(standing[0]!.standing_version).toBe(5);
  });

  it('an idempotent replay resumes the application and never duplicates link/audit/outbox', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const actor = randomUUID();
    const idempotencyKey = randomUUID();
    const service = buildService();

    await seedSeason(tenantId, TARGET_SEASON);
    const standingId = await seedStanding(tenantId, { version: 3 });

    const input = {
      tenantId,
      organizationId,
      seasonId: TARGET_SEASON,
      actor,
      context: renewalContext(),
      renewal: {
        standingId,
        sourceStandingVersion: 3,
        sourceSeasonId: SOURCE_SEASON,
        targetSeasonId: TARGET_SEASON,
        idempotencyKey,
      },
    };

    const first = await service.initiateDetailed(input);
    const second = await service.initiateDetailed(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.application.applicationId).toBe(first.application.applicationId);

    expect(await readLinks(tenantId, standingId)).toHaveLength(1);
    const audit = await withTenantTransaction(tenantId, (client) =>
      client.query(
        `SELECT 1 FROM governance.audit_event
          WHERE tenant_id = $1 AND entity_id = $2 AND action = 'renewal_application_initiated'`,
        [tenantId, standingId],
      ),
    );
    expect(audit).toHaveLength(1);
    const outbox = await withTenantTransaction(tenantId, (client) =>
      client.query(
        `SELECT 1 FROM governance.outbox_message
          WHERE tenant_id = $1 AND message_type = 'standing.renewal_application.initiated'`,
        [tenantId],
      ),
    );
    expect(outbox).toHaveLength(1);
  });

  it('another tenant cannot see the renewal link (RLS isolation)', async () => {
    const tenantId = randomUUID();
    const otherTenant = randomUUID();
    const service = buildService();

    await seedSeason(tenantId, TARGET_SEASON);
    const standingId = await seedStanding(tenantId, { version: 2 });
    await service.initiateDetailed({
      tenantId,
      organizationId: randomUUID(),
      seasonId: TARGET_SEASON,
      actor: randomUUID(),
      context: renewalContext(),
      renewal: {
        standingId,
        sourceStandingVersion: 2,
        sourceSeasonId: SOURCE_SEASON,
        targetSeasonId: TARGET_SEASON,
        idempotencyKey: randomUUID(),
      },
    });

    expect(await readLinks(tenantId, standingId)).toHaveLength(1);
    // Under the OTHER tenant's context, RLS hides the row entirely.
    expect(await readLinks(otherTenant, standingId)).toHaveLength(0);
  });

  it('physically rejects a same-season "renewal" via the distinct-season CHECK', async () => {
    const tenantId = randomUUID();
    const service = buildService();

    await seedSeason(tenantId, TARGET_SEASON);
    // Standing's source season equals the target season we attempt to renew into.
    const standingId = await seedStanding(tenantId, { season: TARGET_SEASON, version: 1 });

    await expect(
      service.initiateDetailed({
        tenantId,
        organizationId: randomUUID(),
        seasonId: TARGET_SEASON,
        actor: randomUUID(),
        context: renewalContext(),
        renewal: {
          standingId,
          sourceStandingVersion: 1,
          sourceSeasonId: TARGET_SEASON,
          targetSeasonId: TARGET_SEASON,
          idempotencyKey: randomUUID(),
        },
      }),
    ).rejects.toThrow();

    // Nothing was attributed (the whole transaction rolled back).
    expect(await readLinks(tenantId, standingId)).toHaveLength(0);
  });
});
