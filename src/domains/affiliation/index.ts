/**
 * Affiliation domain module (scaffold placeholder).
 *
 * This is the first DOMAIN module and the first consumer of the Governance Kernel.
 *
 * Architectural rule: this module may REQUEST lifecycle transitions through the
 * GovernanceKernel, but it MUST NOT directly mutate governed state/status fields. The
 * kernel owns `entity_state` and the FSM.
 *
 * AffiliationApplication v1 FSM (owned by the kernel, not by this module):
 *   draft        --submit-->        submitted
 *   submitted    --review_start-->  under_review
 *   under_review --approve-->       approved
 *   under_review --reject-->        rejected
 *   approved     --activate-->      active
 *   active       --suspend-->       suspended
 *   suspended    --reinstate-->     active
 *   active       --revoke-->        revoked
 *   suspended    --revoke-->        revoked
 *   revoked      --close-->         closed
 *   rejected     --close-->         closed
 *   closed       --archive-->       archived
 *
 * NSO-generic note: "AffiliationApplication" is a generic platform concept. Curling-
 * specific terms (PTSO/MA/club/curler) do NOT belong here — they map in via the
 * Curling Canada sport profile, fixtures, or examples only.
 *
 * Scaffold scope: this file only declares the entity type constant and the canonical
 * trigger names so the kernel slice and tests share one source of truth. No request
 * orchestration or persistence is implemented yet.
 */

/** Governed entity type handled by this domain module. */
export const AFFILIATION_APPLICATION_ENTITY_TYPE = 'AffiliationApplication';

/** Canonical AffiliationApplication v1 transition triggers (kernel-resolved). */
export const AFFILIATION_TRIGGERS = [
  'submit',
  'review_start',
  'approve',
  'reject',
  'activate',
  'suspend',
  'reinstate',
  'revoke',
  'close',
  'archive',
] as const;

export type AffiliationTrigger = (typeof AFFILIATION_TRIGGERS)[number];

/** High-risk triggers that require evidence metadata (resolved/enforced by the kernel). */
export const AFFILIATION_HIGH_RISK_TRIGGERS: ReadonlySet<AffiliationTrigger> = new Set([
  'approve',
  'reject',
  'suspend',
  'reinstate',
  'revoke',
  'close',
  'archive',
]);
