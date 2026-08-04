/**
 * Governed season catalog domain module — public barrel.
 *
 * The season catalog is the persisted, tenant-isolated, operationally governed source of truth for
 * seasons. It evolves the existing `affiliation.season` table additively (migration 0022): a
 * lifecycle (draft → published → retired), a single-current invariant, a persisted application
 * window, bilingual labels, and an append-only event log — with every command recorded through
 * audit + transactional outbox. Phase and application-window state are DERIVED at read time.
 */

export * from './SeasonCatalogTypes.js';
export {
  isAcceptingApplications,
  isApplicationWindowOpen,
  pickSeasonLabel,
  resolveEffectiveSeason,
  resolveEffectiveSeasons,
  resolveSeasonPhase,
} from './effectiveSeason.js';
export {
  SEASON_APPLICATIONS_CLOSED_MESSAGE_TYPE,
  SEASON_APPLICATIONS_OPENED_MESSAGE_TYPE,
  SEASON_CREATED_MESSAGE_TYPE,
  SEASON_MADE_CURRENT_MESSAGE_TYPE,
  SEASON_PUBLISHED_MESSAGE_TYPE,
  SEASON_RETIRED_MESSAGE_TYPE,
  SEASON_REVISED_MESSAGE_TYPE,
  seasonDedupeKey,
  type CloseSeasonWindowCommand,
  type CreateSeasonDraftCommand,
  type CreateSeasonDraftOutcome,
  type MakeSeasonCurrentCommand,
  type OpenSeasonWindowCommand,
  type PublishSeasonCommand,
  type RetireSeasonCommand,
  type ReviseSeasonDraftCommand,
  type SeasonCatalogStore,
  type SeasonCommandMeta,
  type SeasonMutationOutcome,
} from './SeasonCatalogStore.js';
export { PgSeasonCatalogStore, SEASON_OUTBOX_MAX_RETRIES } from './PgSeasonCatalogStore.js';
export { SeasonCatalogService } from './SeasonCatalogService.js';
