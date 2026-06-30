import { describe, it, expect, vi } from 'vitest';

import {
  handleWorkflowDecision,
  type WorkflowDecisionRecorder,
  type WorkflowHttpDeps,
} from '../../../../src/http/workflow/WorkflowHttpAdapter.js';
import type {
  RecordWorkflowDecisionInput,
  WorkflowDecisionOutcome,
} from '../../../../src/governance/workflow/WorkflowDecisionService.js';
import { WorkflowDecisionService } from '../../../../src/governance/workflow/WorkflowDecisionService.js';
import { InMemoryWorkflowStore } from '../../../../src/governance/workflow/InMemoryWorkflowStore.js';
import { AffiliationWorkflowPlanner } from '../../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { TrustedHeadersAuthContextResolver } from '../../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import { AppError, ErrorCode } from '../../../../src/shared/errors/AppError.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import {
  buildKernelHarness,
  makeInput,
  sequentialIds,
} from '../../../helpers/affiliationKernel.js';

/**
 * Unit tests for the workflow decision HTTP adapter (src/http/workflow/WorkflowHttpAdapter.ts).
 *
 * Protocol-pure: the handler is called directly with parsed request shapes. Identity is
 * carried in the shared `x-house-*` trusted-header contract in BOTH auth modes. NO database,
 * NO Docker, and NO real Azure are required. The adapter records review METADATA only and
 * never executes a lifecycle transition.
 */

const DEMO = new DemoAuthContextResolver();
const TRUSTED = new TrustedHeadersAuthContextResolver();

/** A recording fake that captures the single recordDecision call and returns a fixed outcome. */
class RecordingRecorder implements WorkflowDecisionRecorder {
  public readonly calls: RecordWorkflowDecisionInput[] = [];
  constructor(private readonly outcome: WorkflowDecisionOutcome) {}
  recordDecision(input: RecordWorkflowDecisionInput): Promise<WorkflowDecisionOutcome> {
    this.calls.push(input);
    return Promise.resolve(this.outcome);
  }
}

/** A fake recorder that always throws the supplied AppError (for error-mapping cases). */
class ThrowingRecorder implements WorkflowDecisionRecorder {
  constructor(private readonly err: AppError) {}
  recordDecision(): Promise<WorkflowDecisionOutcome> {
    return Promise.reject(this.err);
  }
}

function deps(recorder: WorkflowDecisionRecorder): WorkflowHttpDeps {
  return { decisionService: recorder };
}

function authHeaders(
  tenantId: string,
  userId: string,
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': userId,
    'x-house-actor-role-keys': 'reviewer',
    ...extra,
  };
}

function outcome(over: Partial<WorkflowDecisionOutcome> = {}): WorkflowDecisionOutcome {
  return {
    workflowInstanceId: 'wf-1',
    status: 'pending',
    currentStepCode: 'national_signoff',
    decidedStepCode: 'regional_signoff',
    decision: 'approve',
    ...over,
  };
}

