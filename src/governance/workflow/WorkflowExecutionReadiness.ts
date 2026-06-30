/**
 * Workflow execution READINESS — a pure, read-only operational hint.
 *
 * This computes whether a review workflow is *currently* in a state from which the explicit,
 * governed execution command could proceed. It is a HINT for operators/read surfaces only:
 *
 *  - It NEVER queries governance state, re-runs guards, or locks rows.
 *  - It NEVER asserts execution will definitely succeed — the Governance Kernel re-resolves
 *    policy, re-checks permissions, re-runs guards, and re-verifies the approval atomically
 *    under a row lock at execution time (see ApprovedWorkflowExecutionService + the kernel).
 *  - It NEVER triggers execution. Execution remains the exclusive job of the explicit
 *    POST /v1/workflows/:id/execute path.
 *
 * The input is a derived status: a workflow instance is `pending | approved | rejected |
 * cancelled`, and `executed` is derived by the read layer when the governing transition
 * request has already been consumed (instance stays `approved`, request becomes `executed`).
 */

import type { WorkflowInstanceStatus } from './WorkflowTypes.js';

/** Derived status used to compute readiness (instance status + the consumed/executed marker). */
export type WorkflowExecutionReadinessStatus = WorkflowInstanceStatus | 'executed';

/** Why a workflow is not currently executable. `null` reason ↔ `executable: true`. */
export type WorkflowNotExecutableReason =
  | 'workflow_not_approved'
  | 'workflow_rejected'
  | 'workflow_cancelled'
  | 'workflow_already_executed';

export interface WorkflowExecutionReadiness {
  readonly executable: boolean;
  readonly reason: WorkflowNotExecutableReason | null;
}

/**
 * Compute the execution readiness hint for a derived workflow status. Total over the status
 * union (the exhaustive switch keeps it total at the type level).
 */
export function computeWorkflowExecutionReadiness(
  status: WorkflowExecutionReadinessStatus,
): WorkflowExecutionReadiness {
  switch (status) {
    case 'approved':
      return { executable: true, reason: null };
    case 'pending':
      return { executable: false, reason: 'workflow_not_approved' };
    case 'rejected':
      return { executable: false, reason: 'workflow_rejected' };
    case 'cancelled':
      return { executable: false, reason: 'workflow_cancelled' };
    case 'executed':
      return { executable: false, reason: 'workflow_already_executed' };
  }
}

/**
 * Derive the readiness status from a workflow instance status and the governing transition
 * request's executed marker. An already-executed request reports `executed` even though the
 * instance itself stays `approved`.
 */
export function deriveReadinessStatus(
  instanceStatus: WorkflowInstanceStatus,
  executed: boolean,
): WorkflowExecutionReadinessStatus {
  if (executed && instanceStatus === 'approved') return 'executed';
  return instanceStatus;
}
