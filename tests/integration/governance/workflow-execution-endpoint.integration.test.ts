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
import { ApprovedWorkflowExecutionService } from '../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import { handleWorkflowExecution } from '../../../src/http/workflow/WorkflowExecutionHttpAdapter.js';
import { TrustedHeadersAuthContextResolver } from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import {
  closePool,
  withTenantTransaction,
  type QueryClient,
} from '../../../src/db/pool.js';
import type { TransitionInput } from '../../../src/governance/types/TransitionTypes.js';

/**
 * Gated integration tests for the workflow EXECUTION HTTP ENDPOINT against a real PostgreSQL
 * database. GATED on RUN_DB_TESTS=1 + DATABASE_URL (default `npm test` stays hermetic). The
 * runtime role must be a non-superuser, non-BYPASSRLS role so RLS holds. Migrations run via
 * MIGRATE_DATABASE_URL when provided.
 *
 * Proves: once a review workflow is fully APPROVED, an EXPLICIT execute call drives the
 * original pending lifecycle transition through the kernel exactly once — advancing
 * entity_state, marking the transition_request `executed`, and writing the journal/audit/outbox
 * — and that a repeated execute with the same idempotency key is a safe replay (no double
 * mutation).
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

/** Record both tier sign-offs through the decision service so the workflow becomes approved. */
async function approveWorkflow(workflowInstanceId: string): Promise<void> {
  const decisions = new WorkflowDecisionService(new PgWorkflowStore());
  await decisions.recordDecision({
    tenantId: TENANT_A,
    workflowInstanceId,
    stepCode: 'regional_signoff',
    decision: 'approve',
    actorUserId: randomUUID(),
  });
  await decisions.recordDecision({
    tenantId: TENANT_A,
    workflowInstanceId,
    stepCode: 'national_signoff',
    decision: 'approve',
    actorUserId: randomUUID(),
  });
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

function executionDeps() {
  return { executor: new ApprovedWorkflowExecutionService(makeKernel(), new PgWorkflowStore()) };
}

d('Workflow execution HTTP endpoint (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it('executes the approved transition exactly once; repeated execution is a safe replay', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, entityId);
    expect(result.status).toBe('approval_required');
    await approveWorkflow(result.workflowInstanceId!);

    const idempotencyKey = randomUUID();
    const deps = executionDeps();

    // Execute the approved transition.
    const first = await handleWorkflowExecution(
      deps,
      {
        workflowInstanceId: result.workflowInstanceId!,
        headers: { ...headers(randomUUID()), 'idempotency-key': idempotencyKey },
        body: {},
      },
      'req-exec-1',
      TRUSTED,
    );
    expect(first.status).toBe(200);
    expect(first.body['status']).toBe('executed');
    expect(first.body['toState']).toBe('approved');
    expect(first.body['idempotentReplay']).toBe(false);

    // entity_state advanced to approved.
    const state = await scalar<string>(
      TENANT_A,
      `SELECT current_state AS v FROM governance.entity_state WHERE entity_id = $1`,
      [entityId],
    );
    expect(state).toBe('approved');

    // transition_request marked executed.
    const requestStatus = await scalar<string>(
      TENANT_A,
      `SELECT status AS v FROM governance.transition_request WHERE id = $1`,
      [result.transitionRequestId],
    );
    expect(requestStatus).toBe('executed');

    // Exactly one approve state_transition + one approve outbox message.
    const approveTransitions = await scalar<number>(
      TENANT_A,
      `SELECT count(*)::int AS v FROM governance.state_transition
        WHERE entity_id = $1 AND trigger = 'approve'`,
      [entityId],
    );
    expect(approveTransitions).toBe(1);

    const approveOutbox = await scalar<number>(
      TENANT_A,
      `SELECT count(*)::int AS v FROM governance.outbox_message
        WHERE message_type = 'AffiliationApplication.approve'
          AND dedupe_key = $1`,
      [`AffiliationApplication:${entityId}:${idempotencyKey}`],
    );
    expect(approveOutbox).toBe(1);

    // Repeated execution with the SAME key is a safe idempotent replay (no double mutation).
    const replay = await handleWorkflowExecution(
      deps,
      {
        workflowInstanceId: result.workflowInstanceId!,
        headers: { ...headers(randomUUID()), 'idempotency-key': idempotencyKey },
        body: {},
      },
      'req-exec-2',
      TRUSTED,
    );
    expect(replay.status).toBe(200);
    expect(replay.body['idempotentReplay']).toBe(true);

    const approveTransitionsAfter = await scalar<number>(
      TENANT_A,
      `SELECT count(*)::int AS v FROM governance.state_transition
        WHERE entity_id = $1 AND trigger = 'approve'`,
      [entityId],
    );
    expect(approveTransitionsAfter).toBe(1);
  });

  it('refuses to execute a not-yet-approved workflow (409) without mutating state', async () => {
    const kernel = makeKernel();
    const entityId = randomUUID();
    const result = await driveToApprove(kernel, entityId);
    expect(result.status).toBe('approval_required');

    // No decisions recorded: workflow is still pending.
    const res = await handleWorkflowExecution(
      executionDeps(),
      {
        workflowInstanceId: result.workflowInstanceId!,
        headers: { ...headers(randomUUID()), 'idempotency-key': randomUUID() },
        body: {},
      },
      'req-exec-pending',
      TRUSTED,
    );
    expect(res.status).toBe(409);
    expect(res.body['code']).toBe('WORKFLOW_NOT_APPROVED');

    const state = await scalar<string>(
      TENANT_A,
      `SELECT current_state AS v FROM governance.entity_state WHERE entity_id = $1`,
      [entityId],
    );
    expect(state).toBe('under_review');
  });

  it('maps an unknown workflow instance to 404 through the endpoint', async () => {
    const res = await handleWorkflowExecution(
      executionDeps(),
      {
        workflowInstanceId: randomUUID(),
        headers: { ...headers(randomUUID()), 'idempotency-key': randomUUID() },
        body: {},
      },
      'req-exec-missing',
      TRUSTED,
    );
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('WORKFLOW_NOT_FOUND');
  });

  it('fails closed (401) when no tenant identity is supplied', async () => {
    const res = await handleWorkflowExecution(
      executionDeps(),
      {
        workflowInstanceId: randomUUID(),
        headers: { 'x-house-actor-user-id': randomUUID(), 'idempotency-key': randomUUID() },
        body: {},
      },
      'req-exec-noauth',
      TRUSTED,
    );
    expect(res.status).toBe(401);
  });
});
