/**
 * AffiliationStanding — governed domain proofs (hermetic, in-memory kernel).
 *
 * These proofs exercise the REAL Governance Kernel over in-memory stores/effect. They cover the
 * distinctions the increment must guarantee: establishment (open) ≠ activation (activate) ≠
 * maintenance (renew); term ended (expire → lapsed) ≠ renewed (renew → active); genuine
 * clock-driven guards (within-effective-period, term-has-ended, renewal-window-open) reading
 * PERSISTED period facts (never caller payload); segregated per-trigger authority (fail closed);
 * append-only period + event history; idempotent retries; and time advancing across the lifecycle.
 * Cross-tenant RLS, transaction rollback, and concurrency serialization are proven separately
 * against Postgres in the gated integration suite. All data is synthetic.
 */

import { describe, expect, it } from 'vitest';
import {
  buildStandingKernelHarness,
  standingActor,
  STANDING_BASE_NOW_MS,
  STANDING_MS_PER_DAY,
  STANDING_TENANT_A,
  STANDING_TENANT_B,
} from '../../../helpers/affiliationStandingKernel.js';
import type { StandingTransitionRequest } from '../../../../src/domains/affiliation-standing/index.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

const ROLE = {
  registrar: 'standing_registrar',
  lifecycle: 'standing_lifecycle_officer',
  renewal: 'standing_renewal_authority',
  compliance: 'standing_compliance_officer',
  termination: 'standing_termination_authority',
} as const;

const STANDING = 'aaaaaaaa-0000-0000-0000-0000000000a1';
const APP = 'bbbbbbbb-0000-0000-0000-0000000000b1';
const SUBJECT = 'cccccccc-0000-0000-0000-0000000000c1';

const iso = (ms: number): string => new Date(ms).toISOString();
const days = (n: number): number => n * STANDING_MS_PER_DAY;

/** A default effective period centred on the harness base instant: [base-5d, base+5d). */
const PERIOD = {
  from: iso(STANDING_BASE_NOW_MS - days(5)),
  until: iso(STANDING_BASE_NOW_MS + days(5)),
} as const;

type Harness = ReturnType<typeof buildStandingKernelHarness>;

function openRequest(
  overrides: {
    tenantId?: string;
    standingId?: string;
    roleKeys?: readonly string[];
    idempotencyKey?: string;
    from?: string;
    until?: string;
    pathway?: string;
  } = {},
): StandingTransitionRequest {
  return {
    tenantId: overrides.tenantId ?? STANDING_TENANT_A,
    standingId: overrides.standingId ?? STANDING,
    actor: standingActor(overrides.roleKeys ?? [ROLE.registrar]),
    idempotencyKey: overrides.idempotencyKey ?? 'idem-open-1',
    details: {
      affiliationApplicationId: APP,
      subjectId: SUBJECT,
      season: '2025-2026',
      pathway: overrides.pathway ?? 'new_affiliation',
      effectiveFrom: overrides.from ?? PERIOD.from,
      effectiveUntil: overrides.until ?? PERIOD.until,
    },
  };
}

/** Open a standing (pending). */
async function open(h: Harness, overrides: Parameters<typeof openRequest>[0] = {}) {
  return h.service.openStanding(openRequest(overrides));
}

/** Open + activate a standing (active) at the current clock. */
async function openAndActivate(h: Harness, overrides: Parameters<typeof openRequest>[0] = {}) {
  await open(h, overrides);
  return h.service.activateStanding({
    tenantId: overrides.tenantId ?? STANDING_TENANT_A,
    standingId: overrides.standingId ?? STANDING,
    actor: standingActor([ROLE.registrar]),
    idempotencyKey: 'idem-activate-1',
  });
}

function stateOf(h: Harness, standingId = STANDING): string | undefined {
  return h.govStore.entityStateSnapshots.find(
    (e) => e.entityType === 'AffiliationStanding' && e.entityId === standingId,
  )?.currentState;
}

