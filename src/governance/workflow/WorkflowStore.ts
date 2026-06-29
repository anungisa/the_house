/**
 * WorkflowStore — persistence port for review workflow READS and DECISION recording.
 *
 * Deliberate scope: this port intentionally has NO standalone "create workflow" method.
 * Workflow instances and steps are created ONLY by the Governance Kernel, inside the same
 * transaction that creates the approval-required transition_request (see GovernanceTx.
 * insertWorkflowInstance / insertWorkflowSteps). That keeps a workflow from ever existing
 * without its governing request (no orphan workflows) and preserves atomicity.
 *
 * This port therefore exposes:
 *  - reads (by transition request id, by instance id, steps of an instance), and
 *  - a tenant-scoped transaction used by {@link WorkflowDecisionService} to lock an instance,
 *    record a single step decision, append the decision audit row, and advance the instance.
 *
 * Recording a decision NEVER mutates governance entity_state and NEVER executes the pending
 * transition — that remains the exclusive job of GovernanceKernel.transition().
 */

import type {
  WorkflowInstanceStatus,
  WorkflowInstanceView,
  WorkflowStepDecision,
  WorkflowStepView,
} from './WorkflowTypes.js';

/** Update applied to a single step when a decision is recorded. */
export interface WorkflowStepDecisionUpdate {
  readonly stepId: string;
  readonly status: 'approved' | 'rejected';
  readonly decidedByUserId: string;
  readonly decidedAt: string;
  readonly decisionReason?: string;
}

/** Append-only decision audit row. */
export interface WorkflowDecisionInsert {
  readonly tenantId: string;
  readonly workflowStepId: string;
  readonly decision: WorkflowStepDecision;
  readonly decidedByUserId: string;
  readonly reason?: string;
}

/** Advance the instance: set aggregate status and the next current step (null clears it). */
export interface WorkflowInstanceProgressUpdate {
  readonly instanceId: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepCode: string | null;
}

/**
 * Transaction-scoped primitives for recording a decision. In PostgreSQL the tenant context
 * (RLS) is applied for the duration of the transaction and the instance row is locked
 * FOR UPDATE so concurrent decisions on the same workflow serialize.
 */
export interface WorkflowTx {
  /** Lock the instance row for update; undefined if it does not exist for this tenant. */
  lockInstance(workflowInstanceId: string): Promise<WorkflowInstanceView | undefined>;

  /** Ordered steps (by step_order) of an instance. */
  getSteps(workflowInstanceId: string): Promise<WorkflowStepView[]>;

  /** Apply the decision outcome to a single step. */
  applyStepDecision(update: WorkflowStepDecisionUpdate): Promise<void>;

  /** Append the immutable decision audit row; returns its id. */
  insertDecision(input: WorkflowDecisionInsert): Promise<string>;

  /** Update the instance aggregate status and current step pointer. */
  updateInstanceProgress(update: WorkflowInstanceProgressUpdate): Promise<void>;
}

export interface WorkflowStore {
  /** Read the workflow instance bound to an approval-required transition request. */
  getInstanceByTransitionRequestId(
    tenantId: string,
    transitionRequestId: string,
  ): Promise<WorkflowInstanceView | undefined>;

  /** Read a workflow instance by id. */
  getInstance(
    tenantId: string,
    workflowInstanceId: string,
  ): Promise<WorkflowInstanceView | undefined>;

  /** Read the ordered steps of a workflow instance. */
  getSteps(tenantId: string, workflowInstanceId: string): Promise<WorkflowStepView[]>;

  /** Run `fn` inside a tenant-scoped transaction (RLS applied; instance locked by the caller). */
  runInTransaction<T>(tenantId: string, fn: (tx: WorkflowTx) => Promise<T>): Promise<T>;
}
