/**
 * Workflow admin/reviewer surface — wire types and client contracts.
 *
 * These are the stable, NSO-generic projections that the admin/reviewer UI consumes from the
 * existing workflow HTTP APIs:
 *   - GET  /v1/workflows
 *   - GET  /v1/workflows/:workflowInstanceId
 *   - POST /v1/workflows/:workflowInstanceId/steps/:stepCode/decision
 *   - POST /v1/workflows/:workflowInstanceId/execute
 *
 * They are DELIBERATELY self-contained: the admin surface is a CLIENT of the backend over
 * HTTP and never imports backend modules, never reaches the database, and never invents
 * workflow status. The backend remains the single source of workflow truth. The vocabulary is
 * platform-generic (regional/national review, workflow, application, organization) — no
 * sport-specific or organization-specific terms appear here.
 */

/** Aggregate workflow lifecycle status, exactly as reported by the backend. */
export type WorkflowInstanceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** The two generic review tiers a step can belong to. */
export type WorkflowReviewTier = 'regional_review' | 'national_review';

/** Per-step status, exactly as reported by the backend. */
export type WorkflowStepStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

/** A decision a reviewer may record on the step currently awaiting one. */
export type WorkflowStepDecision = 'approve' | 'reject';

/** Why a workflow is not currently executable (null when it is). */
export type WorkflowNotExecutableReason =
  | 'workflow_not_approved'
  | 'workflow_rejected'
  | 'workflow_cancelled'
  | 'workflow_already_executed';

/**
 * The execution-readiness HINT embedded in read responses. It is advisory only: the backend
 * re-verifies approval, re-runs guards, and re-checks permissions atomically at execution
 * time. The UI must treat `executable` as the ONLY gate for enabling the execute action and
 * must never infer executability from status by itself.
 */
export interface WorkflowExecutionHint {
  readonly executable: boolean;
  readonly reason: WorkflowNotExecutableReason | null;
}

/** A workflow summary row in a list response. */
export interface WorkflowSummary {
  readonly workflowInstanceId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly execution: WorkflowExecutionHint;
}

/** A single ordered review step in a detail response. */
export interface WorkflowStep {
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

/** A single workflow with its ordered steps and an execution-readiness hint. */
export interface WorkflowDetail {
  readonly workflowInstanceId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly workflowType: string;
  readonly workflowStatus: WorkflowInstanceStatus;
  readonly currentStepCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly steps: readonly WorkflowStep[];
  readonly execution: WorkflowExecutionHint;
}

/** Optional filters for the workflow list. All combine with AND on the backend. */
export interface WorkflowListFilters {
  readonly status?: WorkflowInstanceStatus;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly reviewTier?: WorkflowReviewTier;
  readonly assignedRoleKey?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

/** A page of workflow summaries plus the opaque cursor for the next page (or null). */
export interface WorkflowListPage {
  readonly items: readonly WorkflowSummary[];
  readonly nextCursor: string | null;
}

/** The outcome of recording a decision, as projected by the backend. */
export interface WorkflowDecisionResult {
  readonly workflowInstanceId: string;
  readonly workflowStatus: WorkflowInstanceStatus;
  readonly currentStepCode: string | null;
  readonly decidedStepCode: string;
  readonly decision: WorkflowStepDecision;
}

/** The outcome of executing an approved workflow's pending transition. */
export interface WorkflowExecutionResult {
  readonly workflowInstanceId: string;
  readonly transitionRequestId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly toState: string;
  readonly stateTransitionId: string | null;
  /** True when this response replays a prior identical execution (same idempotency key). */
  readonly idempotentReplay: boolean;
}

/**
 * Centralized result envelope. Every client call resolves to either a success carrying typed
 * data or a structured failure carrying the backend's stable error code + message. The client
 * NEVER throws for non-2xx responses; callers branch on `ok`.
 */
export interface ApiSuccess<T> {
  readonly ok: true;
  readonly data: T;
  /** The backend request id, when the response carried one (for support/correlation). */
  readonly requestId: string | null;
}

export interface ApiFailure {
  readonly ok: false;
  readonly status: number;
  /** The backend's stable error code (e.g. WORKFLOW_NOT_APPROVED), or a transport fallback. */
  readonly code: string;
  /** A safe, human-readable message suitable for display. */
  readonly message: string;
  readonly requestId: string | null;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/** A minimal HTTP response shape. The global `fetch` Response satisfies this structurally. */
export interface HttpResponseLike {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  readonly headers: { get(name: string): string | null };
}

/** A minimal request init. Compatible with the global `fetch` RequestInit. */
export interface HttpRequestInit {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
}

/** The injectable transport. Defaults to the runtime's global `fetch`. */
export type FetchLike = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

/**
 * Supplies request authorization headers (e.g. `{ Authorization: 'Bearer …' }` for Entra, or
 * the `x-house-*` trusted headers in local dev). The client never hardcodes credentials and
 * never logs them — deployments inject this provider.
 */
export type AuthHeaderProvider = () =>
  | Record<string, string>
  | Promise<Record<string, string>>;

/** A single structured log event. It carries NO credentials and NO bearer tokens. */
export interface WorkflowAdminLogEvent {
  readonly method: string;
  readonly path: string;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string | null;
}

/** A minimal logger. Implementations MUST NOT receive or record tokens. */
export interface WorkflowAdminLogger {
  log(event: WorkflowAdminLogEvent): void;
}

/** Configuration for {@link WorkflowAdminClient}. */
export interface WorkflowAdminClientConfig {
  /** Base URL of the API, e.g. `https://api.example.org` or `http://127.0.0.1:3100`. */
  readonly baseUrl: string;
  /** Transport override (tests inject a fake). Defaults to the runtime global `fetch`. */
  readonly fetch?: FetchLike;
  /** Supplies auth headers per request. Defaults to no auth (the backend then fails closed). */
  readonly authHeaderProvider?: AuthHeaderProvider;
  /** Generates an idempotency key for execution when the caller does not supply one. */
  readonly generateIdempotencyKey?: () => string;
  /** Optional structured logger (never receives tokens). */
  readonly logger?: WorkflowAdminLogger;
}

/** Options for the explicit execute action. */
export interface ExecuteWorkflowOptions {
  /** Optional human reason recorded with the execution. */
  readonly reason?: string;
  /** Optional caller-supplied idempotency key; one is generated when omitted. */
  readonly idempotencyKey?: string;
}