// ---------------------------------------------------------------------------------------------
// Proof 1 — open establishes the standing head + v1 period + governed 'pending' state + outbox.
// ---------------------------------------------------------------------------------------------
describe('proof 1: open establishes a governed standing', () => {
  it('persists head v1 + one period, sets state pending, enqueues one outbox message', async () => {
    const h = buildStandingKernelHarness();
    const res = await open(h);

    expect(res.status).toBe('executed');
    if (res.status === 'executed') expect(res.toState).toBe('pending');

    const head = await h.standingStore.getStanding(STANDING_TENANT_A, STANDING);
    expect(head).toBeDefined();
    expect(head?.standingVersion).toBe(1);
    expect(head?.pathway).toBe('new_affiliation');
    expect(head?.effectiveFrom).toBe(PERIOD.from);
    expect(head?.effectiveUntil).toBe(PERIOD.until);

    expect(h.standingStore.periodCount(STANDING_TENANT_A, STANDING)).toBe(1);
    expect(stateOf(h)).toBe('pending');
    expect(h.govStore.outboxRecords).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 2 — activate within the effective period brings the standing into force (active).
// ---------------------------------------------------------------------------------------------
describe('proof 2: activate within the effective period', () => {
  it('transitions pending -> active when the clock is inside [from, until)', async () => {
    const h = buildStandingKernelHarness();
    const res = await openAndActivate(h);

    expect(res.status).toBe('executed');
    if (res.status === 'executed') expect(res.toState).toBe('active');
    expect(stateOf(h)).toBe('active');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 3 — activate outside the effective period is denied by the persisted-fact clock guard.
// ---------------------------------------------------------------------------------------------
describe('proof 3: activate outside the effective period is rejected', () => {
  it('denies with STANDING_WITHIN_EFFECTIVE_PERIOD when the period is in the future', async () => {
    const h = buildStandingKernelHarness();
    // Period starts 10 days after now -> the clock is before the period.
    await open(h, {
      from: iso(STANDING_BASE_NOW_MS + days(10)),
      until: iso(STANDING_BASE_NOW_MS + days(20)),
    });
    const res = await h.service.activateStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.registrar]),
      idempotencyKey: 'idem-activate-1',
    });

    expect(res.status).toBe('rejected');
    if (res.status === 'rejected') {
      expect(res.failedGuards).toContain('STANDING_WITHIN_EFFECTIVE_PERIOD');
    }
    expect(stateOf(h)).toBe('pending');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 4 — expire is denied before the term ends (STANDING_TERM_HAS_ENDED reads persisted facts).
// ---------------------------------------------------------------------------------------------
describe('proof 4: expire before the term ends is rejected', () => {
  it('denies with STANDING_TERM_HAS_ENDED while the clock is inside the period', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);

    const res = await h.service.expireStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.lifecycle]),
      idempotencyKey: 'idem-expire-1',
      reason: 'scheduled expiry sweep',
    });

    expect(res.status).toBe('rejected');
    if (res.status === 'rejected') expect(res.failedGuards).toContain('STANDING_TERM_HAS_ENDED');
    expect(stateOf(h)).toBe('active');
    expect(h.standingStore.eventCount(STANDING_TENANT_A, STANDING, 'expiry')).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 5 — once the term ends, expire lapses the standing, records an event + evidence.
// ---------------------------------------------------------------------------------------------
describe('proof 5: expire after the term ends lapses the standing', () => {
  it('transitions active -> lapsed with an expiry event and immutable evidence', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);

    h.clock.advanceDays(10); // now past effective_until (base + 5d)

    const res = await h.service.expireStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.lifecycle]),
      idempotencyKey: 'idem-expire-1',
      reason: 'term ended',
    });

    expect(res.status).toBe('executed');
    if (res.status === 'executed') {
      expect(res.toState).toBe('lapsed');
      expect(res.evidenceObjectId).toBeDefined();
    }
    expect(stateOf(h)).toBe('lapsed');
    expect(h.standingStore.eventCount(STANDING_TENANT_A, STANDING, 'expiry')).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 6 — renew from lapsed appends a new period (version 2) and restores active standing.
// ---------------------------------------------------------------------------------------------
describe('proof 6: renew a lapsed standing', () => {
  it('appends period v2, advances the head, records a renewal event, returns active', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);
    h.clock.advanceDays(10);
    await h.service.expireStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.lifecycle]),
      idempotencyKey: 'idem-expire-1',
      reason: 'term ended',
    });

    const nextFrom = iso(STANDING_BASE_NOW_MS + days(10));
    const nextUntil = iso(STANDING_BASE_NOW_MS + days(375));
    const res = await h.service.renewStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.renewal]),
      idempotencyKey: 'idem-renew-1',
      reason: 'renewal for next season',
      details: {
        pathway: 'continuity',
        effectiveFrom: nextFrom,
        effectiveUntil: nextUntil,
      },
    });

    expect(res.status).toBe('executed');
    if (res.status === 'executed') expect(res.toState).toBe('active');

    const head = await h.standingStore.getStanding(STANDING_TENANT_A, STANDING);
    expect(head?.standingVersion).toBe(2);
    expect(head?.effectiveUntil).toBe(nextUntil);
    expect(head?.pathway).toBe('continuity');
    expect(h.standingStore.periodCount(STANDING_TENANT_A, STANDING)).toBe(2);
    expect(h.standingStore.eventCount(STANDING_TENANT_A, STANDING, 'renewal')).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 7 — renew_active early renewal is allowed only while the grace window is open.
