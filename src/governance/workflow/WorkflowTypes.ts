/**
 * Two-tier review WORKFLOW METADATA types.
 *
 * These types model multi-step review routing (regional review -> national review) as
 * METADATA attached to an approval-required governance transition request. They do NOT
 * introduce lifecycle states: the AffiliationApplication v1 FSM is unchanged. Review tiers,
 * reviewer decisions, and required sign-offs are recorded here, around the transition
 * request, and never mutate governed entity_state.
 *
 * NSO-GENERIC: review tiers use the generic vocabulary regional_review -> national_review.
 * Sport- or organization-specific terminology MUST NOT appear here — sport profiles map their
 * own provincial/territorial and national bodies onto these generic tiers outside platform core.
 */

/** Generic review tier. Sport profiles map their own bodies onto these. */
export type WorkflowReviewTier = 'regional_review' | 'national_review';

/** Aggregate review outcome of a workflow instance. */
export type WorkflowInstanceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** Per-step review status. */
export type WorkflowStepStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

/** A reviewer's decision on a single step. */
export type WorkflowStepDecision = 'approve' | 'reject';

// -----------------------------------------------------------------------------
// Plan types (produced by a WorkflowPlanner; consumed by the kernel at creation)
// -----------------------------------------------------------------------------

/** A single planned review step (ordered). */
export interface WorkflowStepPlan {
  readonly stepCode: string;
  readonly stepOrder: number;
  readonly reviewTier: WorkflowReviewTier;
  readonly required: boolean;
  readonly assignedScopeType?: string;
  readonly assignedScopeId?: string;
  readonly assignedRoleKey?: string;
}

/** A workflow plan: an ordered set of review steps under a named workflow type. */
export interface WorkflowPlan {
  readonly workflowType: string;
  readonly steps: readonly WorkflowStepPlan[];
}

// -----------------------------------------------------------------------------
// Write inputs (kernel-side creation, via GovernanceTx)
// -----------------------------------------------------------------------------

export interface WorkflowInstanceInsert {
  readonly tenantId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  /** Step code of the first step awaiting a decision (undefined for an empty plan). */
  readonly currentStepCode?: string;
}

export interface WorkflowStepInsert {
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly stepCode: string;
  readonly stepOrder: number;
  readonly reviewTier: WorkflowReviewTier;
  readonly required: boolean;
  readonly assignedScopeType?: string;
  readonly assignedScopeId?: string;
  readonly assignedRoleKey?: string;
}

// -----------------------------------------------------------------------------
// Read views (returned by WorkflowStore reads — immutable snapshots)
// -----------------------------------------------------------------------------

export interface WorkflowInstanceView {
  readonly id: string;
  readonly tenantId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepCode?: string;
}

export interface WorkflowStepView {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly stepCode: string;
  readonly stepOrder: number;
  readonly reviewTier: WorkflowReviewTier;
  readonly required: boolean;
  readonly status: WorkflowStepStatus;
  readonly assignedScopeType?: string;
  readonly assignedScopeId?: string;
  readonly assignedRoleKey?: string;
  readonly decidedByUserId?: string;
  readonly decidedAt?: string;
  readonly decisionReason?: string;
}

/**
 * Admin/operator read summary for a workflow instance. Adds creation/update timestamps and the
 * `executed` marker (derived from the governing transition request) on top of the base instance
 * fields. Returned by list and embedded in detail reads.
 */
export interface WorkflowInstanceSummaryView {
  readonly id: string;
  readonly tenantId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepCode?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Lifecycle state requested by the governing transition. */
  readonly requestedToState?: string;
  /** Whether the governing transition request has already been consumed/executed. */
  readonly executed: boolean;
}

/** Full admin/operator read view: instance summary plus its ordered steps. */
export interface WorkflowDetailView {
  readonly instance: WorkflowInstanceSummaryView;
  readonly steps: readonly WorkflowStepView[];
}

// -----------------------------------------------------------------------------
// In-memory record types (mutable backing for InMemoryWorkflowStore / kernel tx).
// Shared with InMemoryGovernanceStore so kernel-created workflows are visible to the
// decision service in unit tests (mirrors the outbox sharing pattern).
// -----------------------------------------------------------------------------

export interface WorkflowInstanceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  status: WorkflowInstanceStatus;
  currentStepCode: string | undefined;
  readonly createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly stepCode: string;
  readonly stepOrder: number;
  readonly reviewTier: WorkflowReviewTier;
  readonly required: boolean;
  status: WorkflowStepStatus;
  assignedScopeType: string | undefined;
  assignedScopeId: string | undefined;
  assignedRoleKey: string | undefined;
  decidedByUserId: string | undefined;
  decidedAt: string | undefined;
  decisionReason: string | undefined;
}

export interface WorkflowDecisionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowStepId: string;
  readonly decision: WorkflowStepDecision;
  readonly decidedByUserId: string;
  readonly reason: string | undefined;
  readonly createdAt: string;
}

/** Backing arrays for the in-memory workflow store (shared with the governance store). */
export interface WorkflowBacking {
  instances: WorkflowInstanceRecord[];
  steps: WorkflowStepRecord[];
  decisions: WorkflowDecisionRecord[];
}
