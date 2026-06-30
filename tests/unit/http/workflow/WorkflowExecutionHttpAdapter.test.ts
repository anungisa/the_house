import { describe, expect, it, vi } from 'vitest';

import {
  handleWorkflowExecution,
  workflowExecutionErrorToHttpResult,
  type WorkflowExecutionHttpDeps,
  type WorkflowTransitionExecutor,
} from '../../../../src/http/workflow/WorkflowExecutionHttpAdapter.js';
import { ApprovedWorkflowExecutionService } from '../../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import type {
  ExecuteApprovedWorkflowInput,
} from '../../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import type { ExecuteApprovedTransitionResult } from '../../../../src/governance/types/TransitionTypes.js';
import {
  AffiliationWorkflowPlanner,
  AFFILIATION_NATIONAL_STEP_CODE,
  AFFILIATION_REGIONAL_STEP_CODE,
} from '../../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import { InMemoryWorkflowStore } from '../../../../src/governance/workflow/InMemoryWorkflowStore.js';
import { WorkflowDecisionService } from '../../../../src/governance/workflow/WorkflowDecisionService.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { AppError, ErrorCode } from '../../../../src/shared/errors/AppError.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import {
  buildKernelHarness,
  makeInput,
  sequentialIds,
  type KernelHarness,
} from '../../../helpers/affiliationKernel.js';

/**
 * Unit tests for the workflow EXECUTION HTTP adapter
 * (src/http/workflow/WorkflowExecutionHttpAdapter.ts).
 *
 * Protocol-pure: the handler is called directly with parsed request shapes. Identity is
 * carried in the shared `x-house-*` trusted-header contract; the idempotency key comes from
 * the `Idempotency-Key` header (or body). NO database, NO Docker, NO real Azure. The two e2e
 * cases additionally prove that executing is an EXPLICIT step — never a side effect of
 * recording a decision.
 */

const DEMO = new DemoAuthContextResolver();

/** A recording fake that captures the single execute call and returns a fixed result. */
class RecordingExecutor implements WorkflowTransitionExecutor {
  public readonly calls: ExecuteApprovedWorkflowInput[] = [];
  constructor(private readonly result: ExecuteApprovedTransitionResult) {}
  execute(input: ExecuteApprovedWorkflowInput): Promise<ExecuteApprovedTransitionResult> {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }
}

/** A fake executor that always throws the supplied AppError (for error-mapping cases). */
class ThrowingExecutor implements WorkflowTransitionExecutor {
  constructor(private readonly err: AppError) {}
  execute(): Promise<ExecuteApprovedTransitionResult> {
    return Promise.reject(this.err);
  }
}

