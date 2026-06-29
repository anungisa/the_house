import { describe, it, expect } from 'vitest';
import {
  buildKernelHarness,
  makeInput,
  reviewerActor,
} from '../../../helpers/affiliationKernel.js';
import { InMemoryAffiliationApplicationStore } from '../../../../src/domains/affiliation/InMemoryAffiliationApplicationStore.js';
import { DomainBackedAffiliationGuardRepository } from '../../../../src/domains/affiliation/DomainBackedAffiliationGuardRepository.js';
import type { GuardEvaluationInput } from '../../../../src/governance/types/TransitionTypes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const APP = 'app-1';

function seededStore(
  overrides: {
    requiredFieldsComplete?: boolean;
    docStatus?: 'approved' | 'pending';
    openFlag?: boolean;
    unpaid?: boolean;
    currentSeason?: boolean;
  } = {},
): InMemoryAffiliationApplicationStore {
  const store = new InMemoryAffiliationApplicationStore();
  store.seedApplication({
    id: APP,
    tenantId: TENANT,
    seasonId: '2025-26',
    requiredFieldsComplete: overrides.requiredFieldsComplete ?? true,
  });
  store.addDocument({
    applicationId: APP,
    required: true,
    status: overrides.docStatus ?? 'approved',
  });
  if (overrides.openFlag === true) {
    store.addComplianceFlag({ applicationId: APP, status: 'open' });
  }
  if (overrides.unpaid === true) {
    store.addPayment({ applicationId: APP, status: 'unpaid' });
  }
  if (overrides.currentSeason !== false) {
    store.setCurrentSeason(TENANT, '2025-26');
  }
  return store;
}

function kernelWith(store: InMemoryAffiliationApplicationStore) {
  return buildKernelHarness({ guardRepo: new DomainBackedAffiliationGuardRepository(store) });
}

describe('DomainBackedAffiliationGuardRepository (persistence-backed guards)', () => {
  it('submit EXECUTES when persisted domain facts are complete', async () => {
    const { kernel } = kernelWith(seededStore());
    const result = await kernel.transition(
      makeInput({ entityId: APP, trigger: 'submit', idempotencyKey: 'k1' }),
    );
    expect(result.status).toBe('executed');
    expect(result.toState).toBe('submitted');
  });

  it('submit is REJECTED when persisted required fields are incomplete', async () => {
    const { kernel, store } = kernelWith(seededStore({ requiredFieldsComplete: false }));
    const result = await kernel.transition(
      makeInput({ entityId: APP, trigger: 'submit', idempotencyKey: 'k1' }),
    );
    expect(result.status).toBe('rejected');
    // No governed state was created on a guard rejection.
    expect(store.data.entityStates.length).toBe(0);
  });

  it('submit is REJECTED when a persisted required document is not approved', async () => {
    const { kernel } = kernelWith(seededStore({ docStatus: 'pending' }));
    const result = await kernel.transition(
      makeInput({ entityId: APP, trigger: 'submit', idempotencyKey: 'k1' }),
    );
    expect(result.status).toBe('rejected');
  });

  it('caller payload facts CANNOT force a pass when persisted facts fail', async () => {
    const { kernel } = kernelWith(seededStore({ requiredFieldsComplete: false }));
    const result = await kernel.transition(
      makeInput({
        entityId: APP,
        trigger: 'submit',
        idempotencyKey: 'k1',
        payload: {
          facts: {
            requiredFieldsComplete: true,
            requiredDocsPresent: true,
            openComplianceFlags: false,
            feesPaid: true,
            seasonIsCurrent: true,
          },
        },
      }),
    );
    expect(result.status).toBe('rejected');
  });

  it('approve reaches approval gate when persisted compliance/fees facts pass', async () => {
    const { kernel } = kernelWith(seededStore());
    await kernel.transition(makeInput({ entityId: APP, trigger: 'submit', idempotencyKey: 'k1' }));
    await kernel.transition(
      makeInput({ entityId: APP, trigger: 'review_start', idempotencyKey: 'k2' }),
    );
    const result = await kernel.transition(
      makeInput({ entityId: APP, trigger: 'approve', idempotencyKey: 'k3' }),
    );
    expect(result.status).toBe('approval_required');
  });

  it('approve is REJECTED when a persisted compliance flag is open', async () => {
    const { kernel } = kernelWith(seededStore({ openFlag: true }));
    await kernel.transition(makeInput({ entityId: APP, trigger: 'submit', idempotencyKey: 'k1' }));
    await kernel.transition(
      makeInput({ entityId: APP, trigger: 'review_start', idempotencyKey: 'k2' }),
    );
    const result = await kernel.transition(
      makeInput({ entityId: APP, trigger: 'approve', idempotencyKey: 'k3' }),
    );
    expect(result.status).toBe('rejected');
  });

  it('approve is REJECTED when a persisted fee obligation is unpaid', async () => {
    const { kernel } = kernelWith(seededStore({ unpaid: true }));
    await kernel.transition(makeInput({ entityId: APP, trigger: 'submit', idempotencyKey: 'k1' }));
    await kernel.transition(
      makeInput({ entityId: APP, trigger: 'review_start', idempotencyKey: 'k2' }),
    );
    const result = await kernel.transition(
      makeInput({ entityId: APP, trigger: 'approve', idempotencyKey: 'k3' }),
    );
    expect(result.status).toBe('rejected');
  });
});

describe('AffiliationApplicationStore fail-closed semantics (missing application)', () => {
  const store = new InMemoryAffiliationApplicationStore();

  it('getApplicationFacts returns undefined', async () => {
    expect(await store.getApplicationFacts(TENANT, 'missing')).toBeUndefined();
  });

  it('areRequiredFieldsComplete is false', async () => {
    expect(await store.areRequiredFieldsComplete(TENANT, 'missing')).toBe(false);
  });

  it('areRequiredDocumentsPresent is false', async () => {
    expect(await store.areRequiredDocumentsPresent(TENANT, 'missing')).toBe(false);
  });

  it('hasOpenComplianceFlags is true (blocks)', async () => {
    expect(await store.hasOpenComplianceFlags(TENANT, 'missing')).toBe(true);
  });

  it('isPaymentSatisfied is false', async () => {
    expect(await store.isPaymentSatisfied(TENANT, 'missing')).toBe(false);
  });

  it('isSeasonCurrent is false for an unknown season', async () => {
    expect(await store.isSeasonCurrent(TENANT, 'unknown')).toBe(false);
  });
});

describe('DomainBackedAffiliationGuardRepository actor scope', () => {
  it('actorHasReviewerScope reflects actor roles (identity, not persisted data)', () => {
    const repo = new DomainBackedAffiliationGuardRepository(new InMemoryAffiliationApplicationStore());
    const base = {
      guardCode: 'ACTOR_HAS_REVIEWER_SCOPE',
      parameters: {},
      entityType: 'AffiliationApplication',
      entityId: APP,
      trigger: 'review_start',
      fromState: 'submitted',
      toState: 'under_review',
      context: { tenantId: TENANT },
    };
    const reviewer = { ...base, actor: reviewerActor(TENANT) } as unknown as GuardEvaluationInput;
    const member = {
      ...base,
      actor: { actorId: 'm1', tenantId: TENANT, roles: [] },
    } as unknown as GuardEvaluationInput;
    expect(repo.actorHasReviewerScope(reviewer)).toBe(true);
    expect(repo.actorHasReviewerScope(member)).toBe(false);
  });
});
