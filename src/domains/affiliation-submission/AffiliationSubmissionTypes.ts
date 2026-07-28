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
  readonly resolvedAt?: string;
}

export interface AffiliationSubmissionStateView {
  readonly receipts: readonly SubmissionReceipt[];
  readonly openCorrection?: CorrectionRequestView;
}

export interface SubmitAffiliationInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly expectedDraftVersion: number;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
  readonly actorRoleKeys: readonly string[];
  readonly seasonId: string;
  readonly organizationId: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export interface OpenCorrectionInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly reviewerUserId: string;
  readonly reviewerRoleKeys: readonly string[];
  readonly reviewerScopeId?: string;
  readonly reviewerOrganizationId?: string;
  readonly reviewerOrganizationUnitId?: string;
  readonly reviewerNationalOrganizationId?: string;
  readonly reviewerRegionalOrganizationId?: string;
  readonly reviewerLocalOrganizationId?: string;
  readonly reasons: readonly CorrectionReason[];
}

export interface ResubmitCorrectionInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly correctionRequestId: string;
  readonly expectedDraftVersion: number;
  readonly idempotencyKey: string;
  readonly actorUserId: string;
}