// ---------------------------------------------------------------------------------------------
describe('proof 7: renew_active honours the renewal grace window', () => {
  it('allows early renewal inside the grace window (now >= until - 30d)', async () => {
    const h = buildStandingKernelHarness();
    // Period ends 20 days out -> the 30-day grace window is already open at base.
    await openAndActivate(h, {
      from: iso(STANDING_BASE_NOW_MS - days(5)),
      until: iso(STANDING_BASE_NOW_MS + days(20)),
    });

    const res = await h.service.renewActiveStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.renewal]),
      idempotencyKey: 'idem-renew-active-1',
      reason: 'proactive renewal',
      details: {
        pathway: 'continuity',
        effectiveFrom: iso(STANDING_BASE_NOW_MS + days(20)),
        effectiveUntil: iso(STANDING_BASE_NOW_MS + days(385)),
      },
    });

    expect(res.status).toBe('executed');
    if (res.status === 'executed') expect(res.toState).toBe('active');
    const head = await h.standingStore.getStanding(STANDING_TENANT_A, STANDING);
    expect(head?.standingVersion).toBe(2);
  });

  it('rejects early renewal before the grace window opens', async () => {
    const h = buildStandingKernelHarness();
    // Period ends 100 days out -> grace window opens at base+70d, still closed at base.
    await openAndActivate(h, {
      from: iso(STANDING_BASE_NOW_MS - days(5)),
      until: iso(STANDING_BASE_NOW_MS + days(100)),
    });

    const res = await h.service.renewActiveStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.renewal]),
      idempotencyKey: 'idem-renew-active-1',
      reason: 'too early',
      details: {
        pathway: 'continuity',
        effectiveFrom: iso(STANDING_BASE_NOW_MS + days(100)),
        effectiveUntil: iso(STANDING_BASE_NOW_MS + days(465)),
      },
    });

    expect(res.status).toBe('rejected');
    if (res.status === 'rejected') {
      expect(res.failedGuards).toContain('STANDING_RENEWAL_WINDOW_OPEN');
    }
    const head = await h.standingStore.getStanding(STANDING_TENANT_A, STANDING);
    expect(head?.standingVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 8 — suspend then reinstate, each under compliance authority, with events recorded.
// ---------------------------------------------------------------------------------------------
describe('proof 8: suspend and reinstate', () => {
  it('active -> suspended -> active, recording suspension + reinstatement events', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);

    const suspended = await h.service.suspendStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.compliance]),
      idempotencyKey: 'idem-suspend-1',
      reason: 'open compliance matter',
    });
    expect(suspended.status).toBe('executed');
    expect(stateOf(h)).toBe('suspended');
    expect(h.standingStore.eventCount(STANDING_TENANT_A, STANDING, 'suspension')).toBe(1);

    const reinstated = await h.service.reinstateStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.compliance]),
      idempotencyKey: 'idem-reinstate-1',
      reason: 'matter resolved',
    });
    expect(reinstated.status).toBe('executed');
    expect(stateOf(h)).toBe('active');
    expect(h.standingStore.eventCount(STANDING_TENANT_A, STANDING, 'reinstatement')).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 9 — reinstate outside the effective period is denied by the clock guard.
// ---------------------------------------------------------------------------------------------
describe('proof 9: reinstate outside the effective period is rejected', () => {
  it('denies with STANDING_WITHIN_EFFECTIVE_PERIOD once the term has ended', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);
    await h.service.suspendStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.compliance]),
      idempotencyKey: 'idem-suspend-1',
      reason: 'open compliance matter',
    });

    h.clock.advanceDays(10); // past effective_until

    const res = await h.service.reinstateStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.compliance]),
      idempotencyKey: 'idem-reinstate-1',
      reason: 'attempted late reinstatement',
    });

    expect(res.status).toBe('rejected');
    if (res.status === 'rejected') {
      expect(res.failedGuards).toContain('STANDING_WITHIN_EFFECTIVE_PERIOD');
    }
    expect(stateOf(h)).toBe('suspended');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 10 — terminate is a terminal transition reachable from active, suspended, and lapsed.
