import { describe, it, expect } from 'vitest';
import { buildKernelHarness, makeInput, sequentialIds } from '../../../helpers/affiliationKernel.js';
import { AffiliationWorkflowPlanner } from '../../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import { InMemoryWorkflowStore } from '../../../../src/governance/workflow/InMemoryWorkflowStore.js';
import { WorkflowDecisionService } from '../../../../src/governance/workflow/WorkflowDecisionService.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

/**
 * Pass G — WorkflowDecisionService records a single reviewer decision per step and advances
 * the two-tier review as METADATA only. It NEVER mutates governance entity_state and NEVER
 * executes the pending transition.
 */
async function setupWorkflow(entityId: string) {
  const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
  await h.kernel.transition(makeInput({ entityId, trigger: 'submit', idempotencyKey: 's' }));
  await h.kernel.transition(makeInput({ entityId, trigger: 'review_start', idempotencyKey: 'r' }));
  const result = await h.kernel.transition(
    makeInput({ entityId, trigger: 'approve', idempotencyKey: 'a' }),
  );
  const store = new InMemoryWorkflowStore(h.store.workflowBacking, sequentialIds('wd'));
  const service = new WorkflowDecisionService(store, { clock: fixedClock(1_700_000_100_000) });
  return {
    h,
    store,
    service,
    workflowInstanceId: result.workflowInstanceId!,
    tenantId: h.tenantId,
  };
}

describe('WorkflowDecisionService.recordDecision', () => {
  it('(8) regional approval advances the workflow to the national step', async () => {
    const { service, workflowInstanceId, tenantId } = await setupWorkflow('dec-8');
    const outcome = await service.recordDecision({
      tenantId,
      workflowInstanceId,
      stepCode: 'regional_signoff',
      decision: 'approve',
      actorUserId: 'reviewer-region',
    });
    expect(outcome.status).toBe('pending');
    expect(outcome.currentStepCode).toBe('national_signoff');
    expect(outcome.decidedStepCode).toBe('regional_signoff');
  });

  it('(9) national approval (after regional) marks the workflow approved', async () => {
    const { service, workflowInstanceId, tenantId } = await setupWorkflow('dec-9');
    await service.recordDecision({
      tenantId,
      workflowInstanceId,
      stepCode: 'regional_signoff',
      decision: 'approve',
      actorUserId: 'reviewer-region',
    });
    const outcome = await service.recordDecision({
      tenantId,
      workflowInstanceId,
      stepCode: 'national_signoff',
      decision: 'approve',
      actorUserId: 'reviewer-national',
    });
    expect(outcome.status).toBe('approved');
    expect(outcome.currentStepCode).toBeUndefined();
  });

  it('(10) regional rejection marks the whole workflow rejected', async () => {
    const { service, workflowInstanceId, tenantId } = await setupWorkflow('dec-10');
    const outcome = await service.recordDecision({
      tenantId,
      workflowInstanceId,
      stepCode: 'regional_signoff',
      decision: 'reject',
      actorUserId: 'reviewer-region',
      reason: 'incomplete',
    });
    expect(outcome.status).toBe('rejected');
    expect(outcome.currentStepCode).toBeUndefined();
  });

  it('(11) an unknown step code fails closed with WORKFLOW_STEP_UNKNOWN', async () => {
    const { service, workflowInstanceId, tenantId } = await setupWorkflow('dec-11');
    await expect(
      service.recordDecision({
        tenantId,
        workflowInstanceId,
        stepCode: 'does_not_exist',
        decision: 'approve',
        actorUserId: 'reviewer',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_STEP_UNKNOWN });
  });

  it('(12) an invalid decision value fails closed with WORKFLOW_INVALID_DECISION', async () => {
    const { service, workflowInstanceId, tenantId } = await setupWorkflow('dec-12');
    await expect(
      service.recordDecision({
        tenantId,
        workflowInstanceId,
        stepCode: 'regional_signoff',
        // @ts-expect-error deliberately invalid decision value
        decision: 'maybe',
        actorUserId: 'reviewer',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_INVALID_DECISION });
  });

  it('deciding the national step before regional fails closed (not the current step)', async () => {
    const { service, workflowInstanceId, tenantId } = await setupWorkflow('dec-order');
    await expect(
      service.recordDecision({
        tenantId,
        workflowInstanceId,
        stepCode: 'national_signoff',
        decision: 'approve',
        actorUserId: 'reviewer-national',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_STEP_UNKNOWN });
  });

  it('a decision on an already-rejected workflow fails closed with WORKFLOW_ALREADY_DECIDED', async () => {
    const { service, workflowInstanceId, tenantId } = await setupWorkflow('dec-closed');
    await service.recordDecision({
      tenantId,
      workflowInstanceId,
      stepCode: 'regional_signoff',
      decision: 'reject',
      actorUserId: 'reviewer-region',
    });
    await expect(
      service.recordDecision({
        tenantId,
        workflowInstanceId,
        stepCode: 'national_signoff',
        decision: 'approve',
        actorUserId: 'reviewer-national',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_ALREADY_DECIDED });
  });

  it('an unknown workflow instance fails closed with WORKFLOW_NOT_FOUND', async () => {
    const { service, tenantId } = await setupWorkflow('dec-nf');
    await expect(
      service.recordDecision({
        tenantId,
        workflowInstanceId: 'missing-instance',
        stepCode: 'regional_signoff',
        decision: 'approve',
        actorUserId: 'reviewer',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_NOT_FOUND });
  });

  it('a different tenant cannot see the workflow (fails closed as not found)', async () => {
    const { service, workflowInstanceId } = await setupWorkflow('dec-tenant');
    await expect(
      service.recordDecision({
        tenantId: '22222222-2222-2222-2222-222222222222',
        workflowInstanceId,
        stepCode: 'regional_signoff',
        decision: 'approve',
        actorUserId: 'reviewer',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_NOT_FOUND });
  });

  it('records an append-only decision row and does not touch governance entity_state', async () => {
    const { h, service, workflowInstanceId, tenantId } = await setupWorkflow('dec-audit');
    await service.recordDecision({
      tenantId,
      workflowInstanceId,
      stepCode: 'regional_signoff',
      decision: 'approve',
      actorUserId: 'reviewer-region',
    });
    expect(h.store.workflowBacking.decisions).toHaveLength(1);
    expect(h.store.workflowBacking.decisions[0]!.decision).toBe('approve');
    // entity_state remains under_review — the transition was never executed.
    expect(h.store.data.entityStates[0]!.currentState).toBe('under_review');
  });
});
