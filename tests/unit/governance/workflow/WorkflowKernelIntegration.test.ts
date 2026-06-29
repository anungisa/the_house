import { describe, it, expect } from 'vitest';
import {
  buildKernelHarness,
  makeInput,
} from '../../../helpers/affiliationKernel.js';
import { AffiliationWorkflowPlanner } from '../../../../src/governance/workflow/AffiliationWorkflowPlanner.js';

/**
 * Pass G — two-tier review WORKFLOW METADATA, kernel-side creation.
 *
 * These tests assert that an approval-required AffiliationApplication transition creates
 * review-workflow metadata (instance + ordered regional/national steps) ATOMICALLY with the
 * transition_request, WITHOUT introducing lifecycle states and WITHOUT mutating entity_state.
 */

function planner(): AffiliationWorkflowPlanner {
  return new AffiliationWorkflowPlanner();
}

/** Drive draft -> submitted -> under_review, then attempt the approval-required `approve`. */
async function driveToApprove(entityId: string) {
  const h = buildKernelHarness({ workflowPlanner: planner() });
  await h.kernel.transition(makeInput({ entityId, trigger: 'submit', idempotencyKey: 's' }));
  await h.kernel.transition(
    makeInput({ entityId, trigger: 'review_start', idempotencyKey: 'r' }),
  );
  const result = await h.kernel.transition(
    makeInput({ entityId, trigger: 'approve', idempotencyKey: 'a' }),
  );
  return { h, result };
}

describe('GovernanceKernel two-tier review workflow metadata', () => {
  it('(1) still creates the transition_request for an approval-required transition', async () => {
    const { h, result } = await driveToApprove('wf-1');
    expect(result.status).toBe('approval_required');
    expect(result.transitionRequestId).toBeDefined();
    expect(h.store.data.transitionRequests).toHaveLength(1);
  });

  it('(2) creates exactly one workflow_instance', async () => {
    const { h } = await driveToApprove('wf-2');
    expect(h.store.data.workflowInstances).toHaveLength(1);
    expect(h.store.data.workflowInstances[0]!.status).toBe('pending');
    expect(h.store.data.workflowInstances[0]!.workflowType).toBe('affiliation_two_tier_review');
  });

  it('(3) links the workflow_instance to the transition_request', async () => {
    const { h, result } = await driveToApprove('wf-3');
    expect(h.store.data.workflowInstances[0]!.transitionRequestId).toBe(
      result.transitionRequestId,
    );
  });

  it('(4) creates two steps: regional_signoff then national_signoff', async () => {
    const { h } = await driveToApprove('wf-4');
    const steps = h.store.data.workflowSteps;
    expect(steps).toHaveLength(2);
    const codes = steps.map((s) => s.stepCode).sort();
    expect(codes).toEqual(['national_signoff', 'regional_signoff']);
    expect(steps.every((s) => s.required)).toBe(true);
    expect(steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('(5) orders regional review before national review', async () => {
    const { h } = await driveToApprove('wf-5');
    const ordered = [...h.store.data.workflowSteps].sort((a, b) => a.stepOrder - b.stepOrder);
    expect(ordered[0]!.stepCode).toBe('regional_signoff');
    expect(ordered[0]!.reviewTier).toBe('regional_review');
    expect(ordered[1]!.stepCode).toBe('national_signoff');
    expect(ordered[1]!.reviewTier).toBe('national_review');
    // The instance points at the first step awaiting a decision.
    expect(h.store.data.workflowInstances[0]!.currentStepCode).toBe('regional_signoff');
  });

  it('(6) returns the workflowInstanceId on the approval_required result', async () => {
    const { h, result } = await driveToApprove('wf-6');
    expect(result.workflowInstanceId).toBeDefined();
    expect(result.workflowInstanceId).toBe(h.store.data.workflowInstances[0]!.id);
  });

  it('(7) does not mutate entity_state (no new lifecycle state)', async () => {
    const { h } = await driveToApprove('wf-7');
    expect(h.store.data.entityStates[0]!.currentState).toBe('under_review');
  });

  it('(15) leaves existing non-approval transitions unaffected (no workflow created)', async () => {
    const h = buildKernelHarness({ workflowPlanner: planner() });
    const result = await h.kernel.transition(
      makeInput({ entityId: 'wf-15', trigger: 'submit', idempotencyKey: 's' }),
    );
    expect(result.status).toBe('executed');
    expect(h.store.data.workflowInstances).toHaveLength(0);
    expect(h.store.data.workflowSteps).toHaveLength(0);
  });

  it('(16) preserves evidence behavior for evidence-required executed transitions', async () => {
    const h = buildKernelHarness({ workflowPlanner: planner() });
    await h.kernel.transition(makeInput({ entityId: 'wf-16', trigger: 'submit', idempotencyKey: 's' }));
    await h.kernel.transition(
      makeInput({ entityId: 'wf-16', trigger: 'review_start', idempotencyKey: 'r' }),
    );
    // close is evidence-required but NOT approval-required, so it executes (no workflow).
    h.store.data.entityStates[0]!.currentState = 'rejected';
    const result = await h.kernel.transition(
      makeInput({ entityId: 'wf-16', trigger: 'close', idempotencyKey: 'c' }),
    );
    expect(result.status).toBe('executed');
    expect(h.store.data.evidenceObjects).toHaveLength(1);
    expect(h.store.data.workflowInstances).toHaveLength(0);
  });

  it('does not create a workflow for entity types the planner does not handle', async () => {
    const p = planner();
    expect(
      p.planFor({
        entityType: 'SomeOtherEntity',
        entityId: 'x',
        trigger: 'approve',
        fromState: 'under_review',
        toState: 'approved',
        tenantId: '11111111-1111-1111-1111-111111111111',
        actor: {
          actorId: 'a',
          tenantId: '11111111-1111-1111-1111-111111111111',
          scopeType: 'national_organization',
          roles: ['reviewer'],
        },
      }),
    ).toBeUndefined();
  });
});
