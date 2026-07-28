/**
 * Hermetic in-memory harness for the AffiliationStanding governed slice.
 *
 * Wires a single Governance Kernel serving the AffiliationStanding entity type (mirroring the
 * production composition root), backed entirely by in-memory stores:
 *  - governance state/journal/audit/evidence/outbox : InMemoryGovernanceStore
 *  - standing facts                                 : InMemoryAffiliationStandingStore
 *  - standing writes atomic with the transition     : InMemoryAffiliationStandingEffect
 *  - term / renewal-window guards read persisted     : DomainBackedStandingGuardRepository
 *    effective-period facts against an injected clock
 *  - segregated standing authority                  : StandingPermissionChecker
 *  - concurrent renewal/expiry serialization         : AffiliationStandingSerializationResolver
 *
 * Unlike the affiliation harness, the standing guards read REAL persisted period facts (not payload
 * facts): tests place `now` before/after the seeded effective period via `nowMs` to exercise the
 * genuine clock-based derivation.
 */

import { GovernanceKernel } from '../../src/governance/kernel/GovernanceKernel.js';
import { GuardRegistry } from '../../src/governance/guards/GuardRegistry.js';
import { registerStandingGuards } from '../../src/governance/guards/standingHandlers.js';
import { DefaultPermissionChecker } from '../../src/governance/permissions/PermissionChecker.js';
import { StandingPermissionChecker } from '../../src/governance/permissions/StandingPermissionChecker.js';
import { InMemoryGovernanceStore } from '../../src/governance/store/InMemoryGovernanceStore.js';
import { InMemoryOutboxStore } from '../../src/governance/outbox/InMemoryOutboxStore.js';
import { buildAffiliationStandingSeed } from '../../src/governance/store/standingSeed.js';
import { type Clock } from '../../src/shared/time/clock.js';
import type { IdGenerator } from '../../src/shared/uuid/id.js';
import type {
  TransitionDomainEffect,
  TransitionSerializationKeyResolver,
} from '../../src/governance/kernel/ports.js';
import {
  AFFILIATION_STANDING_ENTITY_TYPE,
  AffiliationStandingService,
  AffiliationStandingSerializationResolver,
  DomainBackedStandingGuardRepository,
  InMemoryAffiliationStandingEffect,
  InMemoryAffiliationStandingStore,
} from '../../src/domains/affiliation-standing/index.js';
import type { StandingActorDto } from '../../src/domains/affiliation-standing/index.js';

export const STANDING_TENANT_A = '33333333-3333-3333-3333-333333333333';
export const STANDING_TENANT_B = '44444444-4444-4444-4444-444444444444';

/** A fixed reference instant used as the default `now` (2023-11-14T22:13:20Z). */
export const STANDING_BASE_NOW_MS = 1_700_000_000_000;

/** Deterministic, monotonically increasing id generator for tests. */
export function standingSequentialIds(prefix = 'sid'): IdGenerator {
  let n = 0;
  return {
    newId: () => {
      n += 1;
      return `${prefix}-${n.toString().padStart(4, '0')}`;
    },
  };
}

/** Milliseconds in one day (mirrors the guard repository constant). */
export const STANDING_MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A clock whose instant tests can advance to exercise genuine term/renewal-window derivation. */
export interface MutableClock extends Clock {
  /** Advance (or rewind) the clock to an absolute epoch-millisecond instant. */
  setNow(epochMs: number): void;
  /** Advance the clock by a relative number of days. */
  advanceDays(days: number): void;
}

function mutableClock(startMs: number): MutableClock {
  let current = startMs;
  return {
    now: () => current,
    nowIso: () => new Date(current).toISOString(),
    setNow: (epochMs: number) => {
      current = epochMs;
    },
    advanceDays: (days: number) => {
      current += days * STANDING_MS_PER_DAY;
    },
  };
}

export interface StandingKernelHarness {
  kernel: GovernanceKernel;
  govStore: InMemoryGovernanceStore;
  standingStore: InMemoryAffiliationStandingStore;
  service: AffiliationStandingService;
  outbox: InMemoryOutboxStore;
  clock: MutableClock;
  tenantId: string;
}

/** Build a fully-seeded in-memory kernel + standing service anchored at `nowMs`. */
export function buildStandingKernelHarness(
  options: { nowMs?: number } = {},
): StandingKernelHarness {
  const clock = mutableClock(options.nowMs ?? STANDING_BASE_NOW_MS);
  const ids = standingSequentialIds();
  const standing = buildAffiliationStandingSeed();

  const govStore = new InMemoryGovernanceStore(clock, ids, {
    stateMachines: [...standing.stateMachines],
    transitions: [...standing.transitions],
  });
  const outbox = new InMemoryOutboxStore(
    clock,
    standingSequentialIds('obx'),
    govStore.outboxRecords,
  );

  const standingStore = new InMemoryAffiliationStandingStore();

  const registry = new GuardRegistry();
  registerStandingGuards(registry, new DomainBackedStandingGuardRepository(standingStore, clock));

  const serializationKeyResolvers = new Map<string, TransitionSerializationKeyResolver>([
    [AFFILIATION_STANDING_ENTITY_TYPE, new AffiliationStandingSerializationResolver()],
  ]);
  const domainEffects = new Map<string, TransitionDomainEffect>([
    [AFFILIATION_STANDING_ENTITY_TYPE, new InMemoryAffiliationStandingEffect(standingStore)],
  ]);

  const kernel = new GovernanceKernel({
    store: govStore,
    guards: registry,
    clock,
    outboxMaxRetries: 5,
    permissions: new StandingPermissionChecker(new DefaultPermissionChecker()),
    serializationKeyResolvers,
    domainEffects,
  });

  const service = new AffiliationStandingService(kernel);
  return { kernel, govStore, standingStore, service, outbox, clock, tenantId: STANDING_TENANT_A };
}

/** Build a standing actor DTO with the given segregated role(s). */
export function standingActor(
  roleKeys: readonly string[],
  userId = '55555555-5555-5555-5555-555555555555',
): StandingActorDto {
  return { userId, roleKeys };
}