describe('workflow decision HTTP adapter', () => {
  // (1) Valid regional approval calls the service exactly once with the right args.
  it('(1) records a regional approval and calls the service once', async () => {
    const recorder = new RecordingRecorder(outcome());
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-a', 'reviewer-region'),
        body: { decision: 'approve' },
      },
      'req-1',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]).toMatchObject({
      tenantId: 'tenant-a',
      workflowInstanceId: 'wf-1',
      stepCode: 'regional_signoff',
      decision: 'approve',
      actorUserId: 'reviewer-region',
    });
  });

  // (2) Valid national approval calls the service exactly once.
  it('(2) records a national approval and calls the service once', async () => {
    const recorder = new RecordingRecorder(
      outcome({ status: 'approved', currentStepCode: undefined, decidedStepCode: 'national_signoff' }),
    );
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'national_signoff',
        headers: authHeaders('tenant-a', 'reviewer-national'),
        body: { decision: 'approve' },
      },
      'req-2',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.stepCode).toBe('national_signoff');
    expect(result.body['workflowStatus']).toBe('approved');
    expect(result.body['currentStepCode']).toBeNull();
  });

  // (3) Reject decision calls the service exactly once.
  it('(3) records a rejection and calls the service once', async () => {
    const recorder = new RecordingRecorder(
      outcome({ status: 'rejected', currentStepCode: undefined, decision: 'reject' }),
    );
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-a', 'reviewer-region'),
        body: { decision: 'reject', reason: 'incomplete' },
      },
      'req-3',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.decision).toBe('reject');
    expect(recorder.calls[0]?.reason).toBe('incomplete');
    expect(result.body['workflowStatus']).toBe('rejected');
  });

  // (4a) An invalid decision VALUE is rejected with 400 (service-authoritative validation).
  it('(4a) maps an invalid decision value to 400', async () => {
    const recorder = new ThrowingRecorder(
      new AppError(ErrorCode.WORKFLOW_INVALID_DECISION, "Invalid workflow decision 'maybe'."),
    );
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-a', 'reviewer-region'),
        body: { decision: 'maybe' },
      },
      'req-4a',
      DEMO,
    );
    expect(result.status).toBe(400);
    expect(result.body['code']).toBe('WORKFLOW_INVALID_DECISION');
  });

  // (4b) A missing decision field is rejected with 400 before the service is called.
  it('(4b) maps a missing decision field to 400 without calling the service', async () => {
    const recorder = new RecordingRecorder(outcome());
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-a', 'reviewer-region'),
        body: {},
      },
      'req-4b',
      DEMO,
    );
    expect(result.status).toBe(400);
    expect(result.body['code']).toBe('INVALID_INPUT');
    expect(recorder.calls).toHaveLength(0);
  });

  // (5) Missing auth identity maps to 401.
  it('(5) maps a missing tenant/actor identity to 401', async () => {
    const recorder = new RecordingRecorder(outcome());
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: {},
        body: { decision: 'approve' },
      },
      'req-5',
      DEMO,
    );
    expect(result.status).toBe(401);
    expect(result.body['code']).toBe('UNAUTHENTICATED');
    expect(recorder.calls).toHaveLength(0);
  });

  // (6) Body-supplied actor/tenant are IGNORED: identity comes only from trusted headers.
  it('(6) ignores body actor/tenantId and uses the header identity', async () => {
    const recorder = new RecordingRecorder(outcome());
    await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-real', 'user-real'),
        body: {
          decision: 'approve',
          tenantId: 'tenant-attacker',
          actor: { userId: 'user-attacker' },
        },
      },
      'req-6',
      DEMO,
    );
    expect(recorder.calls[0]?.tenantId).toBe('tenant-real');
    expect(recorder.calls[0]?.actorUserId).toBe('user-real');
  });

  // (7a) An unknown workflow instance maps to 404 (documented).
  it('(7a) maps WORKFLOW_NOT_FOUND to 404', async () => {
    const recorder = new ThrowingRecorder(
      new AppError(ErrorCode.WORKFLOW_NOT_FOUND, 'No workflow instance for tenant.'),
    );
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'missing',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-a', 'reviewer-region'),
        body: { decision: 'approve' },
      },
      'req-7a',
      DEMO,
    );
    expect(result.status).toBe(404);
    expect(result.body['code']).toBe('WORKFLOW_NOT_FOUND');
  });

  // (7b) An unknown / out-of-order step maps to 409 (documented).
  it('(7b) maps WORKFLOW_STEP_UNKNOWN to 409', async () => {
    const recorder = new ThrowingRecorder(
      new AppError(ErrorCode.WORKFLOW_STEP_UNKNOWN, 'Unknown workflow step.'),
    );
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'national_signoff',
        headers: authHeaders('tenant-a', 'reviewer-region'),
        body: { decision: 'approve' },
      },
      'req-7b',
      DEMO,
    );
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('WORKFLOW_STEP_UNKNOWN');
  });

  // (8) An already-decided workflow/step maps to 409.
  it('(8) maps WORKFLOW_ALREADY_DECIDED to 409', async () => {
    const recorder = new ThrowingRecorder(
      new AppError(ErrorCode.WORKFLOW_ALREADY_DECIDED, 'Workflow is already approved.'),
    );
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-a', 'reviewer-region'),
        body: { decision: 'approve' },
      },
      'req-8',
      DEMO,
    );
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe('WORKFLOW_ALREADY_DECIDED');
  });

  // (9) The response DTO is a stable projection (no raw rows) with the expected fields.
  it('(9) returns a stable response DTO with workflowInstanceId/status/currentStepCode', async () => {
    const recorder = new RecordingRecorder(outcome());
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-a', 'reviewer-region'),
        body: { decision: 'approve' },
      },
      'req-9',
      DEMO,
    );
    expect(result.body).toEqual({
      status: 'recorded',
      workflowInstanceId: 'wf-1',
      workflowStatus: 'pending',
      currentStepCode: 'national_signoff',
      decidedStepCode: 'regional_signoff',
      decision: 'approve',
      requestId: 'req-9',
    });
  });

  // (12) Trusted-headers mode derives the actor user id from the verified header.
  it('(12) derives the actor user id from trusted headers', async () => {
    const recorder = new RecordingRecorder(outcome());
    await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-a', 'trusted-user'),
        body: { decision: 'approve' },
      },
      'req-12',
      TRUSTED,
    );
    expect(recorder.calls[0]?.actorUserId).toBe('trusted-user');
  });

  // (13) Trusted-headers mode derives the tenant id from the verified header.
  it('(13) derives the tenant id from trusted headers', async () => {
    const recorder = new RecordingRecorder(outcome());
    await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: authHeaders('tenant-trusted', 'trusted-user'),
        body: { decision: 'approve' },
      },
      'req-13',
      TRUSTED,
    );
    expect(recorder.calls[0]?.tenantId).toBe('tenant-trusted');
  });

  // (14) Only NSO-generic identity fields are required: a minimal generic request succeeds.
  it('(14) requires no sport-specific fields for a valid request', async () => {
    const recorder = new RecordingRecorder(outcome());
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'reviewer-1',
          'x-house-actor-permission-keys': 'workflow.decide',
        },
        body: { decision: 'approve' },
      },
      'req-14',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(recorder.calls).toHaveLength(1);
  });
});

