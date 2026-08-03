/**
 * E2E real-server prerequisite seeder: a BLOCKING affiliation financial obligation, driven to the
 * `confirmed` state through the REAL Governance Kernel (assess → acknowledge → confirm).
 *
 * This exists ONLY because there is no Button operating surface for assessing/acknowledging/
 * confirming an obligation — those are upstream finance-operations steps. Reconciliation itself
 * (the governed, user-facing determination) is performed through the Button finance workbench in
 * the E2E, not here. This script holds NO governed authority: every transition is executed by the
 * kernel-backed FinancialObligationService with distinct financial actor roles, so all guards,
 * audit, evidence, and outbox effects are produced exactly as in production.
 *
 * Invoked as a child process by the operational E2E spec with a least-privilege DATABASE_URL. All
 * inputs are synthetic and passed via environment variables.
 */

import { randomUUID } from 'node:crypto';
import { createPgFinancialObligationService } from '../../src/http/composition.js';
import { closePool } from '../../src/db/pool.js';
import type { FinancialObligationTransitionRequest } from '../../src/domains/affiliation-finance/index.js';

function mustEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required to seed the financial obligation.`);
  }
  return value;
}

async function main(): Promise<void> {
  const tenantId = mustEnv('E2E_SEED_TENANT_ID');
  const applicationId = mustEnv('E2E_SEED_APPLICATION_ID');
  const obligationId = mustEnv('E2E_SEED_OBLIGATION_ID');
  const subjectId = mustEnv('E2E_SEED_SUBJECT_ID');
  const season = mustEnv('E2E_SEED_SEASON');
  const amount = process.env.E2E_SEED_AMOUNT ?? '100.00';
  const currency = process.env.E2E_SEED_CURRENCY ?? 'CAD';

  const service = createPgFinancialObligationService();

  const actor = (roleKeys: readonly string[]): { userId: string; roleKeys: readonly string[] } => ({
    userId: randomUUID(),
    roleKeys,
  });

  const assess: FinancialObligationTransitionRequest = {
    tenantId,
    obligationId,
    actor: actor(['financial_assessor']),
    idempotencyKey: `e2e-assess:${obligationId}`,
    details: {
      affiliationApplicationId: applicationId,
      subjectId,
      season,
      obligationType: 'affiliation_fee',
      assessmentBasis: 'standard_fee_schedule',
      amount,
      currency,
      blocking: true,
    },
  };

  const acknowledge: FinancialObligationTransitionRequest = {
    tenantId,
    obligationId,
    actor: actor(['financial_provider']),
    idempotencyKey: `e2e-acknowledge:${obligationId}`,
    details: {
      externalReference: `PROV-${obligationId.slice(0, 8)}`,
    },
  };

  const confirm: FinancialObligationTransitionRequest = {
    tenantId,
    obligationId,
    actor: actor(['financial_accounting']),
    idempotencyKey: `e2e-confirm:${obligationId}`,
    reason: 'Accounting confirmation for governed reconciliation.',
    details: {
      externalReference: `ACC-${obligationId.slice(0, 8)}`,
      amount,
      currency,
    },
  };

  const assessed = await service.assessObligation(assess);
  if (assessed.status !== 'executed') {
    throw new Error(`assess did not execute: ${JSON.stringify(assessed)}`);
  }
  const acknowledged = await service.acknowledgeObligation(acknowledge);
  if (acknowledged.status !== 'executed') {
    throw new Error(`acknowledge did not execute: ${JSON.stringify(acknowledged)}`);
  }
  const confirmed = await service.confirmObligation(confirm);
  if (confirmed.status !== 'executed') {
    throw new Error(`confirm did not execute: ${JSON.stringify(confirmed)}`);
  }

  process.stdout.write(
    `seeded blocking confirmed financial obligation ${obligationId} for application ${applicationId}\n`,
  );
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    process.stderr.write(`seed-financial-obligation failed: ${String(error)}\n`);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
