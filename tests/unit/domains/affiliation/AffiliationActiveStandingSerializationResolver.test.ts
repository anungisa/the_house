import { describe, it, expect } from 'vitest';
import { InMemoryAffiliationApplicationStore } from '../../../../src/domains/affiliation/InMemoryAffiliationApplicationStore.js';
import { AffiliationActiveStandingSerializationResolver } from '../../../../src/domains/affiliation/AffiliationActiveStandingSerializationResolver.js';
import type { TransitionSerializationInput } from '../../../../src/governance/kernel/ports.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const SUBJECT = 'org-scope-1';
const SEASON = '2025-26';
const APP = 'app-1';
const ENTITY_TYPE = 'AffiliationApplication';

function baseInput(
  overrides: Partial<TransitionSerializationInput> = {},
): TransitionSerializationInput {
  return {
    tenantId: TENANT,
    entityType: ENTITY_TYPE,
    entityId: APP,
    trigger: 'activate',
    fromState: 'approved',
    toState: 'active',
    ...overrides,
  };
}

function storeWithApp(): InMemoryAffiliationApplicationStore {
  const store = new InMemoryAffiliationApplicationStore();
  store.seedApplication({
    id: APP,
    tenantId: TENANT,
    seasonId: SEASON,
    scopeId: SUBJECT,
  });
  return store;
}

describe('AffiliationActiveStandingSerializationResolver', () => {
  it('returns a deterministic key for an activate (→ active) transition', async () => {
    const resolver = new AffiliationActiveStandingSerializationResolver(storeWithApp());
    const keys = await resolver.resolveKeys(baseInput());
    expect(keys).toEqual([
      `AffiliationApplication:active-standing:${TENANT}:${SUBJECT}:${SEASON}`,
    ]);
  });

  it('returns the SAME key for reinstate (→ active) as for activate (same governed scope)', async () => {
    const resolver = new AffiliationActiveStandingSerializationResolver(storeWithApp());
    const activate = await resolver.resolveKeys(baseInput({ trigger: 'activate', fromState: 'approved' }));
    const reinstate = await resolver.resolveKeys(
      baseInput({ trigger: 'reinstate', fromState: 'suspended' }),
    );
    expect(reinstate).toEqual(activate);
  });

  it('returns two IDENTICAL keys for two distinct applications sharing subject + season', async () => {
    const store = new InMemoryAffiliationApplicationStore();
    store.seedApplication({ id: 'app-a', tenantId: TENANT, seasonId: SEASON, scopeId: SUBJECT });
    store.seedApplication({ id: 'app-b', tenantId: TENANT, seasonId: SEASON, scopeId: SUBJECT });
    const resolver = new AffiliationActiveStandingSerializationResolver(store);
    const a = await resolver.resolveKeys(baseInput({ entityId: 'app-a' }));
    const b = await resolver.resolveKeys(baseInput({ entityId: 'app-b' }));
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
  });

  it('returns no key for a non-activating transition (toState !== active)', async () => {
    const resolver = new AffiliationActiveStandingSerializationResolver(storeWithApp());
    expect(
      await resolver.resolveKeys(baseInput({ trigger: 'submit', fromState: 'draft', toState: 'submitted' })),
    ).toEqual([]);
  });

  it('returns no key when the subject cannot be determined (no scope recorded)', async () => {
    const store = new InMemoryAffiliationApplicationStore();
    store.seedApplication({ id: APP, tenantId: TENANT, seasonId: SEASON });
    const resolver = new AffiliationActiveStandingSerializationResolver(store);
    expect(await resolver.resolveKeys(baseInput())).toEqual([]);
  });

  it('returns no key when the application does not exist', async () => {
    const resolver = new AffiliationActiveStandingSerializationResolver(
      new InMemoryAffiliationApplicationStore(),
    );
    expect(await resolver.resolveKeys(baseInput())).toEqual([]);
  });

  it('returns no key for a different entity type', async () => {
    const resolver = new AffiliationActiveStandingSerializationResolver(storeWithApp());
    expect(await resolver.resolveKeys(baseInput({ entityType: 'SomethingElse' }))).toEqual([]);
  });

  it('separates keys across tenants (advisory locks are cluster-global)', async () => {
    const resolver = new AffiliationActiveStandingSerializationResolver(storeWithApp());
    const [key] = await resolver.resolveKeys(baseInput());
    expect(key).toContain(`:${TENANT}:`);
  });
});
