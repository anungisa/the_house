/**
 * StandingRenewalEligibilityService — server-derived renewal-posture proofs (hermetic, in-memory).
 *
 * These proofs exercise the REAL eligibility service over in-memory ports. They cover the
 * representative-facing question — "can this standing be renewed, for which season, can I start or
 * resume?" — and the invariants the increment must guarantee: an in-progress renewal takes
 * precedence; the renewal window boundary is driven by the PERSISTED grace-days policy (never a
 * re-declared literal); an active term that has silently passed its end requires kernel
 * reconciliation; a lapsed standing follows the remediation pathway; a resolving jurisdiction and a
 * later accepting season are both required; and the projection never leaks guard names, role names,
 * transition ids, or the grace-days value. All data is synthetic.
 */

import { describe, expect, it } from 'vitest';

import {
  InMemoryRenewalApplicationLinkReader,
  InMemoryRenewalLinkRegistry,
  InMemoryStandingRenewalPolicyReader,
  StandingRenewalEligibilityService,
  type RenewalJurisdictionGate,
  type RenewalTargetSeasonReader,
  type RenewalTargetSeasonView,
  type StandingRecordReader,
} from '../../../../src/domains/affiliation-standing/index.js';
import type { StandingReviewRecord } from '../../../../src/domains/affiliation-standing/StandingReviewService.js';

const TENANT = 'tenant-a';
const STANDING_ID = 'aaaaaaaa-0000-0000-0000-0000000000a1';
const DAY = 86_400_000;
const NOW = Date.parse('2026-06-01T00:00:00.000Z');
const iso = (ms: number): string => new Date(ms).toISOString();

const TARGET_SEASON: RenewalTargetSeasonView = {
  id: '2026-27',
  label: '2026-27 season',
  phase: 'upcoming',
  acceptingApplications: true,
};

function record(overrides: Partial<StandingReviewRecord> = {}): StandingReviewRecord {
  return {
    standingId: STANDING_ID,
    affiliationApplicationId: 'app-1',
    organizationId: 'club-1',
    season: '2025-26',
    standingVersion: 3,
    effectiveFrom: iso(NOW - 200 * DAY),
    effectiveUntil: iso(NOW + 60 * DAY),
    pathway: 'new_affiliation',
    lifecycleState: 'active',
    ...overrides,
  };
}

class FixedStandingReader implements StandingRecordReader {
  constructor(private readonly value: StandingReviewRecord | undefined) {}
  async getStanding(): Promise<StandingReviewRecord | undefined> {
    return this.value;
  }
}

class FixedSeasonReader implements RenewalTargetSeasonReader {
  constructor(private readonly seasons: readonly RenewalTargetSeasonView[]) {}
  async renewalTargetSeasons(): Promise<readonly RenewalTargetSeasonView[]> {
    return this.seasons;
  }
}

class FixedJurisdictionGate implements RenewalJurisdictionGate {
  constructor(private readonly value: boolean) {}
  async resolves(): Promise<boolean> {
    return this.value;
  }
}

interface HarnessOptions {
  readonly graceDays?: number;
  readonly seasons?: readonly RenewalTargetSeasonView[];
  readonly jurisdictionResolves?: boolean;
  readonly registry?: InMemoryRenewalLinkRegistry;
}

function service(rec: StandingReviewRecord | undefined, opts: HarnessOptions = {}) {
  const registry = opts.registry ?? new InMemoryRenewalLinkRegistry();
  return new StandingRenewalEligibilityService({
    standing: new FixedStandingReader(rec),
    policy: new InMemoryStandingRenewalPolicyReader({ graceDays: opts.graceDays ?? 30 }),
    seasons: new FixedSeasonReader(opts.seasons ?? [TARGET_SEASON]),
    jurisdiction: new FixedJurisdictionGate(opts.jurisdictionResolves ?? true),
    links: new InMemoryRenewalApplicationLinkReader(registry),
  });
}

