/**
 * AffiliationFinancialObligation — governed domain proofs (hermetic, in-memory kernel).
 *
 * These proofs exercise the REAL Governance Kernel over in-memory stores/effect. They cover the
 * distinctions the increment must guarantee: assessment ≠ acknowledgement ≠ confirmation ≠
 * reconciliation ≠ clearance; segregated per-trigger authority (fail closed); append-only history;
 * idempotent retries; and the affiliation activation financial gate. Cross-tenant RLS, transaction
 * rollback, and concurrency serialization are proven separately against Postgres in the gated
 * integration suite. All data is synthetic.
 */

import { describe, expect, it } from 'vitest';
import {
  buildFinancialKernelHarness,
  AFFILIATION_ALL_PASS_FACTS,
  FIN_TENANT_A,
  FIN_TENANT_B,
} from '../../../helpers/financialObligationKernel.js';
import type { FinancialActorDto } from '../../../../src/domains/affiliation-finance/index.js';
import type { TransitionInput } from '../../../../src/governance/types/TransitionTypes.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

const ROLE = {
  assessor: 'financial_assessor',
  reviser: 'financial_assessment_reviser',
  provider: 'financial_provider',
  accounting: 'financial_accounting',
  reconciler: 'financial_reconciler',
  waiver: 'financial_waiver_authority',
  exemption: 'financial_exemption_authority',
} as const;

function actor(roleKeys: readonly string[], userId = 'user-1'): FinancialActorDto {
  return { userId, roleKeys };
}

const OBL = 'aaaaaaaa-0000-0000-0000-000000000001';
const OBL2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const APP = 'bbbbbbbb-0000-0000-0000-000000000001';
const SUBJECT = 'cccccccc-0000-0000-0000-000000000001';

/** Acknowledge helper (a confirmation requires a prior provider acknowledgement in the FSM). */
async function acknowledge(
  h: ReturnType<typeof buildFinancialKernelHarness>,
  obligationId = OBL,
  externalReference = 'PROV-REF-1',
  idempotencyKey = 'idem-ack-1',
) {
  return h.service.acknowledgeObligation({
    tenantId: FIN_TENANT_A,
    obligationId,
    actor: actor([ROLE.provider]),
    idempotencyKey,
    details: { externalReference },
  });
}