function deps(executor: WorkflowTransitionExecutor): WorkflowExecutionHttpDeps {
  return { executor };
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

function executedResult(
  over: Partial<ExecuteApprovedTransitionResult> = {},
): ExecuteApprovedTransitionResult {
  return {
    status: 'executed',
    transitionRequestId: 'tr-1',
    entityType: 'AffiliationApplication',
    entityId: 'app-1',
    trigger: 'approve',
    fromState: 'under_review',
    toState: 'approved',
    stateTransitionId: 'st-1',
    idempotencyKey: 'exec-1',
    ...over,
  };
}

describe('workflow execution HTTP adapter', () => {
  // (1) A valid execute calls the executor exactly once with identity + idempotency key.
  it('(1) executes and calls the executor once with the resolved identity', async () => {
    const executor = new RecordingExecutor(executedResult());
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: authHeaders('tenant-a', 'reviewer-1', { 'idempotency-key': 'exec-1' }),
        body: {},
      },
      'req-1',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      status: 'executed',
      workflowInstanceId: 'wf-1',
      transitionRequestId: 'tr-1',
      toState: 'approved',
      idempotentReplay: false,
      requestId: 'req-1',
    });
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]).toMatchObject({
      tenantId: 'tenant-a',
      workflowInstanceId: 'wf-1',
      idempotencyKey: 'exec-1',
    });
    expect(executor.calls[0]?.actor.actorId).toBe('reviewer-1');
  });

  // (2) An idempotent replay result surfaces idempotentReplay=true (still HTTP 200).
  it('(2) surfaces idempotentReplay=true for a replayed execution', async () => {
    const executor = new RecordingExecutor(executedResult({ status: 'idempotent_replay' }));
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: authHeaders('tenant-a', 'reviewer-1', { 'idempotency-key': 'exec-1' }),
        body: {},
      },
      'req-2',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(result.body['idempotentReplay']).toBe(true);
  });

  // (3) The idempotency key may come from the body when no header is present.
  it('(3) accepts the idempotency key from the body', async () => {
    const executor = new RecordingExecutor(executedResult());
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: authHeaders('tenant-a', 'reviewer-1'),
        body: { idempotencyKey: 'body-key' },
      },
      'req-3',
      DEMO,
    );
    expect(result.status).toBe(200);
    expect(executor.calls[0]?.idempotencyKey).toBe('body-key');
  });

  // (4) A missing idempotency key (no header, no body) fails closed with 400.
  it('(4) rejects a missing idempotency key', async () => {
    const executor = new RecordingExecutor(executedResult());
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: authHeaders('tenant-a', 'reviewer-1'),
        body: {},
      },
      'req-4',
      DEMO,
    );
    expect(result.status).toBe(400);
    expect(result.body['code']).toBe(ErrorCode.INVALID_INPUT);
    expect(executor.calls).toHaveLength(0);
  });

  // (5) A conflicting header vs body idempotency key fails closed with 400.
  it('(5) rejects a header/body idempotency-key mismatch', async () => {
    const executor = new RecordingExecutor(executedResult());
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: authHeaders('tenant-a', 'reviewer-1', { 'idempotency-key': 'h' }),
        body: { idempotencyKey: 'b' },
      },
      'req-5',
      DEMO,
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  // (6) A missing tenant identity is rejected at the edge with 401.
  it('(6) rejects a missing tenant identity with 401', async () => {
    const executor = new RecordingExecutor(executedResult());
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: { 'x-house-actor-user-id': 'reviewer-1', 'idempotency-key': 'exec-1' },
        body: {},
      },
      'req-6',
      DEMO,
    );
    expect(result.status).toBe(401);
    expect(executor.calls).toHaveLength(0);
  });

  // (7) A body that is not a JSON object is rejected with 400.
  it('(7) rejects a non-object body', async () => {
    const executor = new RecordingExecutor(executedResult());
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: authHeaders('tenant-a', 'reviewer-1', { 'idempotency-key': 'exec-1' }),
        body: [] as unknown as Record<string, unknown>,
      },
      'req-7',
      DEMO,
    );
    expect(result.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  // (8) A not-approved workflow maps to 409.
  it('(8) maps WORKFLOW_NOT_APPROVED to 409', async () => {
    const executor = new ThrowingExecutor(
      new AppError(ErrorCode.WORKFLOW_NOT_APPROVED, 'not approved'),
    );
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: authHeaders('tenant-a', 'reviewer-1', { 'idempotency-key': 'exec-1' }),
        body: {},
      },
      'req-8',
      DEMO,
    );
    expect(result.status).toBe(409);
    expect(result.body['code']).toBe(ErrorCode.WORKFLOW_NOT_APPROVED);
  });

  // (9) An unknown workflow instance maps to 404.
  it('(9) maps WORKFLOW_NOT_FOUND to 404', async () => {
    const executor = new ThrowingExecutor(new AppError(ErrorCode.WORKFLOW_NOT_FOUND, 'missing'));
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'missing',
        headers: authHeaders('tenant-a', 'reviewer-1', { 'idempotency-key': 'exec-1' }),
        body: {},
      },
      'req-9',
      DEMO,
    );
    expect(result.status).toBe(404);
  });

  // (10) A different idempotency key after execution maps to 409 (conflict).
  it('(10) maps IDEMPOTENCY_CONFLICT to 409', async () => {
    const executor = new ThrowingExecutor(
      new AppError(ErrorCode.IDEMPOTENCY_CONFLICT, 'already executed'),
    );
    const result = await handleWorkflowExecution(
      deps(executor),
      {
        workflowInstanceId: 'wf-1',
        headers: authHeaders('tenant-a', 'reviewer-1', { 'idempotency-key': 'exec-2' }),
        body: {},
      },
      'req-10',
      DEMO,
    );
    expect(result.status).toBe(409);
  });

  // (11) An unexpected (non-AppError) failure collapses to an opaque 500.
  it('(11) maps an unexpected error to an opaque 500', () => {
    const result = workflowExecutionErrorToHttpResult(new Error('boom'), 'req-11');
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ status: 'error', code: 'INTERNAL', requestId: 'req-11' });
  });
});