// ---------------------------------------------------------------------------------------------
describe('proof 10: terminate from active/suspended/lapsed', () => {
  it('terminates an active standing', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);
    const res = await h.service.terminateStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.termination]),
      idempotencyKey: 'idem-terminate-1',
      reason: 'membership withdrawn',
    });
    expect(res.status).toBe('executed');
    if (res.status === 'executed') expect(res.toState).toBe('terminated');
    expect(stateOf(h)).toBe('terminated');
    expect(h.standingStore.eventCount(STANDING_TENANT_A, STANDING, 'termination')).toBe(1);
  });

  it('terminates a lapsed standing', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);
    h.clock.advanceDays(10);
    await h.service.expireStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.lifecycle]),
      idempotencyKey: 'idem-expire-1',
      reason: 'term ended',
    });
    const res = await h.service.terminateStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.termination]),
      idempotencyKey: 'idem-terminate-1',
      reason: 'closed after lapse',
    });
    expect(res.status).toBe('executed');
    expect(stateOf(h)).toBe('terminated');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 11 — segregated authority: each high-risk trigger fails closed without its specific role.
// ---------------------------------------------------------------------------------------------
describe('proof 11: segregated per-trigger authority (fail closed)', () => {
  it('rejects expire attempted with the registrar role (wrong authority)', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);
    h.clock.advanceDays(10);
    const res = await h.service.expireStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.registrar]),
      idempotencyKey: 'idem-expire-1',
      reason: 'term ended',
    });
    expect(res.status).toBe('rejected');
    if (res.status === 'rejected') expect(res.code).toBe('PERMISSION_DENIED');
    expect(stateOf(h)).toBe('active');
  });

  it('rejects terminate attempted with the renewal role (wrong authority)', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h);
    const res = await h.service.terminateStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.renewal]),
      idempotencyKey: 'idem-terminate-1',
      reason: 'wrong hands',
    });
    expect(res.status).toBe('rejected');
    if (res.status === 'rejected') expect(res.code).toBe('PERMISSION_DENIED');
    expect(stateOf(h)).toBe('active');
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 12 — idempotent open retry replays without a second head/period/outbox message.
// ---------------------------------------------------------------------------------------------
describe('proof 12: idempotent open retry', () => {
  it('replays the prior result without a second period or outbox message', async () => {
    const h = buildStandingKernelHarness();
    await open(h);
    const replay = await open(h);

    expect(replay.status).toBe('executed');
    if (replay.status === 'executed') expect(replay.replayed).toBe(true);
    expect(h.standingStore.periodCount(STANDING_TENANT_A, STANDING)).toBe(1);
    expect(h.govStore.outboxRecords).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 13 — an unknown transition (activate from the bootstrap 'unopened' state) fails closed.
// ---------------------------------------------------------------------------------------------
describe('proof 13: unknown transition fails closed', () => {
  it('rejects activate before the standing is opened', async () => {
    const h = buildStandingKernelHarness();
    await expect(
      h.service.activateStanding({
        tenantId: STANDING_TENANT_A,
        standingId: STANDING,
        actor: standingActor([ROLE.registrar]),
        idempotencyKey: 'idem-activate-orphan',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 14 — tenant isolation: a standing opened in tenant A is invisible to tenant B.
// ---------------------------------------------------------------------------------------------
describe('proof 14: tenant isolation of standing facts', () => {
  it('does not expose tenant A facts under tenant B', async () => {
    const h = buildStandingKernelHarness();
    await open(h);

    expect(await h.standingStore.getStanding(STANDING_TENANT_A, STANDING)).toBeDefined();
    expect(await h.standingStore.getStanding(STANDING_TENANT_B, STANDING)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// Proof 15 — each executed high-risk transition enqueues exactly one governed outbox message.
// ---------------------------------------------------------------------------------------------
describe('proof 15: one governed outbox message per executed transition', () => {
  it('enqueues one message for open, activate, suspend, and reinstate (4 total)', async () => {
    const h = buildStandingKernelHarness();
    await openAndActivate(h); // open + activate = 2
    await h.service.suspendStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.compliance]),
      idempotencyKey: 'idem-suspend-1',
      reason: 'compliance hold',
    });
    await h.service.reinstateStanding({
      tenantId: STANDING_TENANT_A,
      standingId: STANDING,
      actor: standingActor([ROLE.compliance]),
      idempotencyKey: 'idem-reinstate-1',
      reason: 'hold cleared',
    });

    expect(h.govStore.outboxRecords).toHaveLength(4);
  });
});
