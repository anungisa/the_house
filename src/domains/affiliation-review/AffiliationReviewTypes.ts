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
  readonly state?: 'submitted' | 'under_review';
}

export interface AffiliationReviewQueueItem {
  readonly applicationId: string;
  readonly organizationId?: string;
  readonly seasonId: string;
  readonly pathway?: string;
  readonly lifecycleState: 'submitted' | 'under_review';
  readonly submittedAt: string;
  readonly submissionSequence: number;
  readonly assignedReviewerUserId?: string;
  readonly assignedAt?: string;
}

export interface StartAffiliationReviewInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly actor: AffiliationReviewerActor;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
}
