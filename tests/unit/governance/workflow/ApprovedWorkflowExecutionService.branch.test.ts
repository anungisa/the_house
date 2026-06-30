import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../../../src/shared/errors/AppError.js';
import {
  ApprovedWorkflowExecutionService,
  type ApprovedTransitionExecutor,
  type ExecuteApprovedWorkflowInput,
} from '../../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import type { WorkflowStore } from '../../../../src/governance/workflow/WorkflowStore.js';
import type {
  WorkflowInstanceStatus,
  WorkflowInstanceView,
} from '../../../../src/governance/workflow/WorkflowTypes.js';
import type { ExecuteApprovedTransitionResult } from '../../../../src/governance/types/TransitionTypes.js';

/**
 * Branch-coverage sweep for the THIN coordinator ApprovedWorkflowExecutionService.
 *
 * The governed execution itself (policy re-resolution, permission re-check, guard re-run,
 * journal/audit/evidence/outbox) is owned by the kernel and exercised by
 * ApprovedWorkflowExecution.test.ts. This file pins the service's OWN decision branches —
 * input validation, instance resolution, the non-approved fast gate, and the optional
 * reason/correlationId pass-through — without a kernel or DB.
 */

const TENANT = '11111111-1111-1111-1111-111111111111';
const INSTANCE = 'wf-1';
const REQUEST = 'req-1';

/** Canned kernel result the executor returns for the success/pass-through cases. */
function executorResult(): ExecuteApprovedTransitionResult {
  return {
    status: 'executed',
    transitionRequestId: REQUEST,
    entityType: 'AffiliationApplication',
    entityId: 'app-1',
    trigger: 'approve',
    fromState: 'under_review',
    toState: 'approved',
    stateTransitionId: 'st-1',
    idempotencyKey: 'exec-1',
  };
}

/** A spying executor that records the exact input forwarded by the service. */
function spyExecutor(): {
  executor: ApprovedTransitionExecutor;
  calls: Array<Parameters<ApprovedTransitionExecutor['executeApprovedTransitionRequest']>[0]>;
} {
  const calls: Array<
    Parameters<ApprovedTransitionExecutor['executeApprovedTransitionRequest']>[0]
  > = [];
  const executor: ApprovedTransitionExecutor = {
    executeApprovedTransitionRequest: async (input) => {
      calls.push(input);
      return executorResult();
    },
  };
  return { executor, calls };
}

/**
 * Minimal WorkflowStore fake exposing only getInstance (the single method the service uses).
 * Any other method indicates an unexpected coupling and fails the test loudly.
 */
function fakeWorkflowStore(instance: WorkflowInstanceView | undefined): WorkflowStore {
  const unused = (name: string) => (): never => {
    throw new Error(`WorkflowStore.${name} must not be called by the execution service`);
  };
  return {
    getInstance: async (tenantId: string, workflowInstanceId: string) =>
      tenantId === TENANT && workflowInstanceId === INSTANCE ? instance : undefined,
    getInstanceByTransitionRequestId: unused('getInstanceByTransitionRequestId'),
    getSteps: unused('getSteps'),
    listWorkflows: unused('listWorkflows'),
    getWorkflowDetail: unused('getWorkflowDetail'),
    runInTransaction: unused('runInTransaction'),
  } as unknown as WorkflowStore;
}

function instanceWith(status: WorkflowInstanceStatus): WorkflowInstanceView {
  return {
    id: INSTANCE,
    tenantId: TENANT,
    transitionRequestId: REQUEST,
    entityType: 'AffiliationApplication',
    entityId: 'app-1',
    workflowType: 'affiliation_two_tier',
    status,
  };
}

function baseInput(over: Partial<ExecuteApprovedWorkflowInput> = {}): ExecuteApprovedWorkflowInput {
  return {
    tenantId: TENANT,
    workflowInstanceId: INSTANCE,
    actor: { actorId: 'reviewer-1', tenantId: TENANT, scopeType: 'national_organization' },
    idempotencyKey: 'exec-1',
    ...over,
  };
}

