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
import { closePool } from '../../../src/db/pool.js';

/**
 * Integration tests for the affiliation DRAFT experience (Slice C) against a real PostgreSQL
 * database (schema affiliation, migration 0016 + RLS). GATED: runs only when RUN_DB_TESTS=1 and
 * DATABASE_URL are set; otherwise skipped so `npm test` stays hermetic. The runtime connection
 * (DATABASE_URL) MUST be a non-superuser, non-BYPASSRLS role so RLS holds. DDL is applied via
 * MIGRATE_DATABASE_URL. All data synthetic; unique per-run tenants keep it dirty-DB immune.
 *
 * Proves: applicable requirement versions are BOUND and reload; responses persist under optimistic
 * concurrency; a stale save conflicts; concurrent conflicting saves resolve to exactly one winner;
 * evidence associations persist and can be removed (draft-only); and RLS hides another tenant's
 * application (opaque not-found) — association never advances governed lifecycle state.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const SEASON = '2025-26';
const CONTEXT: RequirementResolutionContext = {
  orgType: 'local',
  jurisdiction: 'member',
  pathway: 'new_affiliation',
  season: SEASON,
};

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
    // Migration 0016 grants only to `house_app`; ensure the DATABASE_URL-as-runtime role can reach
    // the new draft tables (GRANT ... ON ALL TABLES at provisioning time predates 0016). Idempotent.
    const runtimeUser = new URL(process.env.DATABASE_URL ?? '').username;
    if (runtimeUser !== '') {
      const role = `"${runtimeUser.replace(/"/gu, '""')}"`;
      await client.query(`GRANT SELECT ON affiliation.requirement_definition TO ${role}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE ON affiliation.application_draft TO ${role}`,
      );
      await client.query(
        `GRANT SELECT, INSERT ON affiliation.application_requirement TO ${role}`,
      );
      await client.query(`GRANT SELECT, INSERT, UPDATE ON affiliation.draft_response TO ${role}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON affiliation.draft_evidence_link TO ${role}`,
      );
      await client.query(`GRANT SELECT, INSERT ON affiliation.draft_change_event TO ${role}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

function buildService(evidence?: InMemoryEvidenceReferenceValidator): AffiliationDraftService {
  return new AffiliationDraftService({
    store: new PgAffiliationDraftStore(),
    catalog: new PgRequirementCatalogStore(),
    lifecycle: new PgAffiliationLifecycleReader(),
    evidenceValidator: evidence ?? new InMemoryEvidenceReferenceValidator(),
  });
}

d('affiliation draft experience (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });
  afterAll(async () => {
    await closePool();
  });

  it('binds applicable requirement versions and reloads them (idempotent initiation)', async () => {
    const tenantId = randomUUID();
    const organizationId = randomUUID();
    const actor = randomUUID();
    const service = buildService();

    const first = await service.initiate({ tenantId, organizationId, seasonId: SEASON, actor, context: CONTEXT });
    expect(first.lifecycleStatus).toBe('draft');
    const codes = first.requirements.map((r) => r.code).sort();
    expect(codes).toEqual([
      'GOVERNING_DOCUMENT',
      'INSURANCE_CONFIRMATION',
      'ORG_PROFILE_CONFIRMATION',
      'PRIMARY_CONTACT_DETAILS',
    ]);
    for (const r of first.requirements) expect(r.version).toBe(1);

    const second = await service.initiate({ tenantId, organizationId, seasonId: SEASON, actor, context: CONTEXT });
    expect(second.applicationId).toBe(first.applicationId);

    const reloaded = await service.getProjection(tenantId, first.applicationId);
    expect(reloaded.requirements.length).toBe(4);
  });

  it('persists responses under optimistic concurrency and rejects a stale save', async () => {
    const tenantId = randomUUID();
    const service = buildService();
    const initiated = await service.initiate({
      tenantId,
      organizationId: randomUUID(),
      seasonId: SEASON,
      actor: randomUUID(),
      context: CONTEXT,
    });
    const applicationId = initiated.applicationId;

    const saved = await service.saveDraft({
      tenantId,
      applicationId,
      expectedVersion: 1,
      actor: randomUUID(),
      responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Dana' } }],
    });
    expect(saved.concurrencyToken).toBe('2');
    const contact = saved.requirements.find((r) => r.code === 'PRIMARY_CONTACT_DETAILS');
    expect(contact?.response).toEqual({ name: 'Dana' });

    await expect(
      service.saveDraft({
        tenantId,
        applicationId,
        expectedVersion: 1,
        actor: randomUUID(),
        responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Stale' } }],
      }),
    ).rejects.toMatchObject({ code: 'AFFILIATION_DRAFT_VERSION_CONFLICT' });
  });

  it('resolves concurrent conflicting saves to exactly one winner', async () => {
    const tenantId = randomUUID();
    const service = buildService();
    const initiated = await service.initiate({
      tenantId,
      organizationId: randomUUID(),
      seasonId: SEASON,
      actor: randomUUID(),
      context: CONTEXT,
    });
    const applicationId = initiated.applicationId;

    const results = await Promise.allSettled([
      service.saveDraft({
        tenantId,
        applicationId,
        expectedVersion: 1,
        actor: randomUUID(),
        responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'One' } }],
      }),
      service.saveDraft({
        tenantId,
        applicationId,
        expectedVersion: 1,
        actor: randomUUID(),
        responses: [{ requirementCode: 'PRIMARY_CONTACT_DETAILS', value: { name: 'Two' } }],
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);

    const reloaded = await service.getProjection(tenantId, applicationId);
    expect(reloaded.concurrencyToken).toBe('2');
  });

  it('associates and removes governed evidence without advancing lifecycle state', async () => {
    const tenantId = randomUUID();
    const evidence = new InMemoryEvidenceReferenceValidator();
    evidence.register({ tenantId, evidenceObjectId: 'ev-1', contentHash: 'h1' });
    const service = buildService(evidence);
    const initiated = await service.initiate({
      tenantId,
      organizationId: randomUUID(),
      seasonId: SEASON,
      actor: randomUUID(),
      context: CONTEXT,
    });
    const applicationId = initiated.applicationId;

    const { projection, link } = await service.associateEvidence({
      tenantId,
      applicationId,
      requirementCode: 'GOVERNING_DOCUMENT',
      evidenceObjectId: 'ev-1',
      contentHash: 'h1',
      contentType: 'application/pdf',
      displayName: 'Bylaws.pdf',
      actor: randomUUID(),
    });
    expect(projection.lifecycleStatus).toBe('draft');
    const governing = projection.requirements.find((r) => r.code === 'GOVERNING_DOCUMENT');
    expect(governing?.evidence.length).toBe(1);

    const afterRemove = await service.removeEvidence({
      tenantId,
      applicationId,
      linkId: link.linkId,
      actor: randomUUID(),
    });
    const governingAfter = afterRemove.requirements.find((r) => r.code === 'GOVERNING_DOCUMENT');
    expect(governingAfter?.evidence.length).toBe(0);
    expect(afterRemove.lifecycleStatus).toBe('draft');
  });

  it('hides another tenant\u2019s application behind RLS (opaque not-found)', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const service = buildService();
    const initiated = await service.initiate({
      tenantId: tenantA,
      organizationId: randomUUID(),
      seasonId: SEASON,
      actor: randomUUID(),
      context: CONTEXT,
    });
    await expect(service.getProjection(tenantB, initiated.applicationId)).rejects.toMatchObject({
      code: 'AFFILIATION_APPLICATION_NOT_FOUND',
    });
  });
});