function assessRequest(
  overrides: {
    tenantId?: string;
    obligationId?: string;
    roleKeys?: readonly string[];
    idempotencyKey?: string;
    amount?: string;
    currency?: string;
    blocking?: boolean;
    applicationId?: string;
  } = {},
) {
  return {
    tenantId: overrides.tenantId ?? FIN_TENANT_A,
    obligationId: overrides.obligationId ?? OBL,
    actor: actor(overrides.roleKeys ?? [ROLE.assessor]),
    idempotencyKey: overrides.idempotencyKey ?? 'idem-assess-1',
    details: {
      affiliationApplicationId: overrides.applicationId ?? APP,
      subjectId: SUBJECT,
      season: '2025-2026',
      obligationType: 'affiliation_fee',
      assessmentBasis: 'standard_fee_schedule',
      amount: overrides.amount ?? '100.00',
      currency: overrides.currency ?? 'CAD',
      ...(overrides.blocking !== undefined ? { blocking: overrides.blocking } : {}),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Proof 1 — assessment creates the obligation with correct facts, one history row, one outbox.
// ---------------------------------------------------------------------------------------------
describe('proof 1: assessment creates a governed obligation', () => {
  it('persists amount/currency/basis/authority + one assessment + one outbox message', async () => {
    const h = buildFinancialKernelHarness();
    const res = await h.service.assessObligation(assessRequest());

    expect(res.status).toBe('executed');
    if (res.status === 'executed') expect(res.toState).toBe('assessed');

    const head = await h.finStore.getObligation(FIN_TENANT_A, OBL);
    expect(head).toBeDefined();
    expect(head?.assessedAmount).toBe('100.00');
    expect(head?.currency).toBe('CAD');
    expect(head?.assessmentBasis).toBe('standard_fee_schedule');
    expect(head?.assessmentVersion).toBe(1);
    expect(head?.assessedBy).toBe('user-1');
    expect(head?.blocking).toBe(true);

    const history = h.finStore.countHistory(FIN_TENANT_A, OBL);
    expect(history.assessments).toBe(1);
    expect(h.govStore.outboxRecords).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 2 — a repeated idempotency key produces no second obligation/history/outbox.
// ---------------------------------------------------------------------------------------------
describe('proof 2: idempotent assessment retry', () => {
  it('replays without a second obligation, history row, or outbox message', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest());
    const replay = await h.service.assessObligation(assessRequest());

    expect(replay.status).toBe('executed');
    if (replay.status === 'executed') expect(replay.replayed).toBe(true);

    const history = h.finStore.countHistory(FIN_TENANT_A, OBL);
    expect(history.assessments).toBe(1);
    expect(h.govStore.outboxRecords).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 3 — a provider acknowledgement is NOT an accounting confirmation/reconciliation/clearance.
// ---------------------------------------------------------------------------------------------
describe('proof 3: provider acknowledgement is not confirmation', () => {
  it('records the callback but leaves confirmation/reconciliation/clearance absent', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest());
    const ack = await h.service.acknowledgeObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.provider]),
      idempotencyKey: 'idem-ack-1',
      details: { externalReference: 'PROV-REF-1' },
    });
    expect(ack.status).toBe('executed');
    if (ack.status === 'executed') expect(ack.toState).toBe('acknowledged');

    expect(await h.finStore.hasAccountingConfirmation(FIN_TENANT_A, OBL)).toBe(false);
    const view = await h.finStore.getReconciliationView(FIN_TENANT_A, OBL);
    expect(view?.hasAccountingConfirmation).toBe(false);
    expect(view?.confirmedAmount).toBeUndefined();
    const history = h.finStore.countHistory(FIN_TENANT_A, OBL);
    expect(history.reconciliations).toBe(0);
    expect(history.clearances).toBe(0);

    // Reconciliation cannot proceed from `acknowledged` — it requires a confirmation first, so
    // the kernel fails closed (no reconciliation is recorded).
    await expect(
      h.service.reconcileObligation({
        tenantId: FIN_TENANT_A,
        obligationId: OBL,
        actor: actor([ROLE.reconciler]),
        idempotencyKey: 'idem-recon-early',
        reason: 'attempt before confirmation',
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(h.finStore.countHistory(FIN_TENANT_A, OBL).reconciliations).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 4 — an accounting confirmation alone is NOT reconciliation/clearance.
// ---------------------------------------------------------------------------------------------
describe('proof 4: accounting confirmation is not reconciliation', () => {
  it('confirms without recording a reconciliation outcome or clearance', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest());
    await h.service.acknowledgeObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.provider]),
      idempotencyKey: 'idem-ack-1',
      details: { externalReference: 'PROV-REF-1' },
    });
    const confirm = await h.service.confirmObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.accounting]),
      idempotencyKey: 'idem-confirm-1',
      reason: 'accounting system confirmation',
      details: { externalReference: 'ACC-REF-1', amount: '100.00', currency: 'CAD' },
    });
    expect(confirm.status).toBe('executed');
    if (confirm.status === 'executed') expect(confirm.toState).toBe('confirmed');

    expect(await h.finStore.hasAccountingConfirmation(FIN_TENANT_A, OBL)).toBe(true);
    const history = h.finStore.countHistory(FIN_TENANT_A, OBL);
    expect(history.reconciliations).toBe(0);
    expect(history.clearances).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 5 — matching expected + confirmed reconciles via the authorized command.
// ---------------------------------------------------------------------------------------------
describe('proof 5: matching amounts reconcile', () => {
  it('drives reconcile and records a matched outcome', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest({ amount: '100.00' }));
    await acknowledge(h);
    await h.service.confirmObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.accounting]),
      idempotencyKey: 'idem-confirm-1',
      reason: 'confirm',
      details: { externalReference: 'ACC-REF-1', amount: '100.00', currency: 'CAD' },
    });
    const recon = await h.service.reconcileObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.reconciler]),
      idempotencyKey: 'idem-recon-1',
      reason: 'reconcile matched',
    });
    expect(recon.status).toBe('executed');
    if (recon.status === 'executed') expect(recon.toState).toBe('reconciled');
    expect(h.finStore.countHistory(FIN_TENANT_A, OBL).reconciliations).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 6 — a mismatch posture blocks affiliation activation.
// ---------------------------------------------------------------------------------------------
describe('proof 6: mismatch blocks activation', () => {
  it('records a mismatch and the activation gate rejects the affiliation', async () => {
    const h = buildFinancialKernelHarness({
      seedApprovedApplications: [{ tenantId: FIN_TENANT_A, applicationId: APP }],
    });
    await h.service.assessObligation(assessRequest({ amount: '100.00' }));
    await acknowledge(h);    await acknowledge(h);    await h.service.confirmObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.accounting]),
      idempotencyKey: 'idem-confirm-1',
      reason: 'confirm',
      details: { externalReference: 'ACC-REF-1', amount: '120.00', currency: 'CAD' },
    });
    const recon = await h.service.reconcileObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.reconciler]),
      idempotencyKey: 'idem-recon-1',
      reason: 'amounts differ',
    });
    expect(recon.status).toBe('executed');
    if (recon.status === 'executed') expect(recon.toState).toBe('mismatch');

    const activate = await h.kernel.transition(activateInput(APP));
    expect(activate.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 7 — an authorized waiver clears the obligation (not a payment, not a reconciliation).
// ---------------------------------------------------------------------------------------------
describe('proof 7: authorized waiver clears', () => {
  it('records a waiver clearance without a reconciliation outcome', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest());
    const waive = await h.service.waiveObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.waiver]),
      idempotencyKey: 'idem-waive-1',
      reason: 'board-approved waiver',
    });
    expect(waive.status).toBe('executed');
    if (waive.status === 'executed') expect(waive.toState).toBe('waived');
    const history = h.finStore.countHistory(FIN_TENANT_A, OBL);
    expect(history.clearances).toBe(1);
    expect(history.reconciliations).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 8 — an authorized exemption clears the obligation (not a payment/waiver/reconciliation).
