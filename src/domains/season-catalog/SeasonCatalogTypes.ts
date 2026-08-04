/**
 * Governed season catalog — domain types.
 *
 * The catalog holds SEASON FACTS with an explicit lifecycle. `status` and `is_current` are the
 * AUTHORITATIVE, mutation-driven fields; a season's phase (upcoming / current / past) and whether
 * it is accepting applications are DERIVED at read time from the persisted application window +
 * the current instant. The wall clock evaluates persisted windows — it never invents a season.
 *
 * A representative NEVER sees drafts, internal command ids, audit actors, source references, or
 * version numbers: {@link EffectiveSeason} is the only representative-safe projection.
 */

/** Governed season lifecycle state. */
export type SeasonStatus = 'draft' | 'published' | 'retired';

/** Derived temporal phase of a published season relative to the current instant. */
export type SeasonPhase = 'upcoming' | 'current' | 'past';

/** Append-only season event types (parity with the migration CHECK). */
export type SeasonEventType =
  | 'created'
  | 'revised'
  | 'published'
  | 'made_current'
  | 'applications_opened'
  | 'applications_closed'
  | 'retired';

/** Representative locale for bilingual label selection. */
export type SeasonLocale = 'en' | 'fr';

/**
 * The governed season head (aggregate). `id` is the row UUID; `seasonId` is the stable text key
 * used by applications and the browser. `status` / `isCurrent` are authoritative; phase and
 * acceptingApplications are never stored.
 */
export interface SeasonRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly seasonId: string;
  readonly status: SeasonStatus;
  readonly isCurrent: boolean;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Governed English label (back-compat `label` is retained separately). */
  readonly labelEn?: string;
  /** Governed French label. */
  readonly labelFr?: string;
  /** Legacy language-neutral label from migration 0003. */
  readonly legacyLabel?: string;
  /** ISO date (yyyy-mm-dd). */
  readonly seasonStartDate?: string;
  readonly seasonEndDate?: string;
  /** ISO-8601 timestamp; window opens at/after this instant (null = open from the start). */
  readonly applicationOpensAt?: string;
  /** ISO-8601 timestamp; window closes at this instant (null = never closes on its own). */
  readonly applicationClosesAt?: string;
  readonly sourceReference?: string;
  readonly idempotencyKey?: string;
  readonly createdBy?: string;
  readonly updatedBy?: string;
}

/**
 * The representative-safe season projection. `id` is the STABLE season key (never the row UUID),
 * because it is the value the browser echoes back and applications persist. Drafts and retired
 * seasons are NEVER projected into this shape.
 */
export interface EffectiveSeason {
  readonly id: string;
  readonly label: string;
  readonly current: boolean;
  readonly phase: SeasonPhase;
  readonly acceptingApplications: boolean;
}

/** Server-side season authorization outcome for a requested season key. */
export type SeasonResolution =
  | { readonly outcome: 'ok'; readonly season: EffectiveSeason }
  /** The season key is unknown, a draft, or retired — not viewable/selectable. */
  | { readonly outcome: 'unavailable' };
