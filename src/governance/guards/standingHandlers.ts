/**
 * AffiliationStanding v1 guard handlers.
 *
 * NAMED, READ-ONLY handlers (never dynamic JSON expressions) dependency-injected with a
 * {@link StandingGuardRepository}. They enforce PERSISTED-FACT + CLOCK preconditions only; WHO may
 * act is enforced separately by the {@link StandingPermissionChecker}.
 *
 * Fail-closed semantics (the repository returns false when the standing or a required fact is
 * missing, so each guard denies rather than assumes):
 *  - STANDING_WITHIN_EFFECTIVE_PERIOD passes only when the clock is within `[from, until)`.
 *  - STANDING_TERM_HAS_ENDED passes only when `now >= until`.
 *  - STANDING_RENEWAL_WINDOW_OPEN passes only when `now >= until - graceDays` (binding parameter).
 *
 * PRODUCTION wiring binds the domain's `DomainBackedStandingGuardRepository` (store + clock). The
 * `PayloadBackedStandingGuardRepository` fake is TEST-ONLY.
 */

import type { GuardEvaluationInput, GuardEvaluationResult } from '../types/TransitionTypes.js';
import type { GuardRegistry } from './GuardRegistry.js';
import { STANDING_GUARD_CODES } from './GuardRegistry.js';
import type { StandingGuardRepository } from '../../domains/affiliation-standing/AffiliationStandingGuardRepository.js';

function pass(code: string): GuardEvaluationResult {
  return { guardCode: code, passed: true };
}

function fail(code: string, message: string): GuardEvaluationResult {
  return { guardCode: code, passed: false, message };
}

export function createStandingGuardHandlers(
  repo: StandingGuardRepository,
): Record<
  (typeof STANDING_GUARD_CODES)[number],
  (input: GuardEvaluationInput) => Promise<GuardEvaluationResult>
> {
  return {
    STANDING_WITHIN_EFFECTIVE_PERIOD: async (input) =>
      (await repo.withinEffectivePeriod(input))
        ? pass('STANDING_WITHIN_EFFECTIVE_PERIOD')
        : fail(
            'STANDING_WITHIN_EFFECTIVE_PERIOD',
            'The standing is not within its effective period.',
          ),

    STANDING_TERM_HAS_ENDED: async (input) =>
      (await repo.termHasEnded(input))
        ? pass('STANDING_TERM_HAS_ENDED')
        : fail(
            'STANDING_TERM_HAS_ENDED',
            'The standing term has not yet ended; it cannot lapse.',
          ),

    STANDING_RENEWAL_WINDOW_OPEN: async (input) =>
      (await repo.renewalWindowOpen(input))
        ? pass('STANDING_RENEWAL_WINDOW_OPEN')
        : fail(
            'STANDING_RENEWAL_WINDOW_OPEN',
            'The renewal window is not yet open for this standing.',
          ),
  };
}

/**
 * Register all AffiliationStanding guards on a registry. `repo` is REQUIRED and explicit:
 * production passes `DomainBackedStandingGuardRepository`; tests may pass the fake.
 */
export function registerStandingGuards(
  registry: GuardRegistry,
  repo: StandingGuardRepository,
): void {
  const handlers = createStandingGuardHandlers(repo);
  for (const code of STANDING_GUARD_CODES) {
    registry.registerGuard(code, handlers[code]);
  }
}
