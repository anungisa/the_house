import { describe, it, expect } from 'vitest';

import {
  isAcceptingApplications,
  isApplicationWindowOpen,
  pickSeasonLabel,
  resolveEffectiveSeason,
  resolveEffectiveSeasons,
  resolveSeasonPhase,
} from '../../../../src/domains/season-catalog/index.js';
import type { SeasonRecord } from '../../../../src/domains/season-catalog/index.js';

/**
 * Unit tests for the deterministic season projection. These pure functions are the single source
 * of truth for how the Button, the kernel guard, and every test interpret a persisted season, so
 * phase, window, label, and fail-closed (draft/retired) behavior are pinned exactly.
 */

const NOW = '2025-10-15T12:00:00.000Z';
const TENANT = '11111111-1111-1111-1111-111111111111';

function season(over: Partial<SeasonRecord> = {}): SeasonRecord {
  return {
    id: 'row-1',
    tenantId: TENANT,
    seasonId: '2025-26',
    status: 'published',
    isCurrent: false,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    labelEn: '2025-26 EN',
    labelFr: '2025-26 FR',
    seasonStartDate: '2025-09-01',
    seasonEndDate: '2026-08-31',
    ...over,
  };
}

describe('pickSeasonLabel', () => {
  it('selects the locale-specific label', () => {
    expect(pickSeasonLabel(season(), 'en')).toBe('2025-26 EN');
    expect(pickSeasonLabel(season(), 'fr')).toBe('2025-26 FR');
  });

  it('falls back deterministically when a locale label is blank', () => {
    const missingFr = season({ labelFr: '   ' });
    expect(pickSeasonLabel(missingFr, 'fr')).toBe('2025-26 EN');
    const noGoverned = season({ labelEn: undefined, labelFr: undefined, legacyLabel: 'Legacy' });
    expect(pickSeasonLabel(noGoverned, 'en')).toBe('Legacy');
    const nothing = season({ labelEn: undefined, labelFr: undefined, legacyLabel: undefined });
    expect(pickSeasonLabel(nothing, 'en')).toBe('2025-26');
  });
});

describe('resolveSeasonPhase', () => {
  it('returns current when the authoritative flag is set', () => {
    expect(resolveSeasonPhase(season({ isCurrent: true }), NOW)).toBe('current');
  });

  it('returns past when the end date (inclusive of the final day) has passed', () => {
    const past = season({ seasonStartDate: '2024-09-01', seasonEndDate: '2025-08-31' });
    expect(resolveSeasonPhase(past, NOW)).toBe('past');
  });

  it('keeps a season current-through the final day', () => {
    const endsToday = season({ seasonEndDate: '2025-10-15' });
    expect(resolveSeasonPhase(endsToday, NOW)).toBe('upcoming');
  });

  it('returns upcoming when not current and the end has not passed', () => {
    const future = season({ seasonStartDate: '2026-09-01', seasonEndDate: '2027-08-31' });
    expect(resolveSeasonPhase(future, NOW)).toBe('upcoming');
  });

  it('returns upcoming for a dateless non-current season (fail-safe)', () => {
    const dateless = season({ seasonStartDate: undefined, seasonEndDate: undefined });
    expect(resolveSeasonPhase(dateless, NOW)).toBe('upcoming');
  });
});

describe('isApplicationWindowOpen', () => {
  it('is open when both bounds are null (unbounded)', () => {
    const s = season({ applicationOpensAt: undefined, applicationClosesAt: undefined });
    expect(isApplicationWindowOpen(s, NOW)).toBe(true);
  });

  it('is closed before opens-at and after closes-at', () => {
    const notYet = season({ applicationOpensAt: '2025-11-01T00:00:00.000Z' });
    expect(isApplicationWindowOpen(notYet, NOW)).toBe(false);
    const already = season({ applicationClosesAt: '2025-10-01T00:00:00.000Z' });
    expect(isApplicationWindowOpen(already, NOW)).toBe(false);
  });

  it('is open inside the window', () => {
    const open = season({
      applicationOpensAt: '2025-09-01T00:00:00.000Z',
      applicationClosesAt: '2025-12-01T00:00:00.000Z',
    });
    expect(isApplicationWindowOpen(open, NOW)).toBe(true);
  });
});

describe('isAcceptingApplications', () => {
  it('requires published AND current AND an open window', () => {
    const currentOpen = season({ isCurrent: true });
    expect(isAcceptingApplications(currentOpen, NOW)).toBe(true);

    const currentClosed = season({
      isCurrent: true,
      applicationClosesAt: '2025-10-01T00:00:00.000Z',
    });
    expect(isAcceptingApplications(currentClosed, NOW)).toBe(false);

    const publishedNotCurrent = season({ isCurrent: false });
    expect(isAcceptingApplications(publishedNotCurrent, NOW)).toBe(false);
  });
});

describe('resolveEffectiveSeason', () => {
  it('never surfaces a draft or retired season', () => {
    expect(resolveEffectiveSeason(season({ status: 'draft' }), NOW, 'en')).toBeUndefined();
    expect(resolveEffectiveSeason(season({ status: 'retired' }), NOW, 'en')).toBeUndefined();
  });

  it('projects a published season with the STABLE key as id (never the row uuid)', () => {
    const view = resolveEffectiveSeason(season({ isCurrent: true }), NOW, 'fr');
    expect(view).toEqual({
      id: '2025-26',
      label: '2025-26 FR',
      current: true,
      phase: 'current',
      acceptingApplications: true,
    });
  });
});

describe('resolveEffectiveSeasons', () => {
  it('orders current first then newest by start date, and drops non-published', () => {
    const records: SeasonRecord[] = [
      season({ id: 'a', seasonId: '2023-24', seasonStartDate: '2023-09-01', seasonEndDate: '2024-08-31' }),
      season({ id: 'b', seasonId: '2025-26', isCurrent: true }),
      season({ id: 'c', seasonId: '2024-25', seasonStartDate: '2024-09-01', seasonEndDate: '2025-08-31' }),
      season({ id: 'd', seasonId: 'draft-1', status: 'draft' }),
      season({ id: 'e', seasonId: 'retired-1', status: 'retired' }),
    ];
    const ids = resolveEffectiveSeasons(records, NOW, 'en').map((s) => s.id);
    expect(ids).toEqual(['2025-26', '2024-25', '2023-24']);
  });
});
