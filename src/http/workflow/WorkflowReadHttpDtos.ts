/**
 * Workflow admin/operator READ DTOs.
 *
 * The workflow admin read surface lets an authorized operator (1) list review work and
 * (2) inspect a single workflow. These DTOs are stable, NSO-generic projections — they never
 * expose raw database rows and carry no sport-specific vocabulary. Identity (tenant + actor)
 * is ALWAYS carried in the shared `x-house-*` trusted-header contract; query/path inputs never
 * carry identity, and any tenantId in the query is ignored (tenant comes from auth only).
 *
 * The embedded `execution` block is an operational HINT only (see WorkflowExecutionReadiness):
 * it never triggers execution and never guarantees a future execute call will succeed.
 */

import type {
  WorkflowInstanceStatus,
  WorkflowReviewTier,
  WorkflowStepStatus,
} from '../../governance/workflow/WorkflowTypes.js';
import type { WorkflowNotExecutableReason } from '../../governance/workflow/WorkflowExecutionReadiness.js';

/** A parsed list request: header identity + raw query parameters (already routed). */
export interface WorkflowListHttpRequest {
  /** Header map with lowercased names (native Node http lowercases header keys). */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Raw query parameters (string values). Validated by the adapter; identity is ignored. */
  readonly query: Readonly<Record<string, string | undefined>>;
}

/** A parsed detail request: the workflow instance id from the path + header identity. */
export interface WorkflowDetailHttpRequest {
  /** Path parameter: the workflow instance id. */
  readonly workflowInstanceId: string;
  /** Header map with lowercased names. */
  readonly headers: Readonly<Record<string, string | undefined>>;
}

/** Operational execution-readiness hint embedded in read responses. */
export interface WorkflowExecutionHintDto {
  /** Whether the workflow is currently in a state from which execution could proceed. */
  readonly executable: boolean;
  /** Why it is not executable, or null when executable. */
  readonly reason: WorkflowNotExecutableReason | null;
}

/** A single workflow summary row in a list response. */
export interface WorkflowSummaryDto {
  readonly workflowInstanceId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly execution: WorkflowExecutionHintDto;
}

/** The stable JSON body for a workflow list response. */
export type WorkflowListResponseBody = {
  readonly status: 'ok';
  readonly items: readonly WorkflowSummaryDto[];
  /** Opaque cursor for the next page, or null when the result set is exhausted. */
  readonly nextCursor: string | null;
  readonly requestId: string;
};

/** A single step in a detail response. */
export interface WorkflowStepDto {
  readonly stepCode: string;
  readonly stepOrder: number;
  readonly reviewTier: WorkflowReviewTier;
  readonly required: boolean;
  readonly status: WorkflowStepStatus;
  readonly assignedRoleKey: string | null;
  readonly decidedByUserId: string | null;
  readonly decidedAt: string | null;
  readonly decisionReason: string | null;
}

/** The stable JSON body for a workflow detail response. */
export type WorkflowDetailResponseBody = {
  readonly status: 'ok';
  readonly workflowInstanceId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  readonly workflowStatus: WorkflowInstanceStatus;
  readonly currentStepCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly steps: readonly WorkflowStepDto[];
  readonly execution: WorkflowExecutionHintDto;
  readonly requestId: string;
};
