import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

import { StandingReviewService } from '../../../src/domains/affiliation-standing/index.js';
import {
  closePool,
  withTenantTransaction,
  type QueryClient,
} from '../../../src/db/pool.js';

/**
 * Integration tests for the Button STANDING read model ({@link StandingReviewService}) against a
 * real PostgreSQL database (schema + RLS from migrations 0003 + 0014). GATED: runs only when
 * RUN_DB_TESTS=1 and DATABASE_URL are set; otherwise skipped so `npm test` stays hermetic. The
 * runtime connection MUST be a non-superuser, non-BYPASSRLS role for the RLS/tenant-isolation
 * assertions to hold. This is a PURE READ path: fixtures seed an affiliation application, a
 * standing head + v1 period, and a governed entity_state directly (no kernel), then the read
 * service is asserted for scope + tenant isolation. All synthetic.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ORG_A = '33333333-3333-4333-8333-333333333333';
const ORG_OTHER = '44444444-4444-4444-8444-444444444444';
const ENTITY_TYPE = 'AffiliationStanding';
const SEASON = '2025-26';
const DAY_MS = 24 * 60 * 60 * 1000;
const isoFromNow = (ms: number): string => new Date(Date.now() + ms).toISOString();

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
  } finally {
    client.release();
    await pool.end();
  }
}

/** Seed a minimal affiliation application (org-scoped) for the given tenant. */
async function seedApplication(
  applicationId: string,
  organizationId: string,
  tenantId: string,
): Promise<void> {
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    await c.query(
      `INSERT INTO affiliation.affiliation_application
         (id, tenant_id, season_id, organization_id)
       VALUES ($1,$2,$3,$4)`,
      [applicationId, tenantId, SEASON, organizationId],
    );
  });
}

/** Seed a standing head + v1 period + governed entity_state at `state`, linked to an application. */
async function seedStanding(
  standingId: string,
  applicationId: string,
  state: string,
  o: { tenantId?: string; from?: string; until?: string } = {},
): Promise<void> {
  const tenantId = o.tenantId ?? TENANT_A;
  const from = o.from ?? isoFromNow(-30 * DAY_MS);
  const until = o.until ?? isoFromNow(335 * DAY_MS);
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    const establishedBy = randomUUID();
    await c.query(
      `INSERT INTO affiliation_standing.affiliation_standing
         (id, tenant_id, affiliation_application_id, subject_id, season, standing_version,
          effective_from, effective_until, pathway, established_by)
       VALUES ($1,$2,$3,$4,$5,1,$6,$7,'new_affiliation',$8)`,
      [standingId, tenantId, applicationId, randomUUID(), SEASON, from, until, establishedBy],
    );
    await c.query(
      `INSERT INTO affiliation_standing.standing_period
         (tenant_id, standing_id, version, effective_from, effective_until, pathway, recorded_by)
       VALUES ($1,$2,1,$3,$4,'new_affiliation',$5)`,
      [tenantId, standingId, from, until, establishedBy],
    );
    const sm = await c.query<{ id: string }>(
      `SELECT id FROM governance.state_machine
        WHERE entity_type = $1 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [ENTITY_TYPE],
    );
    await c.query(
      `INSERT INTO governance.entity_state
         (tenant_id, entity_type, entity_id, current_state, state_machine_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, ENTITY_TYPE, standingId, state, sm[0]!.id],
    );
  });
}

d('Button StandingReviewService (integration)', () => {
  const service = new StandingReviewService();

  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it('lists a standing scoped to the organization with its governed lifecycle state', async () => {
    const applicationId = randomUUID();
    const standingId = randomUUID();
    await seedApplication(applicationId, ORG_A, TENANT_A);
    await seedStanding(standingId, applicationId, 'active');

    const items = await service.listForOrganizations(TENANT_A, [ORG_A]);
    const found = items.find((s) => s.standingId === standingId);
    expect(found).toBeDefined();
    expect(found?.lifecycleState).toBe('active');
    expect(found?.organizationId).toBe(ORG_A);
    expect(found?.affiliationApplicationId).toBe(applicationId);
    expect(found?.season).toBe(SEASON);
  });

  it('returns an empty list when no organization ids are supplied (fail closed)', async () => {
    expect(await service.listForOrganizations(TENANT_A, [])).toEqual([]);
  });

  it('excludes standings whose organization is outside the requested scope', async () => {
    const applicationId = randomUUID();
    const standingId = randomUUID();
    await seedApplication(applicationId, ORG_OTHER, TENANT_A);
    await seedStanding(standingId, applicationId, 'active');

    const items = await service.listForOrganizations(TENANT_A, [ORG_A]);
    expect(items.some((s) => s.standingId === standingId)).toBe(false);
  });

  it('fetches a single standing constrained to the organization scope, else undefined', async () => {
    const applicationId = randomUUID();
    const standingId = randomUUID();
    await seedApplication(applicationId, ORG_A, TENANT_A);
    await seedStanding(standingId, applicationId, 'lapsed');

    const inScope = await service.getStanding(TENANT_A, standingId, [ORG_A]);
    expect(inScope?.standingId).toBe(standingId);
    expect(inScope?.lifecycleState).toBe('lapsed');

    const outOfScope = await service.getStanding(TENANT_A, standingId, [ORG_OTHER]);
    expect(outOfScope).toBeUndefined();
  });

  it('never discloses another tenant standing (RLS + tenant isolation)', async () => {
    const applicationId = randomUUID();
    const standingId = randomUUID();
    await seedApplication(applicationId, ORG_A, TENANT_A);
    await seedStanding(standingId, applicationId, 'active');

    // A different tenant querying the SAME organization id sees nothing.
    const items = await service.listForOrganizations(TENANT_B, [ORG_A]);
    expect(items.some((s) => s.standingId === standingId)).toBe(false);
    expect(await service.getStanding(TENANT_B, standingId, [ORG_A])).toBeUndefined();
  });
});
