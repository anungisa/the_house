/**
 * InMemoryAffiliationDraftStore — renewal-attribution proofs (hermetic).
 *
 * These proofs pin the store-level invariants for starting a standing renewal WITHOUT a second
 * application workflow: a renewal-pathway initiation attributes the new application to its standing
 * (renewal_application_link), and — only when a NEW application is created — captures exactly one
 * audit event and one outbox message. Idempotent replays (same subject) resume the existing
 * application and never duplicate the link, audit, or outbox. The store fails closed when the
 * renewal context is missing/misused. All data is synthetic; no database is involved.
 */

import { describe, expect, it } from 'vitest';

import { InMemoryRenewalLinkRegistry } from '../../../../src/domains/affiliation-standing/index.js';
import { InMemoryAffiliationDraftStore } from '../../../../src/domains/affiliation-requirements/InMemoryAffiliationDraftStore.js';
import type { InitiateApplicationInput } from '../../../../src/domains/affiliation-requirements/AffiliationDraftStore.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

const TENANT = 'tenant-a';
const ACTOR = '00000000-0000-0000-0000-0000000000aa';
const STANDING_ID = 'aaaaaaaa-0000-0000-0000-0000000000a1';

function renewalInput(
  overrides: Partial<InitiateApplicationInput> = {},
): InitiateApplicationInput {
  return {
    tenantId: TENANT,
    organizationId: 'club-1',
    seasonId: '2026-27',
    pathway: 'renewal',
    actor: ACTOR,
    bindings: [],
    renewal: {
      standingId: STANDING_ID,
      sourceStandingVersion: 3,
      sourceSeasonId: '2025-26',
      targetSeasonId: '2026-27',
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1',
      causationId: 'idem-1',
    },
    ...overrides,
  };
}

describe('InMemoryAffiliationDraftStore renewal attribution', () => {
  it('attributes a new renewal application and captures exactly one audit + one outbox', async () => {
    const registry = new InMemoryRenewalLinkRegistry();
    const store = new InMemoryAffiliationDraftStore({ renewalLinks: registry });

    const { head, created } = await store.initiateApplication(renewalInput());

    expect(created).toBe(true);
    const links = registry.forStanding(TENANT, STANDING_ID);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      renewalApplicationId: head.applicationId,
      sourceStandingVersion: 3,
      sourceSeasonId: '2025-26',
      targetSeasonId: '2026-27',
    });
    expect(store.renewalAuditEvents).toHaveLength(1);
    expect(store.renewalAuditEvents[0]).toMatchObject({
      entityType: 'AffiliationStanding',
      entityId: STANDING_ID,
      action: 'renewal_application_initiated',
    });
    expect(store.renewalOutboxMessages).toHaveLength(1);
    expect(store.renewalOutboxMessages[0]!.dedupeKey).toContain(STANDING_ID);
  });

  it('an idempotent replay resumes the application and does NOT duplicate link/audit/outbox', async () => {
    const registry = new InMemoryRenewalLinkRegistry();
    const store = new InMemoryAffiliationDraftStore({ renewalLinks: registry });

    const first = await store.initiateApplication(renewalInput());
    const second = await store.initiateApplication(renewalInput());

    expect(second.created).toBe(false);
    expect(second.head.applicationId).toBe(first.head.applicationId);
    expect(registry.forStanding(TENANT, STANDING_ID)).toHaveLength(1);
    expect(store.renewalAuditEvents).toHaveLength(1);
    expect(store.renewalOutboxMessages).toHaveLength(1);
  });

  it('fails closed when a renewal pathway lacks its renewal context', async () => {
    const store = new InMemoryAffiliationDraftStore({
      renewalLinks: new InMemoryRenewalLinkRegistry(),
    });
    const { renewal: _omit, ...withoutContext } = renewalInput();
    void _omit;
    await expect(store.initiateApplication(withoutContext)).rejects.toBeInstanceOf(AppError);
  });

  it('fails closed when a non-renewal pathway carries a renewal context', async () => {
    const store = new InMemoryAffiliationDraftStore({
      renewalLinks: new InMemoryRenewalLinkRegistry(),
    });
    await expect(
      store.initiateApplication(renewalInput({ pathway: 'new_affiliation' })),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('fails closed when the renewal target season does not match the application season', async () => {
    const store = new InMemoryAffiliationDraftStore({
      renewalLinks: new InMemoryRenewalLinkRegistry(),
    });
    await expect(
      store.initiateApplication(renewalInput({ seasonId: '2027-28' })),
    ).rejects.toBeInstanceOf(AppError);
  });
});
