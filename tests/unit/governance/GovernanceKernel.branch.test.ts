import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../src/shared/errors/AppError.js';
import { AffiliationWorkflowPlanner } from '../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import type { TransitionContext } from '../../../src/governance/types/TransitionTypes.js';
import {
  buildKernelHarness,
  makeInput,
  reviewerActor,
  type KernelHarness,
} from '../../helpers/affiliationKernel.js';

/**
 * Branch-coverage sweep for GovernanceKernel decision/failure edges that the vertical-slice
 * tests (GovernanceKernel.test.ts, ApprovedWorkflowExecution.test.ts) do not reach:
 *  - the approval-required path WITHOUT a workflow planner (no workflow instance persisted) and
 *    the execution gate that then fails closed because no approved review workflow exists,
 *  - executing a transition_request whose status is neither pending_approval nor executed,
 *  - idempotent replay of an approval-required request (the replayResult 'request' branch),
 *  - the optional correlationId/causationId pass-through branches on the journal/audit rows.
 *
 * All hermetic: in-memory store, no DB, no network.
 */

/** Drive draft -> submitted -> under_review so an `approve` becomes approval-required. */
async function driveToUnderReview(h: KernelHarness, entityId: string): Promise<void> {
  await h.kernel.transition(makeInput({ entityId, trigger: 'submit', idempotencyKey: `${entityId}-s` }));
  await h.kernel.transition(
    makeInput({ entityId, trigger: 'review_start', idempotencyKey: `${entityId}-r` }),
  );
}

describe('GovernanceKernel branch sweep — approval/execution edges', () => {
  it('creates an approval-required request with NO workflow instance when no planner is configured', async () => {
    const h = buildKernelHarness(); // no workflowPlanner
    await driveToUnderReview(h, 'app-np1');

    const approval = await h.kernel.transition(
      makeInput({ entityId: 'app-np1', trigger: 'approve', idempotencyKey: 'app-np1-a' }),
    );

    expect(approval.status).toBe('approval_required');
    expect(approval.transitionRequestId).toBeDefined();
    // persistWorkflow returns undefined → the result carries no workflowInstanceId.
    expect(approval.workflowInstanceId).toBeUndefined();
    expect(h.store.data.workflowInstances).toHaveLength(0);
  });

  it('fails the execution gate closed when the request has no review workflow (WORKFLOW_NOT_APPROVED)', async () => {
    const h = buildKernelHarness(); // no planner → request exists, workflow does not
    await driveToUnderReview(h, 'app-np2');
    const approval = await h.kernel.transition(
      makeInput({ entityId: 'app-np2', trigger: 'approve', idempotencyKey: 'app-np2-a' }),
    );

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: reviewerActor(),
        idempotencyKey: 'exec-np2',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_NOT_APPROVED });

    // No mutation: still under_review, request still pending_approval.
    expect(h.store.data.entityStates.find((e) => e.entityId === 'app-np2')?.currentState).toBe(
      'under_review',
    );
  });

  it('rejects executing a transition_request whose status is neither pending_approval nor executed', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    await driveToUnderReview(h, 'app-st1');
    const approval = await h.kernel.transition(
      makeInput({ entityId: 'app-st1', trigger: 'approve', idempotencyKey: 'app-st1-a' }),
    );

    // Simulate a request that was moved to a non-executable terminal status out of band.
    const req = h.store.data.transitionRequests.find((r) => r.id === approval.transitionRequestId);
    req!.status = 'rejected';

    await expect(
      h.kernel.executeApprovedTransitionRequest({
        tenantId: h.tenantId,
        transitionRequestId: approval.transitionRequestId!,
        actor: reviewerActor(),
        idempotencyKey: 'exec-st1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.WORKFLOW_NOT_APPROVED });
  });

  it('replays an approval-required request idempotently (replayResult request branch)', async () => {
    const h = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    await driveToUnderReview(h, 'app-rp1');

    const first = await h.kernel.transition(
      makeInput({ entityId: 'app-rp1', trigger: 'approve', idempotencyKey: 'app-rp1-a' }),
    );
    const second = await h.kernel.transition(
      makeInput({ entityId: 'app-rp1', trigger: 'approve', idempotencyKey: 'app-rp1-a' }),
    );

    expect(first.status).toBe('approval_required');
    expect(second.status).toBe('idempotent_replay');
    expect(second.transitionRequestId).toBe(first.transitionRequestId);
    expect(second.toState).toBe('approved');
    // Exactly one request was created (replay did not duplicate).
    expect(
      h.store.data.transitionRequests.filter((r) => r.entityId === 'app-rp1'),
    ).toHaveLength(1);
  });
});

describe('GovernanceKernel branch sweep — lineage pass-through', () => {
  it('omits correlationId on the audit + outbox rows when the context supplies neither id', async () => {
    const h = buildKernelHarness();
    const context: TransitionContext = { tenantId: h.tenantId, scopeType: 'national_organization' };

    const result = await h.kernel.transition(
      makeInput({ entityId: 'app-lin1', trigger: 'submit', idempotencyKey: 'k', context }),
    );

    expect(result.status).toBe('executed');
    const audit = h.store.data.auditEvents.find((a) => a.entityId === 'app-lin1');
    expect(audit?.correlationId).toBeUndefined();
    expect(audit?.causationId).toBeUndefined();
    const outbox = h.store.data.outbox.find((m) => m.causationId === result.stateTransitionId);
    expect(outbox?.correlationId).toBeUndefined();
  });

  it('propagates a supplied context.correlationId/causationId onto the audit + outbox rows', async () => {
    const h = buildKernelHarness();
    const context: TransitionContext = {
      tenantId: h.tenantId,
      scopeType: 'national_organization',
      correlationId: 'corr-123',
      causationId: 'cause-123',
    };

    const result = await h.kernel.transition(
      makeInput({ entityId: 'app-lin2', trigger: 'submit', idempotencyKey: 'k', context }),
    );

    const audit = h.store.data.auditEvents.find((a) => a.entityId === 'app-lin2');
    expect(audit?.correlationId).toBe('corr-123');
    expect(audit?.causationId).toBe('cause-123');
    // The outbox carries the request correlationId; its causationId is the state-transition id.
    const outbox = h.store.data.outbox.find((m) => m.causationId === result.stateTransitionId);
    expect(outbox?.correlationId).toBe('corr-123');
  });
});
