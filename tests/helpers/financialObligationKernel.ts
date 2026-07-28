/**
 * Hermetic in-memory harness for the AffiliationFinancialObligation governed slice.
 *
 * Wires a single Governance Kernel that serves BOTH governed entity types (mirroring the
 * production composition root), backed entirely by in-memory stores:
 *  - governance state/journal/audit/evidence/outbox : InMemoryGovernanceStore
 *  - financial facts                                : InMemoryFinancialObligationStore
 *  - financial writes atomic with the transition    : InMemoryFinancialObligationEffect
 *  - reconciliation guards read persisted facts      : DomainBackedFinancialGuardRepository
 *  - segregated financial authority                 : FinancialObligationPermissionChecker
 *  - affiliation activation financial gate          : AFFILIATION_FINANCIALLY_CLEARED guard,
 *                                                      backed by an in-memory clearance reader.
 *
 * Standard affiliation guard facts stay payload-driven (the existing convention); only the
 * financial-clearance fact is derived from persisted governed state, so activation-gate tests
 * exercise the real derivation.
 */

import { GovernanceKernel } from '../../src/governance/kernel/GovernanceKernel.js';
import { GuardRegistry } from '../../src/governance/guards/GuardRegistry.js';
import {
  registerAffiliationGuards,
  PayloadBackedAffiliationGuardRepository,
  type AffiliationGuardRepository,
} from '../../src/governance/guards/handlers.js';
import { registerFinancialObligationGuards } from '../../src/governance/guards/financialHandlers.js';
import { DefaultPermissionChecker } from '../../src/governance/permissions/PermissionChecker.js';
import { FinancialObligationPermissionChecker } from '../../src/governance/permissions/FinancialObligationPermissionChecker.js';
import { InMemoryGovernanceStore } from '../../src/governance/store/InMemoryGovernanceStore.js';
import { InMemoryOutboxStore } from '../../src/governance/outbox/InMemoryOutboxStore.js';
import { buildAffiliationSeed } from '../../src/governance/store/affiliationSeed.js';
import { buildFinancialObligationSeed } from '../../src/governance/store/financialObligationSeed.js';
import { fixedClock } from '../../src/shared/time/clock.js';
import type { IdGenerator } from '../../src/shared/uuid/id.js';
import type {
  EntityStateRow,
  TransitionDomainEffect,
  TransitionSerializationKeyResolver,
} from '../../src/governance/kernel/ports.js';
import type { GuardEvaluationInput } from '../../src/governance/types/TransitionTypes.js';
import {
  AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE,
  DomainBackedFinancialGuardRepository,
  FinancialObligationSerializationResolver,
  FinancialObligationService,
  FINANCIAL_CLEARED_STATES,
  InMemoryFinancialObligationEffect,
  InMemoryFinancialObligationStore,
  type FinancialClearanceReader,
} from '../../src/domains/affiliation-finance/index.js';
import { AFFILIATION_APPLICATION_ENTITY_TYPE } from '../../src/domains/affiliation/index.js';

export const FIN_TENANT_A = '11111111-1111-1111-1111-111111111111';
export const FIN_TENANT_B = '22222222-2222-2222-2222-222222222222';

/** Deterministic, monotonically increasing id generator for tests. */
export function financialSequentialIds(prefix = 'fid'): IdGenerator {
  let n = 0;
  return {
    newId: () => {
      n += 1;
      return `${prefix}-${n.toString().padStart(4, '0')}`;
    },
  };
}

/**
 * In-memory {@link FinancialClearanceReader} for the affiliation activation gate: an application
 * is UNCLEARED when it has a blocking obligation whose governed current state is missing or not
 * in {@link FINANCIAL_CLEARED_STATES}. Mirrors the Pg reader's join over entity_state.
 */
class InMemoryFinancialClearanceReader implements FinancialClearanceReader {
  constructor(
    private readonly gov: InMemoryGovernanceStore,
    private readonly fin: InMemoryFinancialObligationStore,
  ) {}

  hasUnclearedBlockingObligation(
    tenantId: string,
    affiliationApplicationId: string,
  ): Promise<boolean> {
    const blockingIds = this.fin.blockingObligationIdsForApplication(
      tenantId,
      affiliationApplicationId,
    );
    const states = this.gov.entityStateSnapshots;
    const uncleared = blockingIds.some((obligationId) => {
      const st = states.find(
        (s) =>
          s.entityType === AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE &&
          s.entityId === obligationId,
      );
      return st === undefined || !FINANCIAL_CLEARED_STATES.has(st.currentState);
    });
    return Promise.resolve(uncleared);
  }
}

