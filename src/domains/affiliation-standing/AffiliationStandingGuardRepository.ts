/**
 * AffiliationStanding guard repository.
 *
 * The standing guards enforce PERSISTED-FACT + CLOCK preconditions only (never caller payload).
 * Authority (who may act) is enforced separately by the {@link StandingPermissionChecker}. Three
 * guards gate the time-bounded lifecycle, all derived from the standing's stored effective period
 * evaluated against an injected {@link Clock}:
 *  - STANDING_WITHIN_EFFECTIVE_PERIOD : now ∈ [effectiveFrom, effectiveUntil) — activation/reinstate.
 *  - STANDING_TERM_HAS_ENDED          : now ≥ effectiveUntil — expiry.
 *  - STANDING_RENEWAL_WINDOW_OPEN     : now ≥ effectiveUntil − graceDays — early renewal of an
 *                                       active standing (graceDays from the binding parameters).
 *
 * The production {@link DomainBackedStandingGuardRepository} reads an {@link AffiliationStandingStore}
 * plus a clock; the {@link PayloadBackedStandingGuardRepository} is a TEST-ONLY fake reading
 * `payload.facts`. Both fail CLOSED (false) when the standing / a required fact is missing.
 */

import type { GuardEvaluationInput } from '../../governance/types/TransitionTypes.js';
import type { Clock } from '../../shared/time/clock.js';
import { systemClock } from '../../shared/time/clock.js';
import type { AffiliationStandingStore } from './AffiliationStandingStore.js';

/** Default renewal grace window (days) when a binding omits `graceDays`. */
const DEFAULT_RENEWAL_GRACE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Read-only data port used by the standing guard handlers. Implementations MUST be
 * side-effect-free and tenant-scoped, and MUST fail CLOSED when facts are missing.
 */
export interface StandingGuardRepository {
  /** True when the clock is within the current effective period `[from, until)`. */
  withinEffectivePeriod(input: GuardEvaluationInput): Promise<boolean> | boolean;
  /** True when the current effective period has ended (`now >= until`). */
  termHasEnded(input: GuardEvaluationInput): Promise<boolean> | boolean;
  /** True when the renewal grace window is open (`now >= until - graceDays`). */
  renewalWindowOpen(input: GuardEvaluationInput): Promise<boolean> | boolean;
}

/** Read `graceDays` from the per-binding parameters; fall back to the default when absent/invalid. */
function graceDaysOf(input: GuardEvaluationInput): number {
  const raw = input.parameters['graceDays'];
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? raw
    : DEFAULT_RENEWAL_GRACE_DAYS;
}

export class DomainBackedStandingGuardRepository implements StandingGuardRepository {
  constructor(
    private readonly store: AffiliationStandingStore,
    private readonly clock: Clock = systemClock,
  ) {}

  async withinEffectivePeriod(input: GuardEvaluationInput): Promise<boolean> {
    const head = await this.store.getStanding(input.context.tenantId, input.entityId);
    if (head === undefined) return false;
    const now = this.clock.now();
    return now >= Date.parse(head.effectiveFrom) && now < Date.parse(head.effectiveUntil);
  }

  async termHasEnded(input: GuardEvaluationInput): Promise<boolean> {
    const head = await this.store.getStanding(input.context.tenantId, input.entityId);
    if (head === undefined) return false;
    return this.clock.now() >= Date.parse(head.effectiveUntil);
  }

  async renewalWindowOpen(input: GuardEvaluationInput): Promise<boolean> {
    const head = await this.store.getStanding(input.context.tenantId, input.entityId);
    if (head === undefined) return false;
    const windowOpensAt = Date.parse(head.effectiveUntil) - graceDaysOf(input) * MS_PER_DAY;
    return this.clock.now() >= windowOpensAt;
  }
}

interface StandingFacts {
  readonly withinEffectivePeriod?: boolean;
  readonly termHasEnded?: boolean;
  readonly renewalWindowOpen?: boolean;
}

function readFacts(input: GuardEvaluationInput): StandingFacts {
  const payload = input.payload ?? {};
  const facts = (payload as { facts?: unknown }).facts;
  return (facts ?? {}) as StandingFacts;
}

/**
 * TEST-ONLY fake backed by `payload.facts`. Do NOT use in production wiring — it treats
 * caller-supplied facts as authoritative. Missing facts default to the fail-closed interpretation.
 */
export class PayloadBackedStandingGuardRepository implements StandingGuardRepository {
  withinEffectivePeriod(input: GuardEvaluationInput): boolean {
    return readFacts(input).withinEffectivePeriod === true;
  }
  termHasEnded(input: GuardEvaluationInput): boolean {
    return readFacts(input).termHasEnded === true;
  }
  renewalWindowOpen(input: GuardEvaluationInput): boolean {
    return readFacts(input).renewalWindowOpen === true;
  }
}
