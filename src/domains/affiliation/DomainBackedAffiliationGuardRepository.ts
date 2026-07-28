/**
 * Domain-backed AffiliationApplication guard repository.
 *
 * Implements the governance {@link AffiliationGuardRepository} port by reading PERSISTED
 * domain facts from an {@link AffiliationApplicationStore}. This supersedes the scaffolding
 * `PayloadBackedAffiliationGuardRepository`: guard outcomes are derived from stored domain
 * state, NOT from caller-supplied `payload.facts`. A caller can no longer make a guard pass
 * by sending facts in the request.
 *
 * Dependency direction: the DOMAIN depends on the governance guard interface (the core),
 * never the reverse. The repository is read-only, performs no writes, calls no external
 * services, evaluates no lifecycle state, and fails CLOSED when facts are missing (the
 * underlying store enforces fail-closed semantics).
 */

import type { AffiliationGuardRepository } from '../../governance/guards/handlers.js';
import type { GuardEvaluationInput } from '../../governance/types/TransitionTypes.js';
import type { AffiliationApplicationStore } from './AffiliationApplicationStore.js';
import type { FinancialClearanceReader } from '../affiliation-finance/FinancialClearanceReader.js';

/** Roles that satisfy reviewer scope (identity concern, not persisted domain data). */
const REVIEWER_ROLES: ReadonlySet<string> = new Set(['reviewer', 'approver', 'admin']);

export class DomainBackedAffiliationGuardRepository implements AffiliationGuardRepository {
  /**
   * @param store persisted affiliation facts.
   * @param financialClearance OPTIONAL cross-domain reader for the AFFILIATION_FINANCIALLY_CLEARED
   *   guard. When absent (e.g. deployments without the finance module), the guard treats the
   *   application as financially cleared — the finance capability opts INTO the activation gate.
   */
  constructor(
    private readonly store: AffiliationApplicationStore,
    private readonly financialClearance?: FinancialClearanceReader,
  ) {}

  hasRequiredFields(input: GuardEvaluationInput): Promise<boolean> {
    return this.store.areRequiredFieldsComplete(input.context.tenantId, input.entityId);
  }

  hasRequiredDocuments(input: GuardEvaluationInput): Promise<boolean> {
    return this.store.areRequiredDocumentsPresent(input.context.tenantId, input.entityId);
  }

  hasOpenComplianceFlags(input: GuardEvaluationInput): Promise<boolean> {
    return this.store.hasOpenComplianceFlags(input.context.tenantId, input.entityId);
  }

  feesPaid(input: GuardEvaluationInput): Promise<boolean> {
    return this.store.isPaymentSatisfied(input.context.tenantId, input.entityId);
  }

  async seasonIsCurrent(input: GuardEvaluationInput): Promise<boolean> {
    // Season currency is derived from the application's PERSISTED season, never the
    // caller. Fail closed when the application (and thus its season) is unknown.
    const facts = await this.store.getApplicationFacts(input.context.tenantId, input.entityId);
    if (facts === undefined) return false;
    return this.store.isSeasonCurrent(input.context.tenantId, facts.seasonId);
  }

  actorHasReviewerScope(input: GuardEvaluationInput): boolean {
    const roles = input.actor.roles ?? [];
    return roles.some((r) => REVIEWER_ROLES.has(r));
  }

  hasConflictingActiveStanding(input: GuardEvaluationInput): Promise<boolean> {
    return this.store.hasConflictingActiveAffiliation(input.context.tenantId, input.entityId);
  }

  async hasUnclearedBlockingFinancialObligation(
    input: GuardEvaluationInput,
  ): Promise<boolean> {
    // Opt-in gate: without a finance reader, there are no financial obligations to clear.
    if (this.financialClearance === undefined) return false;
    return this.financialClearance.hasUnclearedBlockingObligation(
      input.context.tenantId,
      input.entityId,
    );
  }
}
