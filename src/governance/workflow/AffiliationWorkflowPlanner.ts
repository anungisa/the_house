/**
 * AffiliationApplication v1 two-tier review workflow plan.
 *
 * Approval-required AffiliationApplication transitions (approve, reject, suspend, reinstate,
 * revoke) route through a generic two-tier review: REGIONAL review first, then NATIONAL
 * review. Both sign-offs are required by default. This is workflow METADATA only — it does
 * not add lifecycle states and does not execute the pending transition.
 *
 * The vocabulary is intentionally NSO-generic (regional_review / national_review,
 * regional_signoff / national_signoff, regional_reviewer / national_reviewer). Sport profiles
 * (configured OUTSIDE platform core) map their own provincial/territorial and national bodies
 * onto these generic tiers; sport- or organization-specific terms MUST NOT appear here.
 *
 * v1 is static and simple. A future pass may make the plan configurable per tenant/policy.
 */

import { AFFILIATION_APPLICATION_ENTITY_TYPE } from '../../domains/affiliation/index.js';
import type { WorkflowPlanInput, WorkflowPlanner } from './WorkflowPlanner.js';
import type { WorkflowPlan } from './WorkflowTypes.js';

export const AFFILIATION_REVIEW_WORKFLOW_TYPE = 'affiliation_two_tier_review';

export const AFFILIATION_REGIONAL_STEP_CODE = 'regional_signoff';
export const AFFILIATION_NATIONAL_STEP_CODE = 'national_signoff';

export const AFFILIATION_REGIONAL_REVIEWER_ROLE = 'regional_reviewer';
export const AFFILIATION_NATIONAL_REVIEWER_ROLE = 'national_reviewer';

/** The static v1 two-tier plan (regional sign-off -> national sign-off). */
function affiliationTwoTierPlan(): WorkflowPlan {
  return {
    workflowType: AFFILIATION_REVIEW_WORKFLOW_TYPE,
    steps: [
      {
        stepCode: AFFILIATION_REGIONAL_STEP_CODE,
        stepOrder: 1,
        reviewTier: 'regional_review',
        required: true,
        assignedRoleKey: AFFILIATION_REGIONAL_REVIEWER_ROLE,
      },
      {
        stepCode: AFFILIATION_NATIONAL_STEP_CODE,
        stepOrder: 2,
        reviewTier: 'national_review',
        required: true,
        assignedRoleKey: AFFILIATION_NATIONAL_REVIEWER_ROLE,
      },
    ],
  };
}

/**
 * Planner that returns the static two-tier review plan for AffiliationApplication entities.
 * The kernel only invokes this for approval-required transitions, so every approval-required
 * AffiliationApplication trigger (approve/reject/suspend/reinstate/revoke) gets the same
 * regional -> national review. Other entity types get no workflow (undefined).
 */
export class AffiliationWorkflowPlanner implements WorkflowPlanner {
  planFor(input: WorkflowPlanInput): WorkflowPlan | undefined {
    if (input.entityType !== AFFILIATION_APPLICATION_ENTITY_TYPE) {
      return undefined;
    }
    return affiliationTwoTierPlan();
  }
}
