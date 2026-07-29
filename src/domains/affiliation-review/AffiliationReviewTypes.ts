import type { ScopeType } from '../../governance/types/TransitionTypes.js';

export interface AffiliationReviewerActor {
  readonly userId: string;
  readonly roleKeys: readonly string[];
  readonly scopeType?: ScopeType;
  readonly scopeId?: string;
  readonly organizationId?: string;
  readonly organizationUnitId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;
}

export interface AffiliationReviewQueueFilter {
  readonly seasonId?: string;
  readonly state?: 'submitted' | 'under_review' | 'approved' | 'active';
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

export interface AffiliationReviewRequirement {
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
  readonly requirements: readonly AffiliationReviewRequirement[];
}

export interface StartAffiliationReviewInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly actor: AffiliationReviewerActor;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
}
