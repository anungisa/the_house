import { GovernanceKernel } from '../../src/governance/kernel/GovernanceKernel.js';
import { GuardRegistry } from '../../src/governance/guards/GuardRegistry.js';
import {
  registerAffiliationGuards,
  PayloadBackedAffiliationGuardRepository,
  type AffiliationGuardRepository,
} from '../../src/governance/guards/handlers.js';
import { InMemoryGovernanceStore } from '../../src/governance/store/InMemoryGovernanceStore.js';
import { InMemoryOutboxStore } from '../../src/governance/outbox/InMemoryOutboxStore.js';
import { buildAffiliationSeed } from '../../src/governance/store/affiliationSeed.js';
import { fixedClock } from '../../src/shared/time/clock.js';
import type { IdGenerator } from '../../src/shared/uuid/id.js';
import type {
  TransitionActor,
  TransitionContext,
  TransitionInput,
} from '../../src/governance/types/TransitionTypes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

/** Deterministic, monotonically increasing id generator for tests. */
export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return {
    newId: () => {
      n += 1;
      return `${prefix}-${n.toString().padStart(4, '0')}`;
    },
  };
}

export interface KernelHarness {
  kernel: GovernanceKernel;
  store: InMemoryGovernanceStore;
  outbox: InMemoryOutboxStore;
  registry: GuardRegistry;
  tenantId: string;
}

/**
 * Build a fully-seeded in-memory AffiliationApplication kernel for unit tests.
 * The governance store and outbox store SHARE the same backing outbox array, so messages
 * enqueued by the kernel are visible to the outbox worker.
 */
export function buildKernelHarness(
  options: { registerGuards?: boolean; guardRepo?: AffiliationGuardRepository } = {},
): KernelHarness {
  const clock = fixedClock(1_700_000_000_000);
  const ids = sequentialIds();
  const seed = buildAffiliationSeed();
  const store = new InMemoryGovernanceStore(clock, ids, {
    stateMachines: seed.stateMachines,
    transitions: seed.transitions,
  });
  const outbox = new InMemoryOutboxStore(clock, sequentialIds('obx'), store.outboxRecords);

  const registry = new GuardRegistry();
  if (options.registerGuards !== false) {
    // Unit tests use the payload-backed FAKE so guard outcomes are driven by ALL_PASS_FACTS
    // (or per-test facts). Persistence-backed guards are covered by their own tests.
    registerAffiliationGuards(
      registry,
      options.guardRepo ?? new PayloadBackedAffiliationGuardRepository(),
    );
  }

  const kernel = new GovernanceKernel({ store, guards: registry, clock, outboxMaxRetries: 5 });
  return { kernel, store, outbox, registry, tenantId: TENANT };
}

/** All-pass facts for guards driven by payload (see PayloadBackedAffiliationGuardRepository). */
export const ALL_PASS_FACTS = {
  requiredFieldsComplete: true,
  requiredDocsPresent: true,
  openComplianceFlags: false,
  feesPaid: true,
  seasonIsCurrent: true,
} as const;

export function reviewerActor(tenantId = TENANT): TransitionActor {
  return {
    actorId: 'reviewer-1',
    tenantId,
    scopeType: 'national_organization',
    scopeId: 'org-1',
    roles: ['reviewer'],
  };
}

export function memberActor(tenantId = TENANT): TransitionActor {
  return {
    actorId: 'member-1',
    tenantId,
    scopeType: 'local_organization',
    scopeId: 'club-1',
    roles: [],
  };
}

export function ctx(tenantId = TENANT): TransitionContext {
  return {
    tenantId,
    scopeType: 'national_organization',
    scopeId: 'org-1',
    correlationId: 'corr-1',
  };
}

export function makeInput(
  overrides: Partial<TransitionInput> & Pick<TransitionInput, 'entityId' | 'trigger' | 'idempotencyKey'>,
): TransitionInput {
  return {
    entityType: 'AffiliationApplication',
    actor: overrides.actor ?? reviewerActor(),
    context: overrides.context ?? ctx(),
    payload: overrides.payload ?? { facts: ALL_PASS_FACTS },
    ...overrides,
  };
}