describe('StandingRenewalEligibilityService', () => {
  it('returns undefined for an out-of-scope / unknown standing (opaque 404 upstream)', async () => {
    const view = await service(undefined).evaluate({
      tenantId: TENANT,
      standingId: STANDING_ID,
      organizationIds: ['club-1'],
      nowIso: iso(NOW),
    });
    expect(view).toBeUndefined();
  });

  it('an in-progress renewal takes precedence over any lifecycle posture', async () => {
    const registry = new InMemoryRenewalLinkRegistry();
    registry.insert({
      tenantId: TENANT,
      renewalApplicationId: 'renewal-app-1',
      standingId: STANDING_ID,
      sourceStandingVersion: 3,
      sourceSeasonId: '2025-26',
      targetSeasonId: '2026-27',
      initiatedBy: '00000000-0000-0000-0000-0000000000ff',
      idempotencyKey: 'idem-1',
    });
    // Even a "window not open" active standing resumes rather than offering a fresh start.
    const view = await service(record({ effectiveUntil: iso(NOW + 200 * DAY) }), { registry })
      .evaluateForRecord(TENANT, record({ effectiveUntil: iso(NOW + 200 * DAY) }), iso(NOW));
    expect(view.posture).toBe('in_progress');
    expect(view.renewalApplicationId).toBe('renewal-app-1');
    expect(view.targetSeasons).toEqual([]);
  });

  it('active standing before the renewal window opens is not eligible', async () => {
    // until is NOW+60d, grace is 30d => window opens at NOW+30d; NOW is before that.
    const view = await service(record(), { graceDays: 30 }).evaluateForRecord(
      TENANT,
      record(),
      iso(NOW),
    );
    expect(view.posture).toBe('not_eligible');
    expect(view.reasonCode).toBe('renewal_window_not_open');
  });

  it('the window boundary is driven by the persisted grace-days policy, not a constant', async () => {
    // Same record (until = NOW+60d). With a 90-day grace the window is already open => eligible.
    const view = await service(record(), { graceDays: 90 }).evaluateForRecord(
      TENANT,
      record(),
      iso(NOW),
    );
    expect(view.posture).toBe('eligible');
    expect(view.pathway).toBe('continuity');
  });

  it('active standing inside the window is eligible via the continuity pathway', async () => {
    const view = await service(record({ effectiveUntil: iso(NOW + 10 * DAY) })).evaluateForRecord(
      TENANT,
      record({ effectiveUntil: iso(NOW + 10 * DAY) }),
      iso(NOW),
    );
    expect(view.posture).toBe('eligible');
    expect(view.pathway).toBe('continuity');
    expect(view.targetSeasons).toEqual([TARGET_SEASON]);
  });

  it('an active term that has silently passed its end requires reconciliation', async () => {
    const view = await service(record({ effectiveUntil: iso(NOW - DAY) })).evaluateForRecord(
      TENANT,
      record({ effectiveUntil: iso(NOW - DAY) }),
      iso(NOW),
    );
    expect(view.posture).toBe('reconciliation_required');
  });

  it('an active standing with an undated term is not renewable (fail closed)', async () => {
    const view = await service(record({ effectiveUntil: 'not-a-date' })).evaluateForRecord(
      TENANT,
      record({ effectiveUntil: 'not-a-date' }),
      iso(NOW),
    );
    expect(view.posture).toBe('not_eligible');
    expect(view.reasonCode).toBe('lifecycle_not_renewable');
  });

  it('a lapsed standing is eligible via the remediation pathway', async () => {
    const view = await service(record({ lifecycleState: 'lapsed' })).evaluateForRecord(
      TENANT,
      record({ lifecycleState: 'lapsed' }),
      iso(NOW),
    );
    expect(view.posture).toBe('eligible');
    expect(view.pathway).toBe('renewal_with_remediation');
  });

  it('eligibility requires at least one governed later accepting season', async () => {
    const view = await service(record({ lifecycleState: 'lapsed' }), { seasons: [] }).evaluateForRecord(
      TENANT,
      record({ lifecycleState: 'lapsed' }),
      iso(NOW),
    );
    expect(view.posture).toBe('not_eligible');
    expect(view.reasonCode).toBe('no_target_season');
  });

  it('eligibility requires a resolving jurisdiction (fail closed)', async () => {
    const view = await service(record({ lifecycleState: 'lapsed' }), {
      jurisdictionResolves: false,
    }).evaluateForRecord(TENANT, record({ lifecycleState: 'lapsed' }), iso(NOW));
    expect(view.posture).toBe('not_eligible');
    expect(view.reasonCode).toBe('jurisdiction_unavailable');
  });

  it.each(['pending', 'suspended', 'terminated', 'unopened'])(
    'a %s standing is not renewable by a representative',
    async (state) => {
      const view = await service(record({ lifecycleState: state })).evaluateForRecord(
        TENANT,
        record({ lifecycleState: state }),
        iso(NOW),
      );
      expect(view.posture).toBe('not_eligible');
      expect(view.reasonCode).toBe('lifecycle_not_renewable');
    },
  );

  it('never leaks guard names, role names, grace-days, or transition ids in the projection', async () => {
    const view = await service(record({ effectiveUntil: iso(NOW + 10 * DAY) })).evaluateForRecord(
      TENANT,
      record({ effectiveUntil: iso(NOW + 10 * DAY) }),
      iso(NOW),
    );
    // The projection surface is a fixed, representative-safe allow-list.
    expect(Object.keys(view).sort()).toEqual(['pathway', 'posture', 'targetSeasons']);
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/grace/i);
    expect(serialized).not.toMatch(/guard/i);
    expect(serialized).not.toMatch(/authority|registrar|officer/i);
    expect(serialized).not.toMatch(/renew_active|transition/i);
  });
});
