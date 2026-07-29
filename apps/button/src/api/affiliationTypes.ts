/**
 * Representative-safe affiliation DRAFT types consumed by the Button frontend (Slice C).
 *
 * These mirror the server's `/v1/button/affiliation` DTOs EXACTLY
 * (`AffiliationApplicationProjection`, `AffiliationOverview`, `RequirementView`, ...). The browser
 * is a consumer only: it never asserts completeness, applicability, or acceptance — every field is
 * derived and re-authorized server-side. The concurrency token accompanies every projection and
 * MUST be echoed as `If-Match` on the next draft write (optimistic concurrency).
 */

/** The bounded set of response controls a requirement can use (mirrors the catalog). */
export type RequirementResponseType =
  | 'acknowledgement'
  | 'short_text'
  | 'long_text'
  | 'structured_contact'
  | 'document_reference'
  | 'confirmation';

/** Per-requirement working posture. `complete` is the server's satisfied determination. */
export type RequirementStatus =
  | 'blocked'
  | 'not_started'
  | 'in_progress'
  | 'evidence_required'
  | 'answered'
  | 'evidence_associated';

/** The lifecycle status a representative may see (pre-submission is always `draft`). */
export type AffiliationLifecycleStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'rejected'
  | 'revoked'
  | 'closed'
  | 'archived';

/** A representative-safe reference to an associated evidence payload (never bytes / storage path). */
export interface DraftEvidenceLinkView {
  readonly linkId: string;
  readonly requirementCode: string;
  readonly evidenceObjectId: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly displayName?: string;
  readonly associatedAt: string;
}

/** One bound requirement projected for the representative, with its version, response, and status. */
export interface RequirementView {
  readonly code: string;
  readonly version: number;
  readonly responseType: RequirementResponseType;
  readonly evidenceRequired: boolean;
  readonly titleEn: string;
  readonly guidanceEn: string;
  readonly titleFr: string;
  readonly guidanceFr: string;
  readonly appliesBecause: string;
  readonly response: Record<string, unknown>;
  readonly evidence: readonly DraftEvidenceLinkView[];
  readonly status: RequirementStatus;
  readonly complete: boolean;
  readonly blockedBy: readonly string[];
}

/** Server-derived completeness summary for the whole application. */
export interface CompletenessSummary {
  readonly totalApplicable: number;
  readonly completedCount: number;
  readonly unresolvedBlockers: readonly string[];
  readonly requiredNextActions: readonly string[];
  readonly eligibleForSubmission: boolean;
}

/** Full representative-safe projection of one application returned by the detail endpoint. */
export interface AffiliationApplicationProjection {
  readonly applicationId: string;
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway: string;
  readonly lifecycleStatus: AffiliationLifecycleStatus;
  readonly concurrencyToken: string;
  readonly lastSavedAt: string;
  readonly requirements: readonly RequirementView[];
  readonly completeness: CompletenessSummary;
}

/** Overview shown before opening a specific application (begin vs resume). */
export interface AffiliationOverview {
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway: string;
  readonly application: {
    readonly applicationId: string;
    readonly lifecycleStatus: AffiliationLifecycleStatus;
    readonly lastSavedAt: string;
    readonly completeness: CompletenessSummary;
  } | null;
  readonly canInitiate: boolean;
}

/** A single response the representative wants to persist for a requirement. */
export interface DraftResponseInput {
  readonly requirementCode: string;
  readonly value: Record<string, unknown>;
}

/** Immutable representative-safe acknowledgement of a submission command. */
export interface SubmissionReceipt {
  readonly receiptId: string;
  readonly applicationId: string;
  readonly sequence: number;
  readonly sourceDraftVersion: number;
  readonly submittedAt: string;
  readonly submittedBy: string;
  readonly stateTransitionId?: string;
  readonly idempotencyKey: string;
}

export interface AffiliationReviewQueueItem {
  readonly applicationId: string;
  readonly organizationId?: string;
  readonly seasonId: string;
  readonly pathway?: string;
  readonly lifecycleState: 'submitted' | 'under_review' | 'approved' | 'active';
  readonly submittedAt: string;
  readonly submissionSequence: number;
  readonly assignedReviewerUserId?: string;
  readonly assignedAt?: string;
}

export interface AffiliationReviewCase {
  readonly applicationId: string;
  readonly organizationId?: string;
  readonly seasonId: string;
  readonly pathway?: string;
  readonly lifecycleState: 'under_review' | 'approved' | 'active';
  readonly submissionSequence: number;
  readonly submittedAt: string;
  readonly assignedReviewerUserId: string;
  readonly requirements: readonly {
    readonly code: string;
    readonly version: number;
    readonly titleEn: string;
    readonly titleFr: string;
    readonly guidanceEn: string;
    readonly guidanceFr: string;
    readonly appliesBecause: string;
    readonly response: Readonly<Record<string, unknown>>;
    readonly evidence: readonly {
      readonly evidenceObjectId: string;
      readonly contentType: string;
      readonly displayName?: string;
    }[];
  }[];
}

export interface AffiliationDecisionState {
  readonly workflowInstanceId: string;
  readonly outcome: 'approve' | 'reject';
  readonly status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  readonly currentStepCode?: string;
  readonly executable: boolean;
  readonly executed: boolean;
  readonly steps: readonly {
    readonly stepCode: string;
    readonly stepOrder: number;
    readonly reviewTier: 'regional_review' | 'national_review';
    readonly required: boolean;
    readonly status: 'pending' | 'approved' | 'rejected' | 'skipped';
    readonly assignedRoleKey?: string;
    readonly decidedByUserId?: string;
    readonly decidedAt?: string;
    readonly decisionReason?: string;
  }[];
}

export interface CorrectionReason {
  readonly requirementCode: string;
  readonly reason: string;
}

export interface CorrectionRequestView {
  readonly correctionRequestId: string;
  readonly applicationId: string;
  readonly status: 'open' | 'resolved' | 'withdrawn';
  readonly requirementCodes: readonly string[];
  readonly reasons: readonly CorrectionReason[];
  readonly openedAt: string;
}

export interface AffiliationSubmissionState {
  readonly receipts: readonly SubmissionReceipt[];
  readonly openCorrection?: CorrectionRequestView;
}

export interface FinancialObligationQueueItem {
  readonly obligationId: string;
  readonly affiliationApplicationId: string;
  readonly season: string;
  readonly obligationType: string;
  readonly assessmentBasis: string;
  readonly assessmentVersion: number;
  readonly assessedAmount: string;
  readonly currency: string;
  readonly blocking: boolean;
  readonly lifecycleState: string;
  readonly hasAccountingConfirmation: boolean;
  readonly canReconcile: boolean;
  readonly confirmedAmount?: string;
  readonly confirmedCurrency?: string;
}

export interface FinancialReconciliationResult {
  readonly obligationId: string;
  readonly toState?: string;
  readonly replayed?: boolean;
}

/** Stable, non-leaking error categories the affiliation UI can branch on. */
export type AffiliationErrorCategory =
  | 'unauthenticated'
  | 'access-denied'
  | 'not-found'
  | 'invalid-input'
  | 'evidence-invalid'
  | 'version-conflict'
  | 'service-unavailable';

/** A sanitized affiliation error surfaced to the UI. NEVER carries stack traces or internal detail. */
export class AffiliationApiError extends Error {
  constructor(
    readonly category: AffiliationErrorCategory,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'AffiliationApiError';
  }
}
