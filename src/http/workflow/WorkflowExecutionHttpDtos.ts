/**
 * Workflow execution HTTP DTOs.
 *
 * The workflow execution endpoint runs the ORIGINAL pending transition of an APPROVED review
 * workflow through the Governance Kernel, exactly once. It is a separate, explicit command —
 * never a side effect of recording the final decision.
 *
 * Identity (tenant + actor) is ALWAYS carried in the shared `x-house-*` trusted-header
 * contract; the JSON body carries ONLY an optional reason and an optional idempotency key
 * (the `Idempotency-Key` header is preferred). Any `actor`/`tenantId` in the body is ignored.
 *
 * These DTOs are NSO-generic: no sport-specific fields. The response is a stable projection
 * of the kernel's execution result; raw database rows are never exposed.
 */

/** A parsed workflow execution request, already routed by the transport. */
export interface WorkflowExecutionHttpRequest {
  /** Path parameter: the approved workflow instance id to execute. */
  readonly workflowInstanceId: string;
  /** Header map with lowercased names (native Node http lowercases header keys). */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Parsed JSON body: `{ reason?, idempotencyKey? }`. Identity in the body is ignored. */
  readonly body: unknown;
}

/** The stable JSON response body for an executed (or idempotently replayed) transition. */
export type WorkflowExecutionResponseBody = {
  /** Always 'executed' — the resource has reached its approved target state. */
  readonly status: 'executed';
  readonly workflowInstanceId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly toState: string;
  /** The immutable journal id for the executed transition (present on first execution). */
  readonly stateTransitionId: string | null;
  /** Whether this response reflects a replay of a prior identical execution. */
  readonly idempotentReplay: boolean;
  readonly requestId: string;
};