/** Drive an entity to an approved review workflow and wire the real execution service. */
async function setupApprovedWorkflow(entityId: string) {
  const h: KernelHarness = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
  await h.kernel.transition(makeInput({ entityId, trigger: 'submit', idempotencyKey: 's' }));
  await h.kernel.transition(makeInput({ entityId, trigger: 'review_start', idempotencyKey: 'r' }));
  const approval = await h.kernel.transition(
    makeInput({ entityId, trigger: 'approve', idempotencyKey: 'a' }),
  );
  const wfStore = new InMemoryWorkflowStore(h.store.workflowBacking, sequentialIds('wd'));
  const decisions = new WorkflowDecisionService(wfStore, { clock: fixedClock(1_700_000_100_000) });
  const service = new ApprovedWorkflowExecutionService(h.kernel, wfStore);
  return { h, decisions, service, approval };
}

describe('workflow execution HTTP adapter — end-to-end (no DB)', () => {
  // (12) Executing an approved workflow performs the governed transition (HTTP 200).
  it('(12) executes the approved transition end-to-end', async () => {
    const { h, decisions, service, approval } = await setupApprovedWorkflow('e2e-x12');
    await decisions.recordDecision({
      tenantId: h.tenantId,
      workflowInstanceId: approval.workflowInstanceId!,
      stepCode: AFFILIATION_REGIONAL_STEP_CODE,
      decision: 'approve',
      actorUserId: 'regional-reviewer',
    });
    await decisions.recordDecision({
      tenantId: h.tenantId,
      workflowInstanceId: approval.workflowInstanceId!,
      stepCode: AFFILIATION_NATIONAL_STEP_CODE,
      decision: 'approve',
      actorUserId: 'national-reviewer',
    });

    const result = await handleWorkflowExecution(
      deps(service),
      {
        workflowInstanceId: approval.workflowInstanceId!,
        headers: authHeaders(h.tenantId, 'national-reviewer', { 'idempotency-key': 'exec-e2e-12' }),
        body: {},
      },
      'req-12',
      DEMO,
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'executed', toState: 'approved' });
    expect(h.store.entityStateSnapshots.find((e) => e.entityId === 'e2e-x12')?.currentState).toBe(
      'approved',
    );
  });

  // (13) Executing a not-yet-approved workflow is rejected (409) and never mutates state.
  it('(13) refuses to execute a pending workflow and does not call the decision service', async () => {
    const { h, decisions, service, approval } = await setupApprovedWorkflow('e2e-x13');
    const decisionSpy = vi.spyOn(decisions, 'recordDecision');

    const result = await handleWorkflowExecution(
      deps(service),
      {
        workflowInstanceId: approval.workflowInstanceId!,
        headers: authHeaders(h.tenantId, 'national-reviewer', { 'idempotency-key': 'exec-e2e-13' }),
        body: {},
      },
      'req-13',
      DEMO,
    );

    expect(result.status).toBe(409);
    expect(result.body['code']).toBe(ErrorCode.WORKFLOW_NOT_APPROVED);
    // Execution never records a decision, and state is untouched.
    expect(decisionSpy).not.toHaveBeenCalled();
    expect(h.store.entityStateSnapshots.find((e) => e.entityId === 'e2e-x13')?.currentState).toBe(
      'under_review',
    );
  });
});
