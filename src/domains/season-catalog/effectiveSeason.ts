/**
 * Deterministic season projection: turns a persisted {@link SeasonRecord} + the current instant
 * into the representative-safe {@link EffectiveSeason}. All temporal reasoning happens here so the
 * Button, the kernel guard, and the tests all interpret a season identically.
 *
 * Rules (fail-closed):
 * - Only `published` seasons are ever projected. `draft` and `retired` resolve to `undefined`.
 * - `phase` is authoritative-`current` first, then derived from persisted dates.
 * - `acceptingApplications` REQUIRES published + is_current + an open persisted window.
 * - Labels select by locale with deterministic fallbacks; a season always has a non-empty label.
 */

import type {
  EffectiveSeason,
  SeasonLocale,
  SeasonPhase,
  SeasonRecord,
} from './SeasonCatalogTypes.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse an ISO instant to epoch ms; returns undefined for missing/invalid values. */
function parseInstant(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * A season-end DATE is inclusive of the whole final day. We compare against the end of that day so
 * a season is not treated as "past" on its closing date.
 */
function endOfDay(dateMs: number): number {
  return dateMs + MS_PER_DAY - 1;
}

/** Select a representative-facing label with deterministic locale fallbacks. */
export function pickSeasonLabel(record: SeasonRecord, locale: SeasonLocale): string {
  const candidates =
    locale === 'fr'
      ? [record.labelFr, record.labelEn, record.legacyLabel]
      : [record.labelEn, record.labelFr, record.legacyLabel];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed !== undefined && trimmed.length > 0) {
      return trimmed;
    }
  }
  return record.seasonId;
}

/** Derive the temporal phase of a season relative to `nowIso`. */
export function resolveSeasonPhase(record: SeasonRecord, nowIso: string): SeasonPhase {
  if (record.isCurrent) {
    return 'current';
  }
  const now = parseInstant(nowIso) ?? Date.now();
  const endMs = parseInstant(record.seasonEndDate);
  if (endMs !== undefined && endOfDay(endMs) < now) {
    return 'past';
  }
  // Not current, and its end has not passed (or is unknown) => it is ahead of the current season.
  return 'upcoming';
}

/**
 * Whether the persisted application window is open at `nowIso`. A null bound means "unbounded on
 * that side" (open from the start / never self-closes). This is window math only — it does NOT
 * consider status or is_current (see {@link isAcceptingApplications}).
 */
export function isApplicationWindowOpen(record: SeasonRecord, nowIso: string): boolean {
  const now = parseInstant(nowIso) ?? Date.now();
  const opensMs = parseInstant(record.applicationOpensAt);
  const closesMs = parseInstant(record.applicationClosesAt);
  const opened = opensMs === undefined || opensMs <= now;
  const notClosed = closesMs === undefined || now < closesMs;
  return opened && notClosed;
}

/**
 * Whether NEW applications may be initiated: published AND the authoritative current season AND
 * inside its persisted window. This is the single source of truth for initiation eligibility.
 */
export function isAcceptingApplications(record: SeasonRecord, nowIso: string): boolean {
  return (
    record.status === 'published' && record.isCurrent && isApplicationWindowOpen(record, nowIso)
  );
}

/**
 * Project a persisted season to its representative-safe view, or `undefined` when the season must
 * not be surfaced (draft or retired).
 */
export function resolveEffectiveSeason(
  record: SeasonRecord,
  nowIso: string,
  locale: SeasonLocale,
): EffectiveSeason | undefined {
  if (record.status !== 'published') {
    return undefined;
  }
  return {
    id: record.seasonId,
    label: pickSeasonLabel(record, locale),
    current: record.isCurrent,
    phase: resolveSeasonPhase(record, nowIso),
    acceptingApplications: isAcceptingApplications(record, nowIso),
  };
}

/**
 * Governed RENEWAL target-season selection.
 *
 * A renewal advances a standing to a LATER governed season. Candidates must be, at `nowIso`:
 *  - published AND currently accepting applications ({@link isAcceptingApplications}); and
 *  - strictly LATER than the source season by PERSISTED start dates — never by string arithmetic on
 *    the season key (so "2025-26" -> "2026-27" is derived from dates, not text).
 * The source season is identified by key; if the source season has no persisted start date, no
 * "later" comparison can be made and the selection is empty (fail closed). The same season is never
 * a target. Results are deterministically ordered by start date (earliest first), then by key.
 */
export function resolveRenewalTargetSeasons(
  records: readonly SeasonRecord[],
  sourceSeasonId: string,
  sourceSeasonStartIso: string | undefined,
  nowIso: string,
  locale: SeasonLocale,
): readonly EffectiveSeason[] {
  const sourceStart = parseInstant(sourceSeasonStartIso);
  if (sourceStart === undefined) {
    return [];
  }
  return records
    .filter((record) => record.seasonId !== sourceSeasonId)
    .filter((record) => isAcceptingApplications(record, nowIso))
    .filter((record) => {
      const start = parseInstant(record.seasonStartDate);
      return start !== undefined && start > sourceStart;
    })
    .slice()
    .sort((a, b) => {
      const delta = (parseInstant(a.seasonStartDate) ?? 0) - (parseInstant(b.seasonStartDate) ?? 0);
      if (delta !== 0) {
        return delta;
      }
      return a.seasonId < b.seasonId ? -1 : a.seasonId > b.seasonId ? 1 : 0;
    })
    .map((record) => resolveEffectiveSeason(record, nowIso, locale))
    .filter((view): view is EffectiveSeason => view !== undefined);
}

/**
 * Project + order a set of records for representative display: the current season first, then most
 * recent by start date. Drafts and retired seasons are dropped.
 */
export function resolveEffectiveSeasons(
  records: readonly SeasonRecord[],
  nowIso: string,
  locale: SeasonLocale,
): readonly EffectiveSeason[] {
  const startOf = (record: SeasonRecord): number =>
    parseInstant(record.seasonStartDate) ?? Number.NEGATIVE_INFINITY;
  return records
    .filter((record) => record.status === 'published')
    .slice()
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) {
        return a.isCurrent ? -1 : 1;
      }
      const delta = startOf(b) - startOf(a);
      if (delta !== 0) {
        return delta;
      }
      return a.seasonId < b.seasonId ? 1 : a.seasonId > b.seasonId ? -1 : 0;
    })
    .map((record) => resolveEffectiveSeason(record, nowIso, locale))
    .filter((view): view is EffectiveSeason => view !== undefined);
}
