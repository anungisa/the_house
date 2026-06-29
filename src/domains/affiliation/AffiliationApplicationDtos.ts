/**
 * AffiliationApplication domain API boundary — caller-facing DTOs.
 *
 * These DTOs are the ONLY shapes a consumer should construct/consume. They are:
 *  - NSO-generic (no ptsoId/clubId/curlerId/bonspielId — curling terms live in sport
 *    profiles, fixtures, or examples only),
 *  - decoupled from the kernel's internal {@link TransitionInput}/{@link TransitionResult}
 *    types (the mapper translates between them), and
 *  - free of raw database rows (the boundary never leaks `entity_state`/audit rows).
 *
 * The boundary does NOT own lifecycle rules. Every governed change is executed by the
 * Governance Kernel; this layer only translates a typed request into a kernel call and a
 * kernel result back into a typed response.
 */

import type { ScopeType } from '../../governance/types/TransitionTypes.js';

/**
 * The acting principal for a governed AffiliationApplication request.
 *
 * `roleKeys` feed the kernel permission check (mapped to the kernel actor's `roles`).
 * `permissionKeys` are forward-compat for a real RBAC {@link PermissionChecker}; v1's
 * default checker uses roles only, so permission keys are carried as opaque workflow
 * metadata until a richer checker consumes them.
 */
export interface AffiliationActorDto {
  readonly userId: string;
  readonly roleKeys?: readonly string[];
  readonly permissionKeys?: readonly string[];

  /** Generic organizational scope (defaults to 'platform' when omitted). */
  readonly scopeType?: ScopeType;
  readonly scopeId?: string;

  /** Optional NSO-generic hierarchy references. */
  readonly organizationId?: string;
  readonly organizationUnitId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;
}

/**
 * Ambient context for a governed AffiliationApplication request. `seasonId` is an
 * NSO-generic temporal scope used by guards/idempotency suggestions and carried to the
 * kernel as opaque workflow metadata (the v1 FSM has no season state).
 */
export interface AffiliationContextDto {
  readonly seasonId: string;

  readonly scopeType?: ScopeType;
  readonly scopeId?: string;

  readonly organizationId?: string;
  readonly organizationUnitId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;

  /** Distributed-tracing / lineage identifiers, propagated to the kernel + outbox. */
  readonly correlationId?: string;
  readonly causationId?: string;
}

/**
 * A request to perform ONE governed AffiliationApplication transition.
 *
 * The trigger is selected by the named command (see {@link AFFILIATION_APPLICATION_COMMANDS});
 * callers never pass a raw trigger string.
 */
export interface AffiliationApplicationTransitionRequest {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly actor: AffiliationActorDto;
  readonly context: AffiliationContextDto;

  /**
   * REQUIRED idempotency key. The service does NOT silently generate one for governed
   * actions — callers own deterministic idempotency. See {@link suggestIdempotencyKey}
   * for the recommended deterministic shape.
   */
  readonly idempotencyKey: string;

  /** Operational reason; required for high-risk triggers (carried as audit metadata). */
  readonly reason?: string;

  /**
   * @deprecated Guard outcomes are now derived from PERSISTED affiliation domain state
   * (see `DomainBackedAffiliationGuardRepository` and `affiliation.*` tables), NOT from
   * caller-supplied facts. This field is retained only for the test-only
   * `PayloadBackedAffiliationGuardRepository` fake and is ignored by production wiring.
   * It will be removed once the payload bridge is fully retired.
   */
  readonly facts?: Readonly<Record<string, unknown>>;

  /** Optional opaque domain payload merged into the kernel payload. */
  readonly payload?: Readonly<Record<string, unknown>>;
}

/** Successful (or replayed) governed execution. */
export interface AffiliationApplicationExecutedResponse {
  readonly status: 'executed';
  readonly applicationId: string;
  readonly fromState?: string;
  readonly toState?: string;
  /** Present for a fresh execution; omitted on idempotent replay (kernel does not re-surface it). */
  readonly transitionId?: string;
  /** Present for a fresh execution; omitted on idempotent replay. */
  readonly auditEventId?: string;
  /** Present when the executed transition required evidence. */
  readonly evidenceObjectId?: string;
  /** True when this echoes a prior identical request (idempotent replay). */
  readonly replayed?: boolean;
}

/** Transition accepted but withheld pending approval (no state mutation occurred). */
export interface AffiliationApplicationApprovalRequiredResponse {
  readonly status: 'approval_required';
  readonly applicationId: string;
  readonly transitionRequestId?: string;
  /** Not available in v1 (no workflow engine wired). Reserved for a future pass. */
  readonly workflowInstanceId?: string;
  readonly currentState?: string;
  readonly requestedToState?: string;
  readonly replayed?: boolean;
}

/** Transition denied (permission failure, guard failure, etc.). No state mutation occurred. */
export interface AffiliationApplicationRejectedResponse {
  readonly status: 'rejected';
  readonly applicationId: string;
  readonly code: string;
  readonly message: string;
  /** Guard codes that failed, when the rejection was guard-driven. */
  readonly failedGuards?: readonly string[];
}

export type AffiliationApplicationTransitionResponse =
  | AffiliationApplicationExecutedResponse
  | AffiliationApplicationApprovalRequiredResponse
  | AffiliationApplicationRejectedResponse;
