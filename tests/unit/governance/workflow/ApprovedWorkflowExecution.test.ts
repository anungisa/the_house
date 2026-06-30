import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../../src/shared/errors/AppError.js';
import {
  AffiliationWorkflowPlanner,
  AFFILIATION_NATIONAL_STEP_CODE,
  AFFILIATION_REGIONAL_STEP_CODE,
} from '../../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import { InMemoryWorkflowStore } from '../../../../src/governance/workflow/InMemoryWorkflowStore.js';
import { WorkflowDecisionService } from '../../../../src/governance/workflow/WorkflowDecisionService.js';
import {
  PayloadBackedAffiliationGuardRepository,
} from '../../../../src/governance/guards/handlers.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import {
  buildKernelHarness,
  makeInput,
  memberActor,
  reviewerActor,
  sequentialIds,
  type KernelHarness,
} from '../../../helpers/affiliationKernel.js';

/**
 * Unit tests for the governed APPROVED-WORKFLOW execution path
 * (GovernanceKernel.executeApprovedTransitionRequest).
 *
 * These exercise the real kernel algorithm against the in-memory store (no DB). They prove an
 * explicitly approved review workflow can execute its ORIGINAL pending transition through the
 * kernel exactly once, that execution is NEVER a side effect of recording a decision, and that
 * the kernel re-resolves policy, re-checks permissions, and RE-RUNS guards at execution time.
 */

/** Drive an entity to an approval-required `approve` request (creates the review workflow). */
async function driveToApprovalRequest(h: KernelHarness, entityId: string) {
  await h.kernel.transition(makeInput({ entityId, trigger: 'submit', idempotencyKey: `${entityId}-s` }));
  await h.kernel.transition(
    makeInput({ entityId, trigger: 'review_start', idempotencyKey: `${entityId}-r` }),
  );
  const approval = await h.kernel.transition(
    makeInput({ entityId, trigger: 'approve', idempotencyKey: `${entityId}-a` }),
  );
  return approval;
}

/** A decision service sharing the harness's workflow backing (mirrors production sharing). */
function decisionServiceFor(h: KernelHarness): WorkflowDecisionService {
  return new WorkflowDecisionService(
    new InMemoryWorkflowStore(h.store.workflowBacking, sequentialIds('wd')),
    { clock: fixedClock(1_700_000_100_000) },
  );
}

/** Record both tier sign-offs so the workflow becomes `approved`. */
async function approveWorkflow(
  h: KernelHarness,
  workflowInstanceId: string,
): Promise<void> {
  const decisions = decisionServiceFor(h);
  await decisions.recordDecision({
    tenantId: h.tenantId,
    workflowInstanceId,
    stepCode: AFFILIATION_REGIONAL_STEP_CODE,
    decision: 'approve',
    actorUserId: 'regional-reviewer',
  });
  await decisions.recordDecision({
    tenantId: h.tenantId,
    workflowInstanceId,
    stepCode: AFFILIATION_NATIONAL_STEP_CODE,
    decision: 'approve',
    actorUserId: 'national-reviewer',
  });
}

function entityState(h: KernelHarness, entityId: string): string | undefined {
  return h.store.entityStateSnapshots.find((e) => e.entityId === entityId)?.currentState;
}

function requestStatus(h: KernelHarness, transitionRequestId: string): string | undefined {
  return h.store.data.transitionRequests.find((r) => r.id === transitionRequestId)?.status;
}

