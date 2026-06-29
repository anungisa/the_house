/**
 * WorkflowDecisionService — records a single reviewer decision on a review workflow step and
 * advances the workflow, as METADATA only.
 *
 * Hard boundaries (by design):
 *  - It NEVER mutates governance entity_state.
 *  - It NEVER executes the pending transition and NEVER calls GovernanceKernel.transition().
 *  - It does not approve a lifecycle transition directly. Even when both tiers approve, the
 *    workflow simply becomes `approved`; turning that into an executed transition is a
 *    separate, explicit future pass.
 *
 * Decision semantics (two-tier, generic regional -> national):
 *  - The decision must target the step currently awaiting a decision (instance.currentStepCode).
 *  - approve  -> mark step approved; advance to the next required pending step, or mark the
 *               whole instance `approved` when no further required steps remain.
 *  - reject   -> mark step rejected; mark the whole instance `rejected` (review stops).
 *
 * Fails CLOSED: unknown instance, unknown/closed/out-of-order step, an already-decided
 * workflow, or an invalid decision value all raise an {@link AppError} without writing.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import type { WorkflowStore } from './WorkflowStore.js';
import type {
  WorkflowInstanceStatus,
  WorkflowStepDecision,
} from './WorkflowTypes.js';

const ALLOWED_DECISIONS: ReadonlySet<string> = new Set<WorkflowStepDecision>(['approve', 'reject']);

export interface RecordWorkflowDecisionInput {
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly stepCode: string;
  readonly decision: WorkflowStepDecision;
  readonly actorUserId: string;
  readonly reason?: string;
}

export interface WorkflowDecisionOutcome {
  readonly workflowInstanceId: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepCode?: string;
  readonly decidedStepCode: string;
  readonly decision: WorkflowStepDecision;
}

export class WorkflowDecisionService {
  private readonly store: WorkflowStore;
  private readonly clock: Clock;

  constructor(store: WorkflowStore, deps?: { clock?: Clock }) {
    this.store = store;
    this.clock = deps?.clock ?? systemClock;
  }

  async recordDecision(input: RecordWorkflowDecisionInput): Promise<WorkflowDecisionOutcome> {
    if (input.tenantId.trim() === '') {
      throw new AppError(ErrorCode.TENANT_CONTEXT_MISSING, 'tenantId is required.');
    }
    if (input.workflowInstanceId.trim() === '' || input.stepCode.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'workflowInstanceId and stepCode are required.');
    }
    if (input.actorUserId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'actorUserId is required.');
    }
    if (!ALLOWED_DECISIONS.has(input.decision)) {
      throw new AppError(
        ErrorCode.WORKFLOW_INVALID_DECISION,
        `Invalid workflow decision '${String(input.decision)}'. Allowed: approve, reject.`,
        { details: { decision: input.decision } },
      );
    }

    return this.store.runInTransaction(input.tenantId, async (tx) => {
      const instance = await tx.lockInstance(input.workflowInstanceId);
      if (instance === undefined) {
        throw new AppError(
          ErrorCode.WORKFLOW_NOT_FOUND,
          `No workflow instance '${input.workflowInstanceId}' for tenant.`,
        );
      }
      if (instance.status !== 'pending') {
        throw new AppError(
          ErrorCode.WORKFLOW_ALREADY_DECIDED,
          `Workflow '${input.workflowInstanceId}' is already ${instance.status}.`,
          { details: { status: instance.status } },
        );
      }

      const steps = await tx.getSteps(input.workflowInstanceId);
      const step = steps.find((s) => s.stepCode === input.stepCode);
      if (step === undefined) {
        throw new AppError(
          ErrorCode.WORKFLOW_STEP_UNKNOWN,
          `Unknown workflow step '${input.stepCode}'.`,
          { details: { stepCode: input.stepCode } },
        );
      }
      if (step.status !== 'pending') {
        throw new AppError(
          ErrorCode.WORKFLOW_ALREADY_DECIDED,
          `Workflow step '${input.stepCode}' is already ${step.status}.`,
          { details: { stepCode: input.stepCode, status: step.status } },
        );
      }
      if (instance.currentStepCode !== input.stepCode) {
        throw new AppError(
          ErrorCode.WORKFLOW_STEP_UNKNOWN,
          `Workflow step '${input.stepCode}' is not the step currently awaiting a decision.`,
          { details: { stepCode: input.stepCode, currentStepCode: instance.currentStepCode } },
        );
      }

      const decidedAt = this.clock.nowIso();
      const stepStatus = input.decision === 'approve' ? 'approved' : 'rejected';
      await tx.applyStepDecision({
        stepId: step.id,
        status: stepStatus,
        decidedByUserId: input.actorUserId,
        decidedAt,
        ...(input.reason !== undefined ? { decisionReason: input.reason } : {}),
      });
      await tx.insertDecision({
        tenantId: input.tenantId,
        workflowStepId: step.id,
        decision: input.decision,
        decidedByUserId: input.actorUserId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      });

      let status: WorkflowInstanceStatus;
      let currentStepCode: string | null;
      if (input.decision === 'reject') {
        status = 'rejected';
        currentStepCode = null;
      } else {
        const next = steps
          .filter((s) => s.stepOrder > step.stepOrder && s.required && s.status === 'pending')
          .sort((a, b) => a.stepOrder - b.stepOrder)[0];
        if (next !== undefined) {
          status = 'pending';
          currentStepCode = next.stepCode;
        } else {
          status = 'approved';
          currentStepCode = null;
        }
      }

      await tx.updateInstanceProgress({
        instanceId: input.workflowInstanceId,
        status,
        currentStepCode,
      });

      return {
        workflowInstanceId: input.workflowInstanceId,
        status,
        ...(currentStepCode !== null ? { currentStepCode } : {}),
        decidedStepCode: input.stepCode,
        decision: input.decision,
      };
    });
  }
}
