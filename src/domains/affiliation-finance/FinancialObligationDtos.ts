/**
 * AffiliationFinancialObligation domain API boundary — caller-facing DTOs.
 *
 * These DTOs are the ONLY shapes a consumer should construct/consume. They are NSO-generic, are
 * decoupled from the kernel's internal {@link TransitionInput}/{@link TransitionResult}, and never
 * leak raw database rows. The boundary does NOT own lifecycle rules — every governed change is
 * executed by the Governance Kernel; this layer translates a typed request into a kernel call and
 * the kernel result back into a typed response.
 *
 * A single request envelope carries an optional, command-specific `details` object; each service
 * command validates and consumes only the details it needs (fail closed on the rest).
 */

import type { ScopeType } from '../../governance/types/TransitionTypes.js';

/** The acting principal for a governed financial obligation request. `roleKeys` drive the
 *  per-trigger financial authority in `FinancialObligationPermissionChecker`. */
export interface FinancialActorDto {
  readonly userId: string;
  readonly roleKeys?: readonly string[];
  readonly scopeType?: ScopeType;
  readonly scopeId?: string;
  readonly organizationId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;
}

/** `assessObligation` details — the opening obligation record. */
export interface AssessmentDetails {
  readonly affiliationApplicationId: string;
  readonly subjectId: string;
  readonly season: string;
  readonly obligationType: string;
  readonly assessmentBasis: string;
  /** Positive decimal string with ≤ 2 fractional digits. */
  readonly amount: string;
  readonly currency: string;
  /** Whether the obligation blocks affiliation activation (defaults to true when omitted). */
  readonly blocking?: boolean;
}

/** `reviseObligationAssessment` details — a new assessed amount/basis (appends a version). */
export interface RevisionDetails {
  readonly amount: string;
  readonly currency: string;
  readonly assessmentBasis: string;
  readonly revisionReason?: string;
}

/** `acknowledgeObligation` details — an external provider acknowledgement callback. */
export interface ProviderAcknowledgementDetails {
  readonly externalReference: string;
  readonly externalMessageId?: string;
  /** Optional provider-reported amount/currency (informational; not authoritative). */
  readonly amount?: string;
  readonly currency?: string;
}

/** `confirmObligation` details — an accounting-system confirmation with the confirmed amount. */
export interface AccountingConfirmationDetails {
  readonly externalReference: string;
  readonly externalMessageId?: string;
  /** REQUIRED confirmed amount (reconciliation input). */
  readonly amount: string;
  readonly currency: string;
}

/** `waiveObligation` / `exemptObligation` details — an authorized clearance grant. */
export interface ClearanceDetails {
  readonly clearanceReason?: string;
}

/** The union of all command-specific detail shapes carried on a request. */
export type FinancialObligationDetails =
  | AssessmentDetails
  | RevisionDetails
  | ProviderAcknowledgementDetails
  | AccountingConfirmationDetails
  | ClearanceDetails
  | Readonly<Record<string, unknown>>;

/**
 * A request to perform ONE governed AffiliationFinancialObligation transition. The trigger is
 * selected by the named command; callers never pass a raw trigger string.
 */
export interface FinancialObligationTransitionRequest {
  readonly tenantId: string;
  /** The governed entity id = the obligation id (a fresh UUID the caller mints for `assess`). */
  readonly obligationId: string;
  readonly actor: FinancialActorDto;
  /** REQUIRED idempotency key; the service never fabricates one for governed actions. */
  readonly idempotencyKey: string;
  /** Operational reason; required for high-risk triggers (carried as audit metadata). */
  readonly reason?: string;
  /** Command-specific inputs (validated per command). */
  readonly details?: FinancialObligationDetails;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/** Successful (or replayed) governed execution. */
export interface FinancialObligationExecutedResponse {
  readonly status: 'executed';
  readonly obligationId: string;
  readonly fromState?: string;
  readonly toState?: string;
  readonly transitionId?: string;
  readonly auditEventId?: string;
  readonly evidenceObjectId?: string;
  readonly replayed?: boolean;
}

/** Transition accepted but withheld pending approval (no state mutation occurred). */
export interface FinancialObligationApprovalRequiredResponse {
  readonly status: 'approval_required';
  readonly obligationId: string;
  readonly transitionRequestId?: string;
  readonly currentState?: string;
  readonly requestedToState?: string;
  readonly replayed?: boolean;
}

/** Transition denied (permission failure, guard failure, etc.). No state mutation occurred. */
export interface FinancialObligationRejectedResponse {
  readonly status: 'rejected';
  readonly obligationId: string;
  readonly code: string;
  readonly message: string;
  readonly failedGuards?: readonly string[];
}

export type FinancialObligationTransitionResponse =
  | FinancialObligationExecutedResponse
  | FinancialObligationApprovalRequiredResponse
  | FinancialObligationRejectedResponse;
