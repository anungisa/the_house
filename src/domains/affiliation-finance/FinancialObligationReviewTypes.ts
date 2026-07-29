import type { ScopeType } from '../../governance/types/TransitionTypes.js';

export interface FinancialReviewerActor {
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
  /** Server-derived action authority; never inferred by the browser from role names. */
  readonly canReconcile: boolean;
  readonly confirmedAmount?: string;
  readonly confirmedCurrency?: string;
}
