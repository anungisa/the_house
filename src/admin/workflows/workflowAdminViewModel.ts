/**
 * Workflow admin/reviewer surface — pure view-model helpers.
 *
 * These functions are PURE: they take backend projections and return display-ready view
 * models. They perform NO I/O, NO mutation, and NO side effects — in particular they NEVER
 * trigger a decision or an execution. The execute action is enabled SOLELY by the backend's
 * `execution.executable` hint; the UI never infers executability from status on its own and
 * never auto-executes after a final approval.
 *
 * Vocabulary is platform-generic (regional/national review, workflow, application,
 * organization). No sport-specific or organization-specific terms appear here.
 */

import type {
  WorkflowDetail,
  WorkflowExecutionHint,
  WorkflowInstanceStatus,
  WorkflowListPage,
  WorkflowStep,
  WorkflowSummary,
} from './workflowAdminTypes.js';

/** A human label for an aggregate workflow status. */
export function workflowStatusLabel(status: WorkflowInstanceStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending review';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

/** A human label for a review tier code. */
export function reviewTierLabel(tier: WorkflowStep['reviewTier']): string {
  switch (tier) {
    case 'regional_review':
      return 'Regional review';
    case 'national_review':
      return 'National review';
    default:
      return tier;
  }
}

/** A human, action-oriented label for the execution-readiness hint. */
export function executionReadinessLabel(execution: WorkflowExecutionHint): string {
  if (execution.executable) return 'Ready to execute';
  switch (execution.reason) {
    case 'workflow_not_approved':
      return 'Not ready — review not complete';
    case 'workflow_rejected':
      return 'Not executable — workflow rejected';
    case 'workflow_cancelled':
      return 'Not executable — workflow cancelled';
    case 'workflow_already_executed':
      return 'Already executed';
    default:
      return 'Not executable';
  }
}

/** Return the steps sorted by `stepOrder` ascending (a defensive copy; input is untouched). */
export function orderSteps(detail: WorkflowDetail): readonly WorkflowStep[] {
  return [...detail.steps].sort((a, b) => a.stepOrder - b.stepOrder);
}

/**
 * The single step currently awaiting a decision: the earliest (by `stepOrder`) step whose
 * status is `pending`, but ONLY while the workflow as a whole is still `pending`. Returns null
 * when the workflow is resolved (approved/rejected/cancelled) or no pending step exists.
 */
export function getCurrentActionableStep(detail: WorkflowDetail): WorkflowStep | null {
  if (detail.workflowStatus !== 'pending') return null;
  for (const step of orderSteps(detail)) {
    if (step.status === 'pending') return step;
  }
  return null;
}

/**
 * Whether a given step may be decided now. A step is decidable only when it is the current
 * actionable step. When `actorRoleKeys` is supplied AND the step is assigned to a role, the
 * actor must hold that role; when the step has no assigned role, role is not checked here
 * (the backend remains authoritative and re-checks authorization on the decision call).
 */
export function canDecideStep(
  detail: WorkflowDetail,
  step: WorkflowStep,
  actorRoleKeys?: readonly string[],
): boolean {
  const actionable = getCurrentActionableStep(detail);
  if (actionable === null || actionable.stepCode !== step.stepCode) return false;
  if (actorRoleKeys !== undefined && step.assignedRoleKey !== null) {
    return actorRoleKeys.includes(step.assignedRoleKey);
  }
  return true;
}

/**
 * Whether the explicit execute action may be enabled. This defers ENTIRELY to the backend's
 * `execution.executable` hint — the UI never infers executability and never auto-executes.
 */
export function canExecuteWorkflow(detail: WorkflowDetail): boolean {
  return detail.execution.executable === true;
}

/** The step code the UI should target for the next decision, or null when none is actionable. */
export function decisionTargetStepCode(detail: WorkflowDetail): string | null {
  return getCurrentActionableStep(detail)?.stepCode ?? null;
}

/** A display-ready row for the workflow list. */
export interface WorkflowListRowView {
  readonly workflowInstanceId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  readonly status: WorkflowInstanceStatus;
  readonly statusLabel: string;
  readonly currentStepCode: string | null;
  readonly executionLabel: string;
  readonly isPending: boolean;
  readonly isExecutable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A display-ready list view: rows plus the next-page cursor. */
export interface WorkflowListView {
  readonly rows: readonly WorkflowListRowView[];
  readonly nextCursor: string | null;
  readonly isEmpty: boolean;
}

function toRowView(summary: WorkflowSummary): WorkflowListRowView {
  return {
    workflowInstanceId: summary.workflowInstanceId,
    entityType: summary.entityType,
    entityId: summary.entityId,
    workflowType: summary.workflowType,
    status: summary.status,
    statusLabel: workflowStatusLabel(summary.status),
    currentStepCode: summary.currentStepCode,
    executionLabel: executionReadinessLabel(summary.execution),
    isPending: summary.status === 'pending',
    isExecutable: summary.execution.executable === true,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}

/** Build the display-ready list view from a list page. Pure; no side effects. */
export function buildWorkflowListView(page: WorkflowListPage): WorkflowListView {
  const rows = page.items.map(toRowView);
  return { rows, nextCursor: page.nextCursor, isEmpty: rows.length === 0 };
}

/** A display-ready step row for the detail view. */
export interface WorkflowStepView {
  readonly stepCode: string;
  readonly stepOrder: number;
  readonly reviewTierLabel: string;
  readonly required: boolean;
  readonly status: WorkflowStep['status'];
  readonly assignedRoleKey: string | null;
  readonly decidedByUserId: string | null;
  readonly decidedAt: string | null;
  readonly decisionReason: string | null;
  readonly isActionable: boolean;
}

/** A display-ready detail view: ordered steps, the actionable step, and action availability. */
export interface WorkflowDetailView {
  readonly workflowInstanceId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  readonly status: WorkflowInstanceStatus;
  readonly statusLabel: string;
  readonly steps: readonly WorkflowStepView[];
  readonly actionableStepCode: string | null;
  readonly canExecute: boolean;
  readonly executionLabel: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Build the display-ready detail view from a workflow detail. Steps are returned in order, the
 * current actionable step is flagged, and `canExecute` mirrors the backend hint EXACTLY. This
 * is a pure projection — building a view NEVER executes anything.
 */
export function buildWorkflowDetailView(detail: WorkflowDetail): WorkflowDetailView {
  const actionableStepCode = decisionTargetStepCode(detail);
  const steps: WorkflowStepView[] = orderSteps(detail).map((s) => ({
    stepCode: s.stepCode,
    stepOrder: s.stepOrder,
    reviewTierLabel: reviewTierLabel(s.reviewTier),
    required: s.required,
    status: s.status,
    assignedRoleKey: s.assignedRoleKey,
    decidedByUserId: s.decidedByUserId,
    decidedAt: s.decidedAt,
    decisionReason: s.decisionReason,
    isActionable: actionableStepCode !== null && s.stepCode === actionableStepCode,
  }));
  return {
    workflowInstanceId: detail.workflowInstanceId,
    entityType: detail.entityType,
    entityId: detail.entityId,
    workflowType: detail.workflowType,
    status: detail.workflowStatus,
    statusLabel: workflowStatusLabel(detail.workflowStatus),
    steps,
    actionableStepCode,
    canExecute: canExecuteWorkflow(detail),
    executionLabel: executionReadinessLabel(detail.execution),
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}
