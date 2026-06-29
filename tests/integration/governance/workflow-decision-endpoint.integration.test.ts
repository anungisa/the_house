import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { GovernanceKernel } from '../../../src/governance/kernel/GovernanceKernel.js';
import { GuardRegistry } from '../../../src/governance/guards/GuardRegistry.js';
import { registerAffiliationGuards } from '../../../src/governance/guards/handlers.js';
import { PgGovernanceStore } from '../../../src/governance/store/PgGovernanceStore.js';
import { PgAffiliationApplicationStore } from '../../../src/domains/affiliation/PgAffiliationApplicationStore.js';
import { DomainBackedAffiliationGuardRepository } from '../../../src/domains/affiliation/DomainBackedAffiliationGuardRepository.js';
import { AffiliationWorkflowPlanner } from '../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import { PgWorkflowStore } from '../../../src/governance/workflow/PgWorkflowStore.js';
import { WorkflowDecisionService } from '../../../src/governance/workflow/WorkflowDecisionService.js';
import { handleWorkflowDecision } from '../../../src/http/workflow/WorkflowHttpAdapter.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import {
  closePool,
  withTenantTransaction,
  type QueryClient,
} from '../../../src/db/pool.js';
import type { TransitionInput } from '../../../src/governance/types/TransitionTypes.js';

/**
 * Gated integration tests for the workflow decision HTTP ENDPOINT against a real PostgreSQL
 * database. GATED on RUN_DB_TESTS=1 + DATABASE_URL (default `npm test` stays hermetic). The
 * runtime role must be a non-superuser, non-BYPASSRLS role so RLS holds. Migrations run via
 * MIGRATE_DATABASE_URL when provided.
 *
 * Proves: recording regional then national approval THROUGH the HTTP adapter advances the
 * workflow to `approved` while governance entity_state stays `under_review` (the pending
 * lifecycle transition is NOT auto-executed).
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const ENTITY_TYPE = 'AffiliationApplication';
const SEASON = '2025-26';
const TRUSTED = new TrustedHeadersAuthContextResolver();

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

function makeKernel(): GovernanceKernel {
  const registry = new GuardRegistry();
  registerAffiliationGuards(
    registry,
    new DomainBackedAffiliationGuardRepository(new PgAffiliationApplicationStore()),
  );
  return new GovernanceKernel({
    store: new PgGovernanceStore(),
    guards: registry,
    workflowPlanner: new AffiliationWorkflowPlanner(),
  });
}

function input(
  o: Pick<TransitionInput, 'entityId' | 'trigger' | 'idempotencyKey'> & Partial<TransitionInput>,
): TransitionInput {
  return {
    entityType: ENTITY_TYPE,
    actor: o.actor ?? {
      actorId: 'reviewer-1',
      tenantId: TENANT_A,
      scopeType: 'national_organization',
      roles: ['reviewer'],
    },
    context: o.context ?? { tenantId: TENANT_A, scopeType: 'national_organization' },
    ...o,
  };
}

async function seedApplication(entityId: string): Promise<void> {
  await withTenantTransaction(TENANT_A, async (c: QueryClient) => {
    await c.query(
      `INSERT INTO affiliation.affiliation_application
         (id, tenant_id, season_id, required_fields_complete, documents_verified, payment_status)
       VALUES ($1,$2,$3,true,true,'paid')`,
      [entityId, TENANT_A, SEASON],
    );
    await c.query(
      `INSERT INTO affiliation.application_document
         (tenant_id, application_id, document_type, required, status)
       VALUES ($1,$2,'affiliation_form',true,'approved')`,
      [TENANT_A, entityId],
    );
    await c.query(
      `INSERT INTO affiliation.season (tenant_id, season_id, is_current)
       VALUES ($1,$2,true)
       ON CONFLICT (tenant_id, season_id) DO UPDATE SET is_current = true`,
      [TENANT_A, SEASON],
    );
  });
}

async function driveToApprove(kernel: GovernanceKernel, entityId: string) {
  await seedApplication(entityId);
  await kernel.transition(input({ entityId, trigger: 'submit', idempotencyKey: randomUUID() }));
  await kernel.transition(
    input({ entityId, trigger: 'review_start', idempotencyKey: randomUUID() }),
  );
  return kernel.transition(input({ entityId, trigger: 'approve', idempotencyKey: randomUUID() }));
}

async function scalar<T>(tenantId: string, sql: string, params: readonly unknown[]): Promise<T> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ v: T }>(sql, params),
  );
  return rows[0]!.v;
}

function headers(userId: string): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': userId,
    'x-house-actor-role-keys': 'reviewer',
  };
}

d('Workflow decision HTTP endpoint (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it('records regional then national approval through the endpoint; workflow becomes approved and entity_state is unchanged', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, entityId);
    expect(result.status).toBe('approval_required');

    const deps = { decisionService: new WorkflowDecisionService(new PgWorkflowStore()) };
    const regionalReviewer = randomUUID();
    const nationalReviewer = randomUUID();

    // Regional approval advances to the national step.
    const regional = await handleWorkflowDecision(
      deps,
      {
        workflowInstanceId: result.workflowInstanceId!,
        stepCode: 'regional_signoff',
        headers: headers(regionalReviewer),
        body: { decision: 'approve' },
      },
      'req-regional',
      TRUSTED,
    );
    expect(regional.status).toBe(200);
    expect(regional.body['workflowStatus']).toBe('pending');
    expect(regional.body['currentStepCode']).toBe('national_signoff');

    // National approval marks the whole workflow approved.
    const national = await handleWorkflowDecision(
      deps,
      {
        workflowInstanceId: result.workflowInstanceId!,
        stepCode: 'national_signoff',
        headers: headers(nationalReviewer),
        body: { decision: 'approve' },
      },
      'req-national',
      TRUSTED,
    );
    expect(national.status).toBe(200);
    expect(national.body['workflowStatus']).toBe('approved');
    expect(national.body['currentStepCode']).toBeNull();

    // The pending lifecycle transition was NOT auto-executed: entity_state stays under_review.
    const state = await scalar<string>(
      TENANT_A,
      `SELECT current_state AS v FROM governance.entity_state WHERE entity_id = $1`,
      [entityId],
    );
    expect(state).toBe('under_review');

    // Two append-only decision rows were recorded.
    const decisionCount = await scalar<number>(
      TENANT_A,
      `SELECT count(*)::int AS v FROM governance.workflow_decision wd
         JOIN governance.workflow_step ws ON ws.id = wd.workflow_step_id
        WHERE ws.workflow_instance_id = $1`,
      [result.workflowInstanceId],
    );
    expect(decisionCount).toBe(2);
  });

  it('maps an unknown workflow instance to 404 through the endpoint', async () => {
    const deps = { decisionService: new WorkflowDecisionService(new PgWorkflowStore()) };
    const res = await handleWorkflowDecision(
      deps,
      {
        workflowInstanceId: randomUUID(),
        stepCode: 'regional_signoff',
        headers: headers(randomUUID()),
        body: { decision: 'approve' },
      },
      'req-missing',
      TRUSTED,
    );
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('WORKFLOW_NOT_FOUND');
  });
});
