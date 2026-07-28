/**
 * Affiliation Standing domain module — the governed AffiliationStanding lifecycle.
 *
 * This DOMAIN owns the STANDING FACTS of an affiliated subject for a term/season (the effective
 * period, the pathway under which standing was granted or renewed, and the append-only history of
 * renewals, expiries, suspensions, reinstatements, and termination). It does NOT own the governed
 * lifecycle STATE — that lives in `governance.entity_state` and is written EXCLUSIVELY by the
 * Governance Kernel.
 *
 * Architectural rule (identical to every other domain): this module may REQUEST governed
 * transitions through the kernel, but it MUST NOT mutate governed state directly. Its standing
 * facts are persisted by a kernel {@link TransitionDomainEffect} INSIDE the same governed
 * transaction as the state mutation, journal, audit, evidence, and outbox — so a standing write
 * commits/rolls back atomically with the governed transition.
 *
 * The standing FSM enforces the required, non-collapsible distinctions (V12-15):
 *   activation authorized  ≠  active standing established  ≠  active standing MAINTAINED
 *   term ended (expiry)    ≠  standing renewed
 * Standing is a MAINTAINED, TIME-BOUNDED property: an active standing lapses when its effective
 * period ends and is restored only by a governed renewal (continuity or renewal-with-remediation).
 *
 * NSO-GENERIC: `AffiliationStanding` and every field name are sport-agnostic.
 *
 * AffiliationStanding v1 FSM (owned by the kernel, see migration 0014):
 *   (none)     --open-->        pending      (establish standing from an activated application)
 *   pending    --activate-->    active       [guard: STANDING_WITHIN_EFFECTIVE_PERIOD]
 *   active     --expire-->      lapsed       [guard: STANDING_TERM_HAS_ENDED]
 *   lapsed     --renew-->       active       (append a new effective period)
 *   active     --renew_active-> active       [guard: STANDING_RENEWAL_WINDOW_OPEN] (early renewal)
 *   active     --suspend-->     suspended
 *   suspended  --reinstate-->   active       [guard: STANDING_WITHIN_EFFECTIVE_PERIOD]
 *   active     --terminate-->   terminated
 *   suspended  --terminate-->   terminated
 *   lapsed     --terminate-->   terminated
 */

/** Governed entity type handled by this domain module. */
export const AFFILIATION_STANDING_ENTITY_TYPE = 'AffiliationStanding';

/** Canonical AffiliationStanding v1 transition triggers (kernel-resolved). */
export const STANDING_TRIGGERS = [
  'open',
  'activate',
  'expire',
  'renew',
  'renew_active',
  'suspend',
  'reinstate',
  'terminate',
] as const;

export type StandingTrigger = (typeof STANDING_TRIGGERS)[number];

/**
 * High-risk triggers that require evidence metadata (resolved/enforced by the kernel). Only `open`
 * and `activate` are low-risk: `open` is the opening record (established from an already-activated
 * application) and `activate` marks the standing in force within an already-recorded period. Every
 * lifecycle-altering determination (expiry, renewal, suspension, reinstatement, termination) is
 * high-risk and carries immutable evidence.
 */
export const STANDING_HIGH_RISK_TRIGGERS: ReadonlySet<StandingTrigger> = new Set([
  'expire',
  'renew',
  'renew_active',
  'suspend',
  'reinstate',
  'terminate',
]);

/** Governed pathways under which a standing is granted or renewed (V2-07 / V2-13). */
export const STANDING_PATHWAYS: ReadonlySet<string> = new Set([
  'continuity',
  'renewal_with_remediation',
  'new_affiliation',
]);

// ---------------------------------------------------------------------------------------
// Public boundary re-exports.
// ---------------------------------------------------------------------------------------

export type {
  AffiliationStandingHead,
  AffiliationStandingStore,
} from './AffiliationStandingStore.js';

export { InMemoryAffiliationStandingStore } from './InMemoryAffiliationStandingStore.js';
export { PgAffiliationStandingStore } from './PgAffiliationStandingStore.js';

export {
  PgAffiliationStandingEffect,
  InMemoryAffiliationStandingEffect,
} from './AffiliationStandingEffect.js';

export {
  DomainBackedStandingGuardRepository,
  PayloadBackedStandingGuardRepository,
  type StandingGuardRepository,
} from './AffiliationStandingGuardRepository.js';

export { AffiliationStandingSerializationResolver } from './AffiliationStandingSerializationResolver.js';

export {
  STANDING_COMMANDS,
  STANDING_COMMAND_NAMES,
  isStandingCommand,
  triggerForStandingCommand,
  type StandingCommand,
} from './AffiliationStandingCommands.js';

export type {
  StandingActorDto,
  StandingTransitionRequest,
  StandingTransitionResponse,
  StandingExecutedResponse,
  StandingApprovalRequiredResponse,
  StandingRejectedResponse,
  OpenStandingDetails,
  RenewStandingDetails,
  StandingDetails,
} from './AffiliationStandingDtos.js';

export {
  validateStandingTransitionRequest,
  suggestStandingIdempotencyKey,
} from './AffiliationStandingErrors.js';

export { toStandingTransitionInput, toStandingResponse } from './AffiliationStandingMapper.js';

export {
  AffiliationStandingService,
  type StandingKernelPort,
} from './AffiliationStandingService.js';
