/**
 * AffiliationApplication v1 guard handlers.
 *
 * Guards are NAMED, READ-ONLY TypeScript handlers (never dynamic JSON expressions).
 * Each handler is dependency-injected with an {@link AffiliationGuardRepository} so the
 * underlying data source can change (DB, services) without touching handler logic.
 *
 * PRODUCTION wiring binds a persistence-backed repository (the affiliation domain's
 * `DomainBackedAffiliationGuardRepository`) so guard outcomes derive from PERSISTED domain
 * facts. {@link PayloadBackedAffiliationGuardRepository} below is a TEST-ONLY FAKE that
 * reads facts from `input.payload.facts`; it must NOT be used in production wiring because
 * it would let callers make guards pass by supplying their own "facts".
 */

import type {
  GuardEvaluationInput,
  GuardEvaluationResult,
} from '../types/TransitionTypes.js';
import type { GuardRegistry } from './GuardRegistry.js';
import { AFFILIATION_GUARD_CODES } from './GuardRegistry.js';

/**
 * Read-only data port used by the affiliation guard handlers. Implementations MUST be
 * side-effect-free. All methods are scoped by the transition input (tenant/entity/actor).
 */
export interface AffiliationGuardRepository {
  hasRequiredFields(input: GuardEvaluationInput): Promise<boolean> | boolean;
  hasRequiredDocuments(input: GuardEvaluationInput): Promise<boolean> | boolean;
  hasOpenComplianceFlags(input: GuardEvaluationInput): Promise<boolean> | boolean;
  feesPaid(input: GuardEvaluationInput): Promise<boolean> | boolean;
  seasonIsCurrent(input: GuardEvaluationInput): Promise<boolean> | boolean;
  actorHasReviewerScope(input: GuardEvaluationInput): Promise<boolean> | boolean;
  /**
   * True when ANOTHER application already holds active standing for the same affiliation
   * subject and season (a uniqueness conflict). The guard FAILS when this is true.
   */
  hasConflictingActiveStanding(input: GuardEvaluationInput): Promise<boolean> | boolean;
}

interface AffiliationFacts {
  readonly requiredFieldsComplete?: boolean;
  readonly requiredDocsPresent?: boolean;
  readonly openComplianceFlags?: boolean;
  readonly feesPaid?: boolean;
  readonly seasonIsCurrent?: boolean;
  readonly conflictingActiveStanding?: boolean;
}

const REVIEWER_ROLES: ReadonlySet<string> = new Set(['reviewer', 'approver', 'admin']);

function readFacts(input: GuardEvaluationInput): AffiliationFacts {
  const payload = input.payload ?? {};
  const facts = (payload as { facts?: unknown }).facts;
  return (facts ?? {}) as AffiliationFacts;
}

/**
 * TEST-ONLY FAKE repository backed by `input.payload.facts`. Do NOT use in production
 * wiring — it treats caller-supplied facts as authoritative, which the persistence-backed
 * repository deliberately does not. Missing facts default to the SAFE (fail-closed)
 * interpretation for each guard.
 */
export class PayloadBackedAffiliationGuardRepository implements AffiliationGuardRepository {
  hasRequiredFields(input: GuardEvaluationInput): boolean {
    return readFacts(input).requiredFieldsComplete === true;
  }
  hasRequiredDocuments(input: GuardEvaluationInput): boolean {
    return readFacts(input).requiredDocsPresent === true;
  }
  hasOpenComplianceFlags(input: GuardEvaluationInput): boolean {
    // Defaults to "no flags" when unspecified; only an explicit true blocks.
    return readFacts(input).openComplianceFlags === true;
  }
  feesPaid(input: GuardEvaluationInput): boolean {
    return readFacts(input).feesPaid === true;
  }
  seasonIsCurrent(input: GuardEvaluationInput): boolean {
    return readFacts(input).seasonIsCurrent === true;
  }
  actorHasReviewerScope(input: GuardEvaluationInput): boolean {
    const roles = input.actor.roles ?? [];
    return roles.some((r) => REVIEWER_ROLES.has(r));
  }
  hasConflictingActiveStanding(input: GuardEvaluationInput): boolean {
    // Defaults to "no conflict" when unspecified; only an explicit true blocks.
    return readFacts(input).conflictingActiveStanding === true;
  }
}

function pass(code: string): GuardEvaluationResult {
  return { guardCode: code, passed: true };
}

function fail(code: string, message: string): GuardEvaluationResult {
  return { guardCode: code, passed: false, message };
}

/**
 * Build the AffiliationApplication guard handlers bound to a repository.
 */
export function createAffiliationGuardHandlers(
  repo: AffiliationGuardRepository,
): Record<(typeof AFFILIATION_GUARD_CODES)[number], (input: GuardEvaluationInput) => Promise<GuardEvaluationResult>> {
  return {
    AFFILIATION_REQUIRED_FIELDS_COMPLETE: async (input) =>
      (await repo.hasRequiredFields(input))
        ? pass('AFFILIATION_REQUIRED_FIELDS_COMPLETE')
        : fail(
            'AFFILIATION_REQUIRED_FIELDS_COMPLETE',
            'Required application fields are incomplete.',
          ),

    AFFILIATION_REQUIRED_DOCS_PRESENT: async (input) =>
      (await repo.hasRequiredDocuments(input))
        ? pass('AFFILIATION_REQUIRED_DOCS_PRESENT')
        : fail(
            'AFFILIATION_REQUIRED_DOCS_PRESENT',
            'Required supporting documents are missing.',
          ),

    AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS: async (input) =>
      (await repo.hasOpenComplianceFlags(input))
        ? fail(
            'AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS',
            'There are unresolved compliance obligations.',
          )
        : pass('AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS'),

    AFFILIATION_FEES_PAID: async (input) =>
      (await repo.feesPaid(input))
        ? pass('AFFILIATION_FEES_PAID')
        : fail('AFFILIATION_FEES_PAID', 'Outstanding payment obligations remain.'),

    SEASON_IS_CURRENT: async (input) =>
      (await repo.seasonIsCurrent(input))
        ? pass('SEASON_IS_CURRENT')
        : fail('SEASON_IS_CURRENT', 'The application does not target the current season.'),

    ACTOR_HAS_REVIEWER_SCOPE: async (input) =>
      (await repo.actorHasReviewerScope(input))
        ? pass('ACTOR_HAS_REVIEWER_SCOPE')
        : fail('ACTOR_HAS_REVIEWER_SCOPE', 'Actor does not hold reviewer scope.'),

    AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE: async (input) =>
      (await repo.hasConflictingActiveStanding(input))
        ? fail(
            'AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE',
            'Another application already holds active standing for this organization scope and season.',
          )
        : pass('AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE'),
  };
}

/**
 * Register all AffiliationApplication guards on a registry.
 *
 * `repo` is REQUIRED and explicit: production callers pass a persistence-backed repository
 * (the affiliation domain's `DomainBackedAffiliationGuardRepository`); tests may pass the
 * {@link PayloadBackedAffiliationGuardRepository} fake.
 */
export function registerAffiliationGuards(
  registry: GuardRegistry,
  repo: AffiliationGuardRepository,
): void {
  const handlers = createAffiliationGuardHandlers(repo);
  for (const code of AFFILIATION_GUARD_CODES) {
    registry.registerGuard(code, handlers[code]);
  }
}