describe('ApprovedWorkflowExecutionService (branch sweep)', () => {
  // ---- input validation (fail closed) ----

  it('rejects a blank tenantId with TENANT_CONTEXT_MISSING', async () => {
    const svc = new ApprovedWorkflowExecutionService(spyExecutor().executor, fakeWorkflowStore(undefined));
    await expect(svc.execute(baseInput({ tenantId: '   ' }))).rejects.toMatchObject({
      code: ErrorCode.TENANT_CONTEXT_MISSING,
    });
  });

  it('rejects a blank workflowInstanceId with INVALID_INPUT', async () => {
    const svc = new ApprovedWorkflowExecutionService(spyExecutor().executor, fakeWorkflowStore(undefined));
    await expect(svc.execute(baseInput({ workflowInstanceId: '' }))).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
  });

  it('rejects a blank actor.actorId with INVALID_INPUT', async () => {
    const svc = new ApprovedWorkflowExecutionService(spyExecutor().executor, fakeWorkflowStore(undefined));
    await expect(
      svc.execute(baseInput({ actor: { actorId: '  ', tenantId: TENANT, scopeType: 'national_organization' } })),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a blank idempotencyKey with INVALID_INPUT', async () => {
    const svc = new ApprovedWorkflowExecutionService(spyExecutor().executor, fakeWorkflowStore(undefined));
    await expect(svc.execute(baseInput({ idempotencyKey: '' }))).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    });
  });

  // ---- instance resolution + fast gate (fail closed) ----

  it('rejects an unknown workflow instance with WORKFLOW_NOT_FOUND (no executor call)', async () => {
    const { executor, calls } = spyExecutor();
    const svc = new ApprovedWorkflowExecutionService(executor, fakeWorkflowStore(undefined));
    await expect(svc.execute(baseInput())).rejects.toMatchObject({
      code: ErrorCode.WORKFLOW_NOT_FOUND,
    });
    expect(calls).toHaveLength(0);
  });

  it.each<WorkflowInstanceStatus>(['pending', 'rejected', 'cancelled'])(
    'rejects a non-approved (%s) instance with WORKFLOW_NOT_APPROVED (no executor call)',
    async (status) => {
      const { executor, calls } = spyExecutor();
      const svc = new ApprovedWorkflowExecutionService(executor, fakeWorkflowStore(instanceWith(status)));
      await expect(svc.execute(baseInput())).rejects.toMatchObject({
        code: ErrorCode.WORKFLOW_NOT_APPROVED,
      });
      expect(calls).toHaveLength(0);
    },
  );

  // ---- delegation + optional pass-through (the happy branches) ----

  it('delegates to the kernel for an approved instance using the resolved transitionRequestId', async () => {
    const { executor, calls } = spyExecutor();
    const svc = new ApprovedWorkflowExecutionService(executor, fakeWorkflowStore(instanceWith('approved')));

    const result = await svc.execute(baseInput());

    expect(result.status).toBe('executed');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      tenantId: TENANT,
      transitionRequestId: REQUEST,
      idempotencyKey: 'exec-1',
    });
    // Optional fields omitted by the caller must NOT be forwarded as undefined keys.
    expect('reason' in calls[0]!).toBe(false);
    expect('correlationId' in calls[0]!).toBe(false);
  });

  it('forwards reason and correlationId only when supplied', async () => {
    const { executor, calls } = spyExecutor();
    const svc = new ApprovedWorkflowExecutionService(executor, fakeWorkflowStore(instanceWith('approved')));

    await svc.execute(baseInput({ reason: 'approved by board', correlationId: 'corr-9' }));

    expect(calls[0]).toMatchObject({ reason: 'approved by board', correlationId: 'corr-9' });
  });
});
