/**
 * ApprovedWorkflowExecutionService — resolves an approved review workflow to its governing
 * transition request and drives the GOVERNED execution of that request's original pending
 * transition through the Governance Kernel.
 *
 * Hard boundaries (by design):
 *  - It NEVER mutates governance entity_state itself.
 *  - It NEVER records workflow decisions and is NEVER called from the decision endpoint.
 *  - It performs NO lifecycle logic of its own: the kernel owns the actual execution
 *    (policy re-resolution, permission re-check, guard re-run, journal/audit/evidence/outbox,
 *    and marking the request consumed) atomically in one transaction.
 *
 * This service's only job is the thin coordination step the kernel cannot do alone: map a
 * workflow INSTANCE id (what the execution endpoint addresses) to the TRANSITION REQUEST id
 * the kernel executes, and fail fast on an obviously non-approved/non-existent workflow. The
 * kernel re-verifies the approval atomically, so this lookup is a convenience gate, never the
 * source of truth.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  ExecuteApprovedTransitionResult,
  TransitionActor,
} from '../types/TransitionTypes.js';
import type { WorkflowStore } from './WorkflowStore.js';

/** Minimal kernel port this service depends on (the GovernanceKernel satisfies it). */
export interface ApprovedTransitionExecutor {
  executeApprovedTransitionRequest(input: {
    readonly tenantId: string;
    readonly transitionRequestId: string;
    readonly actor: TransitionActor;
    readonly idempotencyKey: string;
    readonly reason?: string;
    readonly correlationId?: string;
  }): Promise<ExecuteApprovedTransitionResult>;
}

/** Input to execute an approved review workflow's original pending transition. */
export interface ExecuteApprovedWorkflowInput {
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly actor: TransitionActor;
  readonly idempotencyKey: string;
  readonly reason?: string;
  readonly correlationId?: string;
}

export class ApprovedWorkflowExecutionService {
  constructor(
    private readonly kernel: ApprovedTransitionExecutor,
    private readonly workflows: WorkflowStore,
  ) {}

  async execute(input: ExecuteApprovedWorkflowInput): Promise<ExecuteApprovedTransitionResult> {
    if (input.tenantId.trim() === '') {
      throw new AppError(ErrorCode.TENANT_CONTEXT_MISSING, 'tenantId is required.');
    }
    if (input.workflowInstanceId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'workflowInstanceId is required.');
    }
    if (input.actor.actorId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'actor.actorId is required.');
    }
    if (input.idempotencyKey.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'idempotencyKey is required.');
    }

    // Resolve the instance → governing transition request. Fail closed on unknown instance.
    const instance = await this.workflows.getInstance(input.tenantId, input.workflowInstanceId);
    if (instance === undefined) {
      throw new AppError(
        ErrorCode.WORKFLOW_NOT_FOUND,
        `No workflow instance '${input.workflowInstanceId}' for tenant.`,
      );
    }
    // Fast feedback for an obviously non-approved workflow. The kernel re-verifies the
    // approval atomically under a row lock, so this is a convenience gate only.
    if (instance.status !== 'approved') {
      throw new AppError(
        ErrorCode.WORKFLOW_NOT_APPROVED,
        `Review workflow '${input.workflowInstanceId}' is '${instance.status}', not approved.`,
        { details: { status: instance.status } },
      );
    }

    // The kernel owns the governed execution (exactly once).
    return this.kernel.executeApprovedTransitionRequest({
      tenantId: input.tenantId,
      transitionRequestId: instance.transitionRequestId,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    });
  }
}
