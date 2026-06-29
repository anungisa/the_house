/**
 * Workflow decision HTTP DTOs.
 *
 * The workflow decision endpoint is a NARROW metadata surface: a reviewer records an
 * approve/reject decision on the step that is currently awaiting one. Identity (tenant +
 * actor) is ALWAYS carried in the shared `x-house-*` trusted-header contract — the JSON
 * body carries ONLY the decision and an optional reason, never identity. Any `actor`/
 * `tenantId` field in the body is ignored (see WorkflowHttpAdapter).
 *
 * These DTOs are NSO-generic: no sport-specific fields. The response is a stable projection
 * of {@link WorkflowDecisionOutcome}; raw database rows are never exposed.
 */

import type {
  WorkflowInstanceStatus,
  WorkflowStepDecision,
} from '../../governance/workflow/WorkflowTypes.js';

/** A parsed workflow decision request, already routed by the transport. */
export interface WorkflowDecisionHttpRequest {
  /** Path parameter: the workflow instance id. Authoritative over any body value. */
  readonly workflowInstanceId: string;
  /** Path parameter: the step code being decided (e.g. 'regional_signoff'). */
  readonly stepCode: string;
  /** Header map with lowercased names (native Node http lowercases header keys). */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Parsed JSON body: `{ decision, reason? }`. Identity in the body is ignored. */
  readonly body: unknown;
}

/** The stable JSON response body for a recorded decision. */
export type WorkflowDecisionResponseBody = {
  readonly status: 'recorded';
  readonly workflowInstanceId: string;
  /** Aggregate workflow status AFTER the decision (pending | approved | rejected | cancelled). */
  readonly workflowStatus: WorkflowInstanceStatus;
  /** The next step awaiting a decision, or null when the workflow is fully resolved. */
  readonly currentStepCode: string | null;
  /** The step code that was just decided. */
  readonly decidedStepCode: string;
  /** The decision that was recorded. */
  readonly decision: WorkflowStepDecision;
  readonly requestId: string;
};
