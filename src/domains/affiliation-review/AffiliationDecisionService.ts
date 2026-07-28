import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AffiliationApplicationService } from '../affiliation/AffiliationApplicationService.js';
import type {
  WorkflowDecisionService,
  WorkflowDetailView,
  WorkflowStore,
} from '../../governance/workflow/index.js';
import type { ApprovedWorkflowExecutionService } from '../../governance/workflow/ApprovedWorkflowExecutionService.js';
import type { AffiliationReviewService } from './AffiliationReviewService.js';
import type { AffiliationReviewerActor } from './AffiliationReviewTypes.js';

export type AffiliationDecisionOutcome = 'approve' | 'reject';

export interface AffiliationDecisionState {
  readonly workflowInstanceId: string;
  readonly outcome: AffiliationDecisionOutcome;
  readonly status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  readonly currentStepCode?: string;
  readonly executable: boolean;
  readonly executed: boolean;
  readonly steps: WorkflowDetailView['steps'];
}

function transitionActor(actor: AffiliationReviewerActor) {
  return {
    userId: actor.userId,
    roleKeys: actor.roleKeys,
    ...(actor.scopeType !== undefined ? { scopeType: actor.scopeType } : {}),
    ...(actor.scopeId !== undefined ? { scopeId: actor.scopeId } : {}),
    ...(actor.organizationId !== undefined ? { organizationId: actor.organizationId } : {}),
    ...(actor.organizationUnitId !== undefined
      ? { organizationUnitId: actor.organizationUnitId }
      : {}),
    ...(actor.nationalOrganizationId !== undefined
      ? { nationalOrganizationId: actor.nationalOrganizationId }
      : {}),
    ...(actor.regionalOrganizationId !== undefined
      ? { regionalOrganizationId: actor.regionalOrganizationId }
      : {}),
    ...(actor.localOrganizationId !== undefined
      ? { localOrganizationId: actor.localOrganizationId }
      : {}),
  };
}

function toState(detail: WorkflowDetailView): AffiliationDecisionState {
  const outcome = detail.instance.requestedToState === 'rejected' ? 'reject' : 'approve';
  return {
    workflowInstanceId: detail.instance.id,
    outcome,
    status: detail.instance.status,
    ...(detail.instance.currentStepCode !== undefined
      ? { currentStepCode: detail.instance.currentStepCode }
      : {}),
    executable: detail.instance.status === 'approved' && !detail.instance.executed,
    executed: detail.instance.executed,
    steps: detail.steps,
  };
}

export class AffiliationDecisionService {
  constructor(
    private readonly reviews: AffiliationReviewService,
    private readonly transitions: AffiliationApplicationService,
    private readonly workflows: WorkflowStore,
    private readonly decisions: WorkflowDecisionService,
    private readonly execution: ApprovedWorkflowExecutionService,
  ) {}

  private async assignedCase(
    tenantId: string,
    actor: AffiliationReviewerActor,
    applicationId: string,
  ) {
    return this.reviews.getCase(tenantId, actor, applicationId);
  }

  async getState(
    tenantId: string,
    actor: AffiliationReviewerActor,
    applicationId: string,
  ): Promise<AffiliationDecisionState | undefined> {
    await this.assignedCase(tenantId, actor, applicationId);
    const list = await this.workflows.listWorkflows(tenantId, {
      entityType: 'AffiliationApplication',
      entityId: applicationId,
      limit: 100,
    });
    const latest = [...list.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latest === undefined) return undefined;
    const detail = await this.workflows.getWorkflowDetail(tenantId, latest.id);
    return detail === undefined ? undefined : toState(detail);
  }

