import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { createPgGovernanceKernel } from '../../../src/http/composition.js';
import { FinancialObligationService } from '../../../src/domains/affiliation-finance/index.js';
import { PgFinancialObligationStore } from '../../../src/domains/affiliation-finance/index.js';
import { ErrorCode } from '../../../src/shared/errors/AppError.js';
import {
  closePool,
  queryRaw,
  withTenantTransaction,
  type QueryClient,
} from '../../../src/db/pool.js';
import type { GovernanceKernel } from '../../../src/governance/kernel/GovernanceKernel.js';
import type { TransitionInput } from '../../../src/governance/types/TransitionTypes.js';
import type { FinancialObligationTransitionRequest } from '../../../src/domains/affiliation-finance/index.js';

/**
 * Integration tests for the AffiliationFinancialObligation governed slice against a real
 * PostgreSQL database (with the affiliation-finance schema + RLS from migration 0013). GATED:
 * runs only when RUN_DB_TESTS=1 and DATABASE_URL are set; otherwise skipped so `npm test` stays
 * hermetic. The runtime connection (DATABASE_URL) MUST be a non-superuser, non-BYPASSRLS role for
 * the RLS assertions to hold. Migrations (DDL) are applied via MIGRATE_DATABASE_URL. All synthetic.
 */
const RUN = process.env.RUN_DB_TESTS === '1' && (process.env.DATABASE_URL ?? '') !== '';
const d = RUN ? describe : describe.skip;

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, '..', '..', '..', 'db', 'migrations');

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const AFFIL_ENTITY_TYPE = 'AffiliationApplication';
const FIN_ENTITY_TYPE = 'AffiliationFinancialObligation';
const SEASON = '2025-26';

const ROLE = {
  assessor: 'financial_assessor',
  reviser: 'financial_assessment_reviser',
  provider: 'financial_provider',
  accounting: 'financial_accounting',
  reconciler: 'financial_reconciler',
  waiver: 'financial_waiver_authority',
} as const;

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

function makeService(kernel: GovernanceKernel): FinancialObligationService {
  return new FinancialObligationService(kernel, new PgFinancialObligationStore());
}

function finActor(roleKeys: readonly string[], userId: string = randomUUID()) {
  return { userId, roleKeys };
}

function assessReq(
  obligationId: string,
  applicationId: string,
  o: { tenantId?: string; amount?: string; blocking?: boolean; roleKeys?: readonly string[] } = {},
): FinancialObligationTransitionRequest {
  return {
    tenantId: o.tenantId ?? TENANT_A,
    obligationId,
    actor: finActor(o.roleKeys ?? [ROLE.assessor]),
    idempotencyKey: randomUUID(),
    details: {
      affiliationApplicationId: applicationId,
      subjectId: randomUUID(),
      season: SEASON,
      obligationType: 'affiliation_fee',
      assessmentBasis: 'standard_fee_schedule',
      amount: o.amount ?? '100.00',
      currency: 'CAD',
      ...(o.blocking !== undefined ? { blocking: o.blocking } : {}),
    },
  };
}

async function count(tenantId: string, sql: string, params: readonly unknown[]): Promise<number> {
  const rows = await withTenantTransaction(tenantId, (c: QueryClient) =>
    c.query<{ n: number }>(sql, params),
  );
  return rows[0]!.n;
}

/** Seed an affiliation DOMAIN application + supporting rows for the activation guards. */
async function seedApplication(entityId: string, tenantId = TENANT_A): Promise<void> {
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    await c.query(
      `INSERT INTO affiliation.affiliation_application
         (id, tenant_id, season_id, required_fields_complete, documents_verified, payment_status)
       VALUES ($1,$2,$3,true,true,'paid')`,
      [entityId, tenantId, SEASON],
    );
    await c.query(
      `INSERT INTO affiliation.application_document
         (tenant_id, application_id, document_type, required, status)
       VALUES ($1,$2,'affiliation_form',true,'approved')`,
      [tenantId, entityId],
    );
    await c.query(
      `INSERT INTO affiliation.season (tenant_id, season_id, is_current)
       VALUES ($1,$2,true)
       ON CONFLICT (tenant_id, season_id) DO UPDATE SET is_current = true`,
      [tenantId, SEASON],
    );
  });
}

/** Position a governed entity directly at a given state (fixture for hard-to-reach states). */
async function seedEntityStateAt(
  entityType: string,
  entityId: string,
  state: string,
  tenantId = TENANT_A,
): Promise<void> {
  await withTenantTransaction(tenantId, async (c: QueryClient) => {
    const sm = await c.query<{ id: string }>(
      `SELECT id FROM governance.state_machine
        WHERE entity_type = $1 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [entityType],
    );
    await c.query(
      `INSERT INTO governance.entity_state
         (tenant_id, entity_type, entity_id, current_state, state_machine_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, entityType, entityId, state, sm[0]!.id],
    );
  });
}