describe('GovernanceKernel.executeApprovedTransitionRequest', () => {
  // (1) A pending (undecided) workflow cannot be executed.
  it('(1) refuses to execute a pending (undecided) workflow', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-1');

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: reviewerActor(),
        idempotencyKey: 'exec-1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_NOT_APPROVED });

    expect(entityState(h, 'app-1')).toBe('under_review');
  });

  // (2) A rejected workflow cannot be executed.
  it('(2) refuses to execute a rejected workflow', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-2');
    const decisions = decisionServiceFor(h);
    await decisions.recordDecision({
      tenantId: h.tenantId,
      workflowInstanceId: approval.workflowInstanceId!,
      stepCode: AFFILIATION_REGIONAL_STEP_CODE,
      decision: 'reject',
      actorUserId: 'regional-reviewer',
    });

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: reviewerActor(),
        idempotencyKey: 'exec-2',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_NOT_APPROVED });

    expect(entityState(h, 'app-2')).toBe('under_review');
  });

  // (3) An approved workflow executes its original transition.
  it('(3) executes the original approved transition', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-3');
    await approveWorkflow(h, approval.workflowInstanceId!);

    const result = await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-3',
    });

    expect(result.status).toBe('executed');
    expect(result.trigger).toBe('approve');
    expect(result.fromState).toBe('under_review');
    expect(result.toState).toBe('approved');
    expect(result.transitionRequestId).toBe(approval.transitionRequestId);
  });

  // (4) Execution mutates entity_state exactly once.
  it('(4) mutates entity_state exactly once', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-4');
    await approveWorkflow(h, approval.workflowInstanceId!);

    await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-4',
    });
    // Idempotent re-execution must not mutate again.
    await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-4',
    });

    expect(entityState(h, 'app-4')).toBe('approved');
    const executed = h.store.data.stateTransitions.filter(
      (t) => t.entityId === 'app-4' && t.trigger === 'approve',
    );
    expect(executed).toHaveLength(1);
  });

  // (5) Execution writes an immutable state_transition linked to the request.
  it('(5) writes a state_transition linked to the request', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-5');
    await approveWorkflow(h, approval.workflowInstanceId!);

    const result = await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-5',
    });

    const row = h.store.data.stateTransitions.find((t) => t.id === result.stateTransitionId);
    expect(row).toBeDefined();
    expect(row?.idempotencyKey).toBe('exec-5');
    expect(row?.transitionRequestId).toBe(approval.transitionRequestId);
  });

  // (6) Execution appends a 'transition.executed' audit event.
  it('(6) appends a transition.executed audit event', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-6');
    await approveWorkflow(h, approval.workflowInstanceId!);

    await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-6',
    });

    const audit = h.store.data.auditEvents.find(
      (a) => a.entityId === 'app-6' && a.trigger === 'approve' && a.action === 'transition.executed',
    );
    expect(audit).toBeDefined();
  });

  // (7) Execution enqueues exactly one outbox message for the transition.
  it('(7) enqueues an outbox message for the executed transition', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-7');
    await approveWorkflow(h, approval.workflowInstanceId!);

    await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-7',
    });

    const messages = h.store.data.outbox.filter(
      (m) => m.messageType === 'AffiliationApplication.approve',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]?.dedupeKey).toBe('AffiliationApplication:app-7:exec-7');
  });

  // (8) Execution marks the transition_request consumed (status 'executed').
  it('(8) marks the transition_request executed', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-8');
    await approveWorkflow(h, approval.workflowInstanceId!);

    expect(requestStatus(h, approval.transitionRequestId!)).toBe('pending_approval');
    await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-8',
    });
    expect(requestStatus(h, approval.transitionRequestId!)).toBe('executed');
  });

  // (9) Re-executing with the SAME idempotency key is a safe idempotent replay.
  it('(9) replays idempotently for the same idempotency key', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-9');
    await approveWorkflow(h, approval.workflowInstanceId!);

    const first = await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-9',
    });
    const second = await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-9',
    });

    expect(second.status).toBe('idempotent_replay');
    expect(second.stateTransitionId).toBe(first.stateTransitionId);
    expect(second.toState).toBe('approved');
  });

  // (10) Re-executing an already-executed request with a DIFFERENT key fails closed (409).
  it('(10) rejects a different idempotency key after execution', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-10');
    await approveWorkflow(h, approval.workflowInstanceId!);

    await h.kernel.executeApprovedTransitionRequest({
      tenantId: h.tenantId,
      transitionRequestId: approval.transitionRequestId!,
      actor: reviewerActor(),
      idempotencyKey: 'exec-10a',
    });

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: reviewerActor(),
        idempotencyKey: 'exec-10b',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_CONFLICT });
  });

  // (11) Execution fails closed when the entity state no longer matches the approved source.
  it('(11) rejects when the current entity state no longer matches the approved source', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-11');
    await approveWorkflow(h, approval.workflowInstanceId!);

    // Simulate state drift: the entity moved out of 'under_review' after approval.
    const rec = h.store.data.entityStates.find((e) => e.entityId === 'app-11');
    rec!.currentState = 'approved';

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: reviewerActor(),
        idempotencyKey: 'exec-11',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.TRANSITION_STATE_CONFLICT });
  });

  // (12) Guards are RE-RUN at execution time; a regressed guard blocks execution (no mutation).
  it('(12) re-runs guards at execution and fails closed when a guard regresses', async () => {
    // Compliance passes at request time, then regresses (flags open) at execution time.
    class FlippingComplianceRepo extends PayloadBackedAffiliationGuardRepository {
      private calls = 0;
      override hasOpenComplianceFlags(): boolean {
        const regressed = this.calls >= 1;
        this.calls += 1;
        return regressed;
      }
    }
    const h = buildKernelHarness({
      workflowPlanner: new AffiliationWorkflowPlanner(),
      guardRepo: new FlippingComplianceRepo(),
    });
    const approval = await driveToApprovalRequest(h, 'app-12');
    await approveWorkflow(h, approval.workflowInstanceId!);

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: reviewerActor(),
        idempotencyKey: 'exec-12',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.GUARD_FAILED });

    // No mutation: entity unchanged, request still pending.
    expect(entityState(h, 'app-12')).toBe('under_review');
    expect(requestStatus(h, approval.transitionRequestId!)).toBe('pending_approval');
  });

  // (13) Recording decisions (even to full approval) never executes the transition by itself.
  it('(13) recording decisions does not execute the transition', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-13');
    await approveWorkflow(h, approval.workflowInstanceId!);

    // The workflow is approved, but no explicit execution has happened.
    expect(entityState(h, 'app-13')).toBe('under_review');
    expect(requestStatus(h, approval.transitionRequestId!)).toBe('pending_approval');
    expect(
      h.store.data.stateTransitions.some((t) => t.entityId === 'app-13' && t.trigger === 'approve'),
    ).toBe(false);
  });

  // (14) An unknown transition request id fails closed (404-style).
  it('(14) rejects an unknown transition request id', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: 'does-not-exist',
        actor: reviewerActor(),
        idempotencyKey: 'exec-14',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.TRANSITION_REQUEST_NOT_FOUND });
  });

  // (15) The execution actor's permission is re-checked (a non-reviewer is denied).
  it('(15) re-checks the execution actor permission and denies a non-reviewer', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-15');
    await approveWorkflow(h, approval.workflowInstanceId!);

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: memberActor(),
        idempotencyKey: 'exec-15',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PERMISSION_DENIED });

    expect(entityState(h, 'app-15')).toBe('under_review');
  });

  // (16) A cross-tenant execution actor is denied before any store access.
  it('(16) denies a cross-tenant execution actor', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    const approval = await driveToApprovalRequest(h, 'app-16');
    await approveWorkflow(h, approval.workflowInstanceId!);

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: reviewerActor('22222222-2222-2222-2222-222222222222'),
        idempotencyKey: 'exec-16',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });
});