  async propose(input: {
    tenantId: string;
    applicationId: string;
    actor: AffiliationReviewerActor;
    outcome: AffiliationDecisionOutcome;
    reason: string;
    idempotencyKey: string;
  }): Promise<AffiliationDecisionState> {
    const reviewCase = await this.assignedCase(input.tenantId, input.actor, input.applicationId);
    if (input.reason.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'A decision proposal reason is required.');
    }
    const existing = await this.getState(input.tenantId, input.actor, input.applicationId);
    if (existing !== undefined) return existing;
    const request = {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      actor: transitionActor(input.actor),
      context: {
        seasonId: reviewCase.seasonId,
        ...(reviewCase.organizationId !== undefined
          ? { organizationId: reviewCase.organizationId }
          : {}),
      },
      idempotencyKey: input.idempotencyKey,
      reason: input.reason.trim(),
    };
    const result =
      input.outcome === 'approve'
        ? await this.transitions.approveAffiliationApplication(request)
        : await this.transitions.rejectAffiliationApplication(request);
    if (result.status !== 'approval_required' || result.transitionRequestId === undefined) {
      throw new AppError(ErrorCode.AFFILIATION_REVIEW_CONFLICT, 'Decision workflow was not created.');
    }
    const instance = await this.workflows.getInstanceByTransitionRequestId(
      input.tenantId,
      result.transitionRequestId,
    );
    if (instance === undefined) {
      throw new AppError(ErrorCode.CONFIG_ERROR, 'Decision workflow could not be loaded.');
    }
    const detail = await this.workflows.getWorkflowDetail(
      input.tenantId,
      instance.id,
    );
    if (detail === undefined) {
      throw new AppError(ErrorCode.CONFIG_ERROR, 'Decision workflow could not be loaded.');
    }
    return { ...toState(detail), outcome: input.outcome };
  }

  async decide(input: {
    tenantId: string;
    applicationId: string;
    actor: AffiliationReviewerActor;
    workflowInstanceId: string;
    stepCode: string;
    decision: 'approve' | 'reject';
    reason: string;
  }): Promise<AffiliationDecisionState> {
    await this.assignedCase(input.tenantId, input.actor, input.applicationId);
    const detail = await this.workflows.getWorkflowDetail(input.tenantId, input.workflowInstanceId);
    if (detail?.instance.entityId !== input.applicationId) {
      throw new AppError(ErrorCode.WORKFLOW_NOT_FOUND, 'Decision workflow not found.');
    }
    const step = detail.steps.find((candidate) => candidate.stepCode === input.stepCode);
    if (
      step?.assignedRoleKey !== undefined &&
      !input.actor.roleKeys.includes(step.assignedRoleKey) &&
      !input.actor.roleKeys.some((role) => role === 'admin' || role === 'platform_admin')
    ) {
      throw new AppError(ErrorCode.FORBIDDEN, 'The current review tier is not assigned to this actor.');
    }
    await this.decisions.recordDecision({
      tenantId: input.tenantId,
      workflowInstanceId: input.workflowInstanceId,
      stepCode: input.stepCode,
      decision: input.decision,
      actorUserId: input.actor.userId,
      ...(input.reason.trim() !== '' ? { reason: input.reason.trim() } : {}),
    });
    const updated = await this.workflows.getWorkflowDetail(input.tenantId, input.workflowInstanceId);
    if (updated === undefined) throw new AppError(ErrorCode.WORKFLOW_NOT_FOUND, 'Decision workflow not found.');
    return toState(updated);
  }

  async execute(input: {
    tenantId: string;
    applicationId: string;
    actor: AffiliationReviewerActor;
    workflowInstanceId: string;
    idempotencyKey: string;
    reason?: string;
  }): Promise<{ readonly lifecycleState: string; readonly idempotentReplay: boolean }> {
    await this.assignedCase(input.tenantId, input.actor, input.applicationId);
    const detail = await this.workflows.getWorkflowDetail(input.tenantId, input.workflowInstanceId);
    if (detail?.instance.entityId !== input.applicationId) {
      throw new AppError(ErrorCode.WORKFLOW_NOT_FOUND, 'Decision workflow not found.');
    }
    const result = await this.execution.execute({
      tenantId: input.tenantId,
      workflowInstanceId: input.workflowInstanceId,
      actor: {
        actorId: input.actor.userId,
        tenantId: input.tenantId,
        scopeType: input.actor.scopeType ?? 'platform',
        roles: input.actor.roleKeys,
        ...(input.actor.scopeId !== undefined ? { scopeId: input.actor.scopeId } : {}),
        ...(input.actor.organizationId !== undefined
          ? { organizationId: input.actor.organizationId }
          : {}),
        ...(input.actor.organizationUnitId !== undefined
          ? { organizationUnitId: input.actor.organizationUnitId }
          : {}),
        ...(input.actor.nationalOrganizationId !== undefined
          ? { nationalOrganizationId: input.actor.nationalOrganizationId }
          : {}),
        ...(input.actor.regionalOrganizationId !== undefined
          ? { regionalOrganizationId: input.actor.regionalOrganizationId }
          : {}),
        ...(input.actor.localOrganizationId !== undefined
          ? { localOrganizationId: input.actor.localOrganizationId }
          : {}),
      },
      idempotencyKey: input.idempotencyKey,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    return {
      lifecycleState: result.toState,
      idempotentReplay: result.status === 'idempotent_replay',
    };
  }
}