/**
 * Affiliation guard repository whose standard facts are payload-driven (test convention) but whose
 * financial-clearance fact is DERIVED from persisted governed state via the clearance reader.
 * Delegates all payload-facts to a {@link PayloadBackedAffiliationGuardRepository}; only the
 * financial-clearance fact consults the reader (which returns a Promise, hence composition rather
 * than subclassing the sync fake).
 */
class ClearanceBackedAffiliationGuardRepository implements AffiliationGuardRepository {
  private readonly base = new PayloadBackedAffiliationGuardRepository();
  constructor(private readonly reader: FinancialClearanceReader) {}

  hasRequiredFields(input: GuardEvaluationInput): boolean {
    return this.base.hasRequiredFields(input);
  }
  hasRequiredDocuments(input: GuardEvaluationInput): boolean {
    return this.base.hasRequiredDocuments(input);
  }
  hasOpenComplianceFlags(input: GuardEvaluationInput): boolean {
    return this.base.hasOpenComplianceFlags(input);
  }
  feesPaid(input: GuardEvaluationInput): boolean {
    return this.base.feesPaid(input);
  }
  seasonIsCurrent(input: GuardEvaluationInput): boolean {
    return this.base.seasonIsCurrent(input);
  }
  actorHasReviewerScope(input: GuardEvaluationInput): boolean {
    return this.base.actorHasReviewerScope(input);
  }
  hasConflictingActiveStanding(input: GuardEvaluationInput): boolean {
    return this.base.hasConflictingActiveStanding(input);
  }
  hasUnclearedBlockingFinancialObligation(input: GuardEvaluationInput): Promise<boolean> {
    return this.reader.hasUnclearedBlockingObligation(input.context.tenantId, input.entityId);
  }
}

export interface FinancialKernelHarness {
  kernel: GovernanceKernel;
  govStore: InMemoryGovernanceStore;
  finStore: InMemoryFinancialObligationStore;
  service: FinancialObligationService;
  outbox: InMemoryOutboxStore;
  tenantId: string;
}

/**
 * Build a fully-seeded in-memory kernel + financial service. Both the affiliation and financial
 * state machines are seeded so activation-gate tests can drive a real affiliation `activate`.
 */
export function buildFinancialKernelHarness(
  options: { seedApprovedApplications?: ReadonlyArray<{ tenantId: string; applicationId: string }> } = {},
): FinancialKernelHarness {
  const clock = fixedClock(1_700_000_000_000);
  const ids = financialSequentialIds();
  const affiliation = buildAffiliationSeed();
  const financial = buildFinancialObligationSeed();

  const approvedStates: EntityStateRow[] = (options.seedApprovedApplications ?? []).map(
    (a, index) => ({
      id: `seed-approved-${index.toString().padStart(4, '0')}`,
      tenantId: a.tenantId,
      entityType: AFFILIATION_APPLICATION_ENTITY_TYPE,
      entityId: a.applicationId,
      currentState: 'approved',
      stateMachineId: affiliation.stateMachines[0]!.id,
    }),
  );

  const govStore = new InMemoryGovernanceStore(clock, ids, {
    stateMachines: [...affiliation.stateMachines, ...financial.stateMachines],
    transitions: [...affiliation.transitions, ...financial.transitions],
    entityStates: approvedStates,
  });
  const outbox = new InMemoryOutboxStore(clock, financialSequentialIds('obx'), govStore.outboxRecords);

  const finStore = new InMemoryFinancialObligationStore();
  const clearanceReader = new InMemoryFinancialClearanceReader(govStore, finStore);

  const registry = new GuardRegistry();
  registerAffiliationGuards(registry, new ClearanceBackedAffiliationGuardRepository(clearanceReader));
  registerFinancialObligationGuards(registry, new DomainBackedFinancialGuardRepository(finStore));

  const serializationKeyResolvers = new Map<string, TransitionSerializationKeyResolver>([
    [AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE, new FinancialObligationSerializationResolver()],
  ]);
  const domainEffects = new Map<string, TransitionDomainEffect>([
    [AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE, new InMemoryFinancialObligationEffect(finStore)],
  ]);

  const kernel = new GovernanceKernel({
    store: govStore,
    guards: registry,
    clock,
    outboxMaxRetries: 5,
    permissions: new FinancialObligationPermissionChecker(new DefaultPermissionChecker()),
    serializationKeyResolvers,
    domainEffects,
  });

  const service = new FinancialObligationService(kernel, finStore);
  return { kernel, govStore, finStore, service, outbox, tenantId: FIN_TENANT_A };
}

/** All-pass affiliation guard facts EXCEPT the financial-clearance fact (derived from state). */
export const AFFILIATION_ALL_PASS_FACTS = {
  requiredFieldsComplete: true,
  requiredDocsPresent: true,
  openComplianceFlags: false,
  feesPaid: true,
  seasonIsCurrent: true,
  conflictingActiveStanding: false,
} as const;