// ---------------------------------------------------------------------------------------------
describe('proof 8: authorized exemption clears', () => {
  it('records an exemption clearance distinct from waiver/reconciliation', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest());
    const exempt = await h.service.exemptObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.exemption]),
      idempotencyKey: 'idem-exempt-1',
      reason: 'statutory exemption',
    });
    expect(exempt.status).toBe('executed');
    if (exempt.status === 'executed') expect(exempt.toState).toBe('exempt');
    const history = h.finStore.countHistory(FIN_TENANT_A, OBL);
    expect(history.clearances).toBe(1);
    expect(history.reconciliations).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 9 — unauthorized financial actions fail closed (segregated per-trigger authority).
// ---------------------------------------------------------------------------------------------
describe('proof 9: segregated authority fails closed', () => {
  it('rejects assess/confirm/waive performed by the wrong role', async () => {
    const h = buildFinancialKernelHarness();

    // Wrong role for the initial assessment (valid transition, denied authority).
    const wrongAssess = await h.service.assessObligation(
      assessRequest({ roleKeys: [ROLE.provider] }),
    );
    expect(wrongAssess.status).toBe('rejected');

    // Establish a legitimately assessed + acknowledged obligation, then probe `confirm`.
    await h.service.assessObligation(assessRequest());
    expect((await acknowledge(h)).status).toBe('executed');
    const wrongConfirm = await h.service.confirmObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.provider]),
      idempotencyKey: 'idem-confirm-bad',
      reason: 'not accounting',
      details: { externalReference: 'ACC-REF-1', amount: '100.00', currency: 'CAD' },
    });
    expect(wrongConfirm.status).toBe('rejected');

    // A fresh obligation in `assessed` state — waive is a valid transition, denied authority.
    await h.service.assessObligation(
      assessRequest({ obligationId: OBL2, idempotencyKey: 'idem-assess-2' }),
    );
    const wrongWaive = await h.service.waiveObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL2,
      actor: actor([ROLE.assessor]),
      idempotencyKey: 'idem-waive-bad',
      reason: 'not authorized to waive',
    });
    expect(wrongWaive.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 10 — cross-tenant reads/mutations fail without revealing existence or details.
// (Full RLS enforcement is proven against Postgres in the gated integration suite.)
// ---------------------------------------------------------------------------------------------
describe('proof 10: cross-tenant isolation', () => {
  it('hides an obligation from another tenant and rejects cross-tenant mutation', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest()); // tenant A

    expect(await h.finStore.getObligation(FIN_TENANT_B, OBL)).toBeUndefined();
    expect(await h.finStore.getReconciliationView(FIN_TENANT_B, OBL)).toBeUndefined();

    // From tenant B the obligation does not exist, so the governed lookup fails closed without
    // revealing tenant A's real state or amounts.
    let caught: unknown;
    try {
      await h.service.confirmObligation({
        tenantId: FIN_TENANT_B,
        obligationId: OBL,
        actor: actor([ROLE.accounting]),
        idempotencyKey: 'idem-cross-confirm',
        reason: 'cross tenant',
        details: { externalReference: 'X', amount: '100.00', currency: 'CAD' },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).message).not.toContain('100.00');
    expect((caught as AppError).message).not.toContain("state 'assessed'");
    // Tenant A history is untouched by the failed cross-tenant attempt.
    expect(h.finStore.countHistory(FIN_TENANT_A, OBL).externalEvents).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 11 — duplicate provider/accounting callbacks are idempotent under a stable key.
// ---------------------------------------------------------------------------------------------
describe('proof 11: duplicate callbacks are idempotent', () => {
  it('replays a repeated acknowledgement without a second external event', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest());
    const ackReq = {
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.provider]),
      idempotencyKey: 'idem-ack-stable',
      details: { externalReference: 'PROV-REF-1' },
    };
    const first = await h.service.acknowledgeObligation(ackReq);
    const second = await h.service.acknowledgeObligation(ackReq);
    expect(first.status).toBe('executed');
    expect(second.status).toBe('executed');
    if (second.status === 'executed') expect(second.replayed).toBe(true);
    expect(h.finStore.countHistory(FIN_TENANT_A, OBL).externalEvents).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 12 — contradictory confirmations append history; they do NOT silently overwrite.
// ---------------------------------------------------------------------------------------------
describe('proof 12: contradictory confirmations do not overwrite history', () => {
  it('appends a second confirmation and exposes the latest without dropping the first', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest({ amount: '100.00' }));
    await h.service.acknowledgeObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.provider]),
      idempotencyKey: 'idem-ack-1',
      details: { externalReference: 'PROV-REF-1' },
    });
    await h.service.confirmObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.accounting]),
      idempotencyKey: 'idem-confirm-a',
      reason: 'first confirmation',
      details: { externalReference: 'ACC-REF-A', amount: '100.00', currency: 'CAD' },
    });
    const second = await h.service.confirmObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.accounting]),
      idempotencyKey: 'idem-confirm-b',
      reason: 'contradictory confirmation',
      details: { externalReference: 'ACC-REF-B', amount: '120.00', currency: 'CAD' },
    });
    expect(second.status).toBe('executed');
    // 1 provider acknowledgement + 2 (contradictory) accounting confirmations — nothing dropped.
    expect(h.finStore.countHistory(FIN_TENANT_A, OBL).externalEvents).toBe(3);
    const view = await h.finStore.getReconciliationView(FIN_TENANT_A, OBL);
    expect(view?.confirmedAmount).toBe('120.00'); // latest wins for the view, history intact
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 13 — activation is rejected for an approved-but-not-financially-cleared affiliation.
// ---------------------------------------------------------------------------------------------
describe('proof 13: activation gate blocks uncleared obligation', () => {
  it('rejects activation while a blocking obligation is unassessed/unreconciled', async () => {
    const h = buildFinancialKernelHarness({
      seedApprovedApplications: [{ tenantId: FIN_TENANT_A, applicationId: APP }],
    });
    await h.service.assessObligation(assessRequest({ blocking: true }));
    const activate = await h.kernel.transition(activateInput(APP));
    expect(activate.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 14 — activation succeeds once the blocking obligation is cleared under valid authority.
// ---------------------------------------------------------------------------------------------
describe('proof 14: activation succeeds when cleared', () => {
  it('activates the affiliation after an authorized waiver clears the obligation', async () => {
    const h = buildFinancialKernelHarness({
      seedApprovedApplications: [{ tenantId: FIN_TENANT_A, applicationId: APP }],
    });
    await h.service.assessObligation(assessRequest({ blocking: true }));
    const waive = await h.service.waiveObligation({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.waiver]),
      idempotencyKey: 'idem-waive-1',
      reason: 'board-approved waiver',
    });
    expect(waive.status).toBe('executed');

    const activate = await h.kernel.transition(activateInput(APP));
    expect(activate.status).toBe('executed');
    if (activate.status === 'executed') expect(activate.toState).toBe('active');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 15 — a later correction appends a new version; it does NOT rewrite prior history.
// ---------------------------------------------------------------------------------------------
describe('proof 15: corrections append, never rewrite', () => {
  it('records a revised assessment as a new version keeping the prior version in history', async () => {
    const h = buildFinancialKernelHarness();
    await h.service.assessObligation(assessRequest({ amount: '100.00' }));
    const revise = await h.service.reviseObligationAssessment({
      tenantId: FIN_TENANT_A,
      obligationId: OBL,
      actor: actor([ROLE.reviser]),
      idempotencyKey: 'idem-revise-1',
      reason: 'corrected fee schedule',
      details: { amount: '150.00', currency: 'CAD', assessmentBasis: 'corrected_fee_schedule' },
    });
    expect(revise.status).toBe('executed');
    const head = await h.finStore.getObligation(FIN_TENANT_A, OBL);
    expect(head?.assessmentVersion).toBe(2);
    expect(head?.assessedAmount).toBe('150.00');
    // Both the original and the revision remain in append-only history.
    expect(h.finStore.countHistory(FIN_TENANT_A, OBL).assessments).toBe(2);
  });
});

// --- shared affiliation activate input builder ------------------------------------------------
function activateInput(applicationId: string): TransitionInput {
  return {
    entityType: 'AffiliationApplication',
    entityId: applicationId,
    trigger: 'activate',
    idempotencyKey: `idem-activate-${applicationId}`,
    actor: {
      actorId: 'member-1',
      tenantId: FIN_TENANT_A,
      scopeType: 'national_organization',
      scopeId: 'org-1',
      roles: [],
    },
    context: {
      tenantId: FIN_TENANT_A,
      scopeType: 'national_organization',
      scopeId: 'org-1',
      correlationId: 'corr-activate',
    },
    payload: { facts: AFFILIATION_ALL_PASS_FACTS },
  };
}