function affiliationActivate(applicationId: string): TransitionInput {
  return {
    entityType: AFFIL_ENTITY_TYPE,
    entityId: applicationId,
    trigger: 'activate',
    idempotencyKey: randomUUID(),
    actor: {
      actorId: 'member-1',
      tenantId: TENANT_A,
      scopeType: 'national_organization',
      roles: [],
    },
    context: { tenantId: TENANT_A, scopeType: 'national_organization' },
  };
}

d('AffiliationFinancialObligation governed slice (integration)', () => {
  beforeAll(async () => {
    await applyMigrations();
  });

  afterAll(async () => {
    await closePool();
  });

  it('runtime connection is a non-superuser, non-BYPASSRLS role (RLS is enforced)', async () => {
    const rows = await queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]!.rolsuper).toBe(false);
    expect(rows[0]!.rolbypassrls).toBe(false);
  });

  it('assessment persists the obligation head + v1 assessment atomically with governance rows', async () => {
    const svc = makeService(createPgGovernanceKernel());
    const obligationId = randomUUID();
    const applicationId = randomUUID();
    const res = await svc.assessObligation(assessReq(obligationId, applicationId));
    expect(res.status).toBe('executed');

    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_finance.financial_obligation
          WHERE id = $1 AND assessed_amount = '100.00' AND assessment_version = 1`,
        [obligationId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_finance.obligation_assessment
          WHERE obligation_id = $1 AND version = 1`,
        [obligationId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND entity_type = $2 AND current_state = 'assessed'`,
        [obligationId, FIN_ENTITY_TYPE],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message WHERE payload->>'entityId' = $1`,
        [obligationId],
      ),
    ).toBe(1);
  });

  it('full happy path assess -> acknowledge -> confirm -> reconcile records a matched outcome + evidence', async () => {
    const svc = makeService(createPgGovernanceKernel());
    const obligationId = randomUUID();
    const applicationId = randomUUID();
    await svc.assessObligation(assessReq(obligationId, applicationId, { amount: '100.00' }));
    await svc.acknowledgeObligation({
      tenantId: TENANT_A,
      obligationId,
      actor: finActor([ROLE.provider]),
      idempotencyKey: randomUUID(),
      details: { externalReference: 'PROV-1' },
    });
    await svc.confirmObligation({
      tenantId: TENANT_A,
      obligationId,
      actor: finActor([ROLE.accounting]),
      idempotencyKey: randomUUID(),
      reason: 'accounting confirmation',
      details: { externalReference: 'ACC-1', amount: '100.00', currency: 'CAD' },
    });
    const recon = await svc.reconcileObligation({
      tenantId: TENANT_A,
      obligationId,
      actor: finActor([ROLE.reconciler]),
      idempotencyKey: randomUUID(),
      reason: 'reconcile matched',
    });
    expect(recon.status).toBe('executed');
    if (recon.status === 'executed') expect(recon.toState).toBe('reconciled');

    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_finance.obligation_reconciliation
          WHERE obligation_id = $1 AND outcome = 'matched' AND discrepancy_amount = '0'`,
        [obligationId],
      ),
    ).toBe(1);
    // A high-risk reconcile produces evidence metadata.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.evidence_object
          WHERE entity_id = $1 AND entity_type = $2`,
        [obligationId, FIN_ENTITY_TYPE],
      ),
    ).toBeGreaterThanOrEqual(1);
  });

  it('cross-tenant reads are hidden by RLS and a cross-tenant transition fails closed', async () => {
    const svc = makeService(createPgGovernanceKernel());
    const obligationId = randomUUID();
    const applicationId = randomUUID();
    await svc.assessObligation(assessReq(obligationId, applicationId)); // tenant A

    // Tenant B cannot see the obligation head at all (RLS).
    expect(
      await count(
        TENANT_B,
        `SELECT count(*)::int AS n FROM affiliation_finance.financial_obligation WHERE id = $1`,
        [obligationId],
      ),
    ).toBe(0);

    // A cross-tenant mutation attempt fails closed (no such governed entity for tenant B).
    let caught: unknown;
    try {
      await svc.confirmObligation({
        tenantId: TENANT_B,
        obligationId,
        actor: finActor([ROLE.accounting]),
        idempotencyKey: randomUUID(),
        reason: 'cross tenant',
        details: { externalReference: 'X', amount: '100.00', currency: 'CAD' },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    // Tenant A's history is untouched by the failed cross-tenant attempt.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_finance.obligation_external_event
          WHERE obligation_id = $1`,
        [obligationId],
      ),
    ).toBe(0);
  });

  it('a domain-effect failure rolls back the ENTIRE governed transaction (no partial rows)', async () => {
    const svc = makeService(createPgGovernanceKernel());
    // Position an obligation entity at `assessed` WITHOUT a financial_obligation head row, so the
    // revise effect UPDATE finds no head and throws INSIDE the governed transaction.
    const obligationId = randomUUID();
    await seedEntityStateAt(FIN_ENTITY_TYPE, obligationId, 'assessed');

    const before = await count(
      TENANT_A,
      `SELECT count(*)::int AS n FROM governance.state_transition WHERE entity_id = $1`,
      [obligationId],
    );

    await expect(
      svc.reviseObligationAssessment({
        tenantId: TENANT_A,
        obligationId,
        actor: finActor([ROLE.reviser]),
        idempotencyKey: randomUUID(),
        reason: 'correction',
        details: { amount: '150.00', currency: 'CAD', assessmentBasis: 'corrected' },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FINANCIAL_OBLIGATION_NOT_FOUND });

    // Nothing was written: no new journal row, no assessment, no outbox; state unchanged.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.state_transition WHERE entity_id = $1`,
        [obligationId],
      ),
    ).toBe(before);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_finance.obligation_assessment WHERE obligation_id = $1`,
        [obligationId],
      ),
    ).toBe(0);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.outbox_message WHERE payload->>'entityId' = $1`,
        [obligationId],
      ),
    ).toBe(0);
  });

  it('concurrent reconciliations are serialized: exactly one succeeds, the other fails closed', async () => {
    const svc = makeService(createPgGovernanceKernel());
    const obligationId = randomUUID();
    const applicationId = randomUUID();
    await svc.assessObligation(assessReq(obligationId, applicationId, { amount: '100.00' }));
    await svc.acknowledgeObligation({
      tenantId: TENANT_A,
      obligationId,
      actor: finActor([ROLE.provider]),
      idempotencyKey: randomUUID(),
      details: { externalReference: 'PROV-1' },
    });
    await svc.confirmObligation({
      tenantId: TENANT_A,
      obligationId,
      actor: finActor([ROLE.accounting]),
      idempotencyKey: randomUUID(),
      reason: 'confirm',
      details: { externalReference: 'ACC-1', amount: '100.00', currency: 'CAD' },
    });

    const reconcile = () =>
      svc.reconcileObligation({
        tenantId: TENANT_A,
        obligationId,
        actor: finActor([ROLE.reconciler]),
        idempotencyKey: randomUUID(),
        reason: 'race',
      });
    const results = await Promise.allSettled([reconcile(), reconcile()]);
    const executed = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 'executed',
    );
    expect(executed).toHaveLength(1);

    // Exactly one reconciliation row and a single terminal reconciled state.
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM affiliation_finance.obligation_reconciliation
          WHERE obligation_id = $1`,
        [obligationId],
      ),
    ).toBe(1);
    expect(
      await count(
        TENANT_A,
        `SELECT count(*)::int AS n FROM governance.entity_state
          WHERE entity_id = $1 AND current_state = 'reconciled'`,
        [obligationId],
      ),
    ).toBe(1);
  });

  it('affiliation activation is blocked while a blocking obligation is uncleared, and succeeds once waived', async () => {
    const kernel = createPgGovernanceKernel();
    const svc = makeService(kernel);
    const applicationId = randomUUID();
    const obligationId = randomUUID();
    await seedApplication(applicationId);
    await seedEntityStateAt(AFFIL_ENTITY_TYPE, applicationId, 'approved');
    await svc.assessObligation(assessReq(obligationId, applicationId, { blocking: true }));

    // Blocking obligation in `assessed` is not cleared -> activation rejected by the guard.
    const blocked = await kernel.transition(affiliationActivate(applicationId));
    expect(blocked.status).toBe('rejected');

    // Authorized waiver clears the obligation.
    const waive = await svc.waiveObligation({
      tenantId: TENANT_A,
      obligationId,
      actor: finActor([ROLE.waiver]),
      idempotencyKey: randomUUID(),
      reason: 'board-approved waiver',
    });
    expect(waive.status).toBe('executed');

    const activated = await kernel.transition(affiliationActivate(applicationId));
    expect(activated.status).toBe('executed');
    if (activated.status === 'executed') expect(activated.toState).toBe('active');
  });
});
