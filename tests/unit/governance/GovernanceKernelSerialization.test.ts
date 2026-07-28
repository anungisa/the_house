import { describe, it, expect } from 'vitest';
import { GovernanceKernel } from '../../../src/governance/kernel/GovernanceKernel.js';
import { GuardRegistry } from '../../../src/governance/guards/GuardRegistry.js';
import {
  registerAffiliationGuards,
  PayloadBackedAffiliationGuardRepository,
} from '../../../src/governance/guards/handlers.js';
import { InMemoryGovernanceStore } from '../../../src/governance/store/InMemoryGovernanceStore.js';
import { buildAffiliationSeed } from '../../../src/governance/store/affiliationSeed.js';
import { fixedClock } from '../../../src/shared/time/clock.js';
import type {
  GovernanceStore,
  GovernanceTx,
  TransitionSerializationInput,
  TransitionSerializationKeyResolver,
} from '../../../src/governance/kernel/ports.js';
import type { TransitionInput } from '../../../src/governance/types/TransitionTypes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const ALL_PASS_FACTS = {
  requiredFieldsComplete: true,
  requiredDocsPresent: true,
  openComplianceFlags: false,
  feesPaid: true,
  seasonIsCurrent: true,
} as const;

let seq = 0;
function sequentialIds(prefix = 'id') {
  return { newId: () => `${prefix}-${(seq += 1).toString().padStart(4, '0')}` };
}

/** Wraps a GovernanceStore to record advisory-lock acquisitions and their order vs guards. */
function recordingStore(inner: GovernanceStore, events: string[]): GovernanceStore {
  return {
    findExistingResult: (...args) => inner.findExistingResult(...args),
    runInTransaction: (tenantId, fn) =>
      inner.runInTransaction(tenantId, (tx) => {
        const wrapped = new Proxy(tx, {
          get(target, prop) {
            const value = Reflect.get(target, prop, target) as unknown;
            if (prop === 'acquireSerializationLock') {
              return async (key: string) => {
                events.push(`lock:${key}`);
                await (value as (k: string) => Promise<void>).call(target, key);
              };
            }
            if (typeof value === 'function') {
              return (value as (...a: unknown[]) => unknown).bind(target);
            }
            return value;
          },
        }) as GovernanceTx;
        return fn(wrapped);
      }),
  };
}

function buildKernel(
  resolver: TransitionSerializationKeyResolver | undefined,
  events: string[],
): { kernel: GovernanceKernel } {
  const clock = fixedClock(1_700_000_000_000);
  const seed = buildAffiliationSeed();
  const store = new InMemoryGovernanceStore(clock, sequentialIds(), {
    stateMachines: seed.stateMachines,
    transitions: seed.transitions,
  });
  const registry = new GuardRegistry();
  registerAffiliationGuards(registry, new PayloadBackedAffiliationGuardRepository());
  // Record when guards are evaluated so ordering against lock acquisition is observable.
  const originalEvaluate = registry.evaluate.bind(registry);
  registry.evaluate = async (input) => {
    events.push(`guard:${input.guardCode}`);
    return originalEvaluate(input);
  };
  const kernel = new GovernanceKernel({
    store: recordingStore(store, events),
    guards: registry,
    clock,
    ...(resolver !== undefined
      ? { serializationKeyResolvers: new Map([['AffiliationApplication', resolver]]) }
      : {}),
  });
  return { kernel };
}

function submitInput(entityId: string): TransitionInput {
  return {
    entityType: 'AffiliationApplication',
    entityId,
    trigger: 'submit',
    idempotencyKey: `${entityId}-submit`,
    actor: { actorId: 'member-1', tenantId: TENANT, scopeType: 'local_organization' },
    context: { tenantId: TENANT, scopeType: 'local_organization' },
    payload: { facts: ALL_PASS_FACTS },
  };
}

describe('GovernanceKernel serialization-key acquisition', () => {
  it('acquires resolver keys (deduped + sorted) BEFORE guard evaluation', async () => {
    const events: string[] = [];
    const resolver: TransitionSerializationKeyResolver = {
      resolveKeys: () => Promise.resolve(['K-beta', 'K-alpha', 'K-beta']),
    };
    const { kernel } = buildKernel(resolver, events);
    const result = await kernel.transition(submitInput('app-order'));
    expect(result.status).toBe('executed');

    const lockEvents = events.filter((e) => e.startsWith('lock:'));
    // Deduped and sorted.
    expect(lockEvents).toEqual(['lock:K-alpha', 'lock:K-beta']);
    // Every lock precedes the first guard evaluation.
    const firstGuard = events.findIndex((e) => e.startsWith('guard:'));
    const lastLock = events.map((e) => e.startsWith('lock:')).lastIndexOf(true);
    expect(lastLock).toBeLessThan(firstGuard);
  });

  it('passes the resolved transition context to the resolver', async () => {
    const events: string[] = [];
    const seen: TransitionSerializationInput[] = [];
    const resolver: TransitionSerializationKeyResolver = {
      resolveKeys: (input) => {
        seen.push(input);
        return Promise.resolve([]);
      },
    };
    const { kernel } = buildKernel(resolver, events);
    await kernel.transition(submitInput('app-ctx'));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      tenantId: TENANT,
      entityType: 'AffiliationApplication',
      entityId: 'app-ctx',
      trigger: 'submit',
      fromState: 'draft',
      toState: 'submitted',
    });
  });

  it('is a no-op when no resolver is registered (no lock acquired)', async () => {
    const events: string[] = [];
    const { kernel } = buildKernel(undefined, events);
    const result = await kernel.transition(submitInput('app-none'));
    expect(result.status).toBe('executed');
    expect(events.some((e) => e.startsWith('lock:'))).toBe(false);
  });

  it('acquires no lock when the resolver returns an empty key set', async () => {
    const events: string[] = [];
    const resolver: TransitionSerializationKeyResolver = {
      resolveKeys: () => Promise.resolve([]),
    };
    const { kernel } = buildKernel(resolver, events);
    await kernel.transition(submitInput('app-empty'));
    expect(events.some((e) => e.startsWith('lock:'))).toBe(false);
  });
});