/**
 * End-to-end metadata behaviour: drive the kernel to an approval-required state (which creates
 * the workflow atomically), then record decisions THROUGH the adapter against a real
 * WorkflowDecisionService. Proves the endpoint advances workflow metadata WITHOUT touching
 * the kernel or governance entity_state.
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
  return { h, service, workflowInstanceId: result.workflowInstanceId!, tenantId: h.tenantId };
}

describe('workflow decision HTTP adapter — metadata integrity', () => {
  // (10) The endpoint never invokes GovernanceKernel.transition().
  it('(10) does not call GovernanceKernel.transition()', async () => {
    const { h, service, workflowInstanceId, tenantId } = await setupWorkflow('e2e-10');
    const spy = vi.spyOn(h.kernel, 'transition');
    const result = await handleWorkflowDecision(
      deps(service),
      {
        workflowInstanceId,
        stepCode: 'regional_signoff',
        headers: authHeaders(tenantId, '00000000-0000-0000-0000-0000000000aa'),
        body: { decision: 'approve' },
      },
      'req-10',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });

  // (11) Recording decisions (even to full approval) never mutates governance entity_state.
  it('(11) does not mutate governance entity_state', async () => {
    const { h, service, workflowInstanceId, tenantId } = await setupWorkflow('e2e-11');
    const before = h.store.entityStateSnapshots.find((e) => e.entityId === 'e2e-11');
    expect(before?.currentState).toBe('under_review');

    await handleWorkflowDecision(
      deps(service),
      {
        workflowInstanceId,
        stepCode: 'regional_signoff',
        headers: authHeaders(tenantId, '00000000-0000-0000-0000-0000000000bb'),
        body: { decision: 'approve' },
      },
      'req-11a',
      DEMO,
    );
    const final = await handleWorkflowDecision(
      deps(service),
      {
        workflowInstanceId,
        stepCode: 'national_signoff',
        headers: authHeaders(tenantId, '00000000-0000-0000-0000-0000000000cc'),
        body: { decision: 'approve' },
      },
      'req-11b',
      DEMO,
    );
    expect(final.body['workflowStatus']).toBe('approved');

    const after = h.store.entityStateSnapshots.find((e) => e.entityId === 'e2e-11');
    expect(after?.currentState).toBe('under_review');
  });
});

/**
 * Centralized authorization regression: the decision endpoint is gated by the `workflow.decide`
 * action. An authenticated actor lacking that authorization is denied with a 403 that leaks no
 * role/permission/token detail; an actor holding the permission key is allowed.
 */
describe('workflow decision HTTP adapter — centralized authorization', () => {
  // Denies an authenticated actor without workflow.decide (403, no recordDecision call).
  it('denies an actor lacking workflow.decide with 403 and does not call the service', async () => {
    const recorder = new RecordingRecorder(outcome());
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        // Authenticated (tenant + actor) but holds only a read-capable role.
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'reader-1',
          'x-house-actor-role-keys': 'workflow_reader',
        },
        body: { decision: 'approve' },
      },
      'req-authz-deny',
      DEMO,
    );
    expect(result.status).toBe(403);
    expect(result.body['code']).toBe('FORBIDDEN');
    expect(recorder.calls).toHaveLength(0);
    // The public body must not leak role lists, permission keys, or token detail.
    expect(JSON.stringify(result.body)).not.toMatch(/workflow_reader|roleKeys|permissionKeys|token/i);
  });

  // Allows an actor holding the exact workflow.decide permission key.
  it('allows an actor holding the workflow.decide permission key', async () => {
    const recorder = new RecordingRecorder(outcome());
    const result = await handleWorkflowDecision(
      deps(recorder),
      {
        workflowInstanceId: 'wf-1',
        stepCode: 'regional_signoff',
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'reviewer-1',
          'x-house-actor-permission-keys': 'workflow.decide',
        },
        body: { decision: 'approve' },
      },
      'req-authz-allow',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(recorder.calls).toHaveLength(1);
  });
});
