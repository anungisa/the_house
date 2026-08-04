/**
 * Governed season catalog store port + command/outcome shapes + stable dedupe keys.
 *
 * A season row lives through many governed commands (createDraft → publish → makeCurrent →
 * open/close window → retire). Each command is a governed transition: the store mutates the season
 * head, appends an append-only `affiliation.season_event`, writes a `governance.audit_event`, and
 * enqueues a transactional outbox message — ALL inside ONE tenant-scoped transaction. Business
 * validation and error mapping live in {@link SeasonCatalogService}; the store returns a
 * deterministic outcome. Domain code never mutates `status` / `is_current` outside this store.
 */

import type { OutboxCorrelation } from '../participant-registry/ParticipantRegistryStore.js';
import type { SeasonRecord } from './SeasonCatalogTypes.js';

export const SEASON_CREATED_MESSAGE_TYPE = 'season.created';
export const SEASON_REVISED_MESSAGE_TYPE = 'season.revised';
export const SEASON_PUBLISHED_MESSAGE_TYPE = 'season.published';
export const SEASON_MADE_CURRENT_MESSAGE_TYPE = 'season.made_current';
export const SEASON_APPLICATIONS_OPENED_MESSAGE_TYPE = 'season.applications_opened';
export const SEASON_APPLICATIONS_CLOSED_MESSAGE_TYPE = 'season.applications_closed';
export const SEASON_RETIRED_MESSAGE_TYPE = 'season.retired';

/** Stable per-command dedupe key: one message per (message type, idempotency key). */
export function seasonDedupeKey(messageType: string, idempotencyKey: string): string {
  return `${messageType}:${idempotencyKey}`;
}

/** Metadata carried onto audit/outbox lineage for a command. */
export type SeasonCommandMeta = {
  readonly actorUserId?: string;
} & OutboxCorrelation;

/** Fields shared by every governed season command. */
interface SeasonCommandBase {
  readonly tenantId: string;
  /** Stable season key (e.g. `2025-26`); the head is resolved by (tenant, seasonId). */
  readonly seasonId: string;
  readonly idempotencyKey: string;
  readonly meta?: SeasonCommandMeta;
}

/** Create a new DRAFT season. Fails closed if the season key already exists. */
export interface CreateSeasonDraftCommand extends SeasonCommandBase {
  readonly labelEn: string;
  readonly labelFr: string;
  readonly seasonStartDate?: string;
  readonly seasonEndDate?: string;
  readonly applicationOpensAt?: string;
  readonly applicationClosesAt?: string;
  readonly sourceReference?: string;
  readonly createdBy?: string;
}

export type CreateSeasonDraftOutcome =
  | { readonly outcome: 'created'; readonly record: SeasonRecord }
  | { readonly outcome: 'replayed'; readonly record: SeasonRecord }
  | { readonly outcome: 'conflict'; readonly record: SeasonRecord };

/** Revise DRAFT metadata (labels / dates / window). Only permitted while `draft`. */
export interface ReviseSeasonDraftCommand extends SeasonCommandBase {
  readonly labelEn?: string;
  readonly labelFr?: string;
  readonly seasonStartDate?: string;
  readonly seasonEndDate?: string;
  readonly applicationOpensAt?: string;
  readonly applicationClosesAt?: string;
  readonly expectedVersion?: number;
  readonly updatedBy?: string;
}

/** Publish a completed draft (draft → published). */
export interface PublishSeasonCommand extends SeasonCommandBase {
  readonly expectedVersion?: number;
  readonly publishedBy?: string;
}

/** Make a published season the tenant's single current season (serialized switch). */
export interface MakeSeasonCurrentCommand extends SeasonCommandBase {
  readonly expectedVersion?: number;
  readonly actedBy?: string;
}

/** Open (or set) the persisted application window for a published season. */
export interface OpenSeasonWindowCommand extends SeasonCommandBase {
  /** Defaults to now at the DB when omitted. */
  readonly applicationOpensAt?: string;
  readonly applicationClosesAt?: string;
  readonly expectedVersion?: number;
  readonly actedBy?: string;
}

/** Close the persisted application window (sets closes-at). */
export interface CloseSeasonWindowCommand extends SeasonCommandBase {
  /** Defaults to now at the DB when omitted. */
  readonly applicationClosesAt?: string;
  readonly expectedVersion?: number;
  readonly actedBy?: string;
}

/** Retire a season (→ retired). A retired season is never current and never selectable. */
export interface RetireSeasonCommand extends SeasonCommandBase {
  readonly reasonCode?: string;
  readonly expectedVersion?: number;
  readonly actedBy?: string;
}

/**
 * Deterministic outcome for a lifecycle transition on an EXISTING season head.
 * - `applied`: the transition committed.
 * - `replayed`: an idempotent retry; the prior result is returned with no re-mutation.
 * - `not_found`: no season head for (tenant, seasonId).
 * - `version_conflict`: optimistic `expectedVersion` did not match.
 * - `invalid_state`: the head is not in a state that permits this transition.
 */
export type SeasonMutationOutcome =
  | { readonly outcome: 'applied'; readonly record: SeasonRecord }
  | { readonly outcome: 'replayed'; readonly record: SeasonRecord }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'version_conflict'; readonly record: SeasonRecord }
  | { readonly outcome: 'invalid_state'; readonly record: SeasonRecord };

/**
 * Persistence port for the governed season catalog. All reads/writes are tenant-scoped and
 * RLS-enforced; cross-tenant rows simply do not resolve.
 */
export interface SeasonCatalogStore {
  createDraft(command: CreateSeasonDraftCommand): Promise<CreateSeasonDraftOutcome>;
  reviseDraft(command: ReviseSeasonDraftCommand): Promise<SeasonMutationOutcome>;
  publish(command: PublishSeasonCommand): Promise<SeasonMutationOutcome>;
  makeCurrent(command: MakeSeasonCurrentCommand): Promise<SeasonMutationOutcome>;
  openWindow(command: OpenSeasonWindowCommand): Promise<SeasonMutationOutcome>;
  closeWindow(command: CloseSeasonWindowCommand): Promise<SeasonMutationOutcome>;
  retire(command: RetireSeasonCommand): Promise<SeasonMutationOutcome>;

  /** Every PUBLISHED season for a tenant (representative catalog source). */
  listPublishedForTenant(tenantId: string): Promise<readonly SeasonRecord[]>;

  /** Resolve a single season head by its stable key, regardless of status. */
  getBySeasonId(tenantId: string, seasonId: string): Promise<SeasonRecord | undefined>;

  /** Resolve a single season head by row id. */
  getById(tenantId: string, id: string): Promise<SeasonRecord | undefined>;
}
