/**
 * Governed season catalog application service.
 *
 * Validates command input at the boundary, delegates the atomic write to the store, and maps store
 * outcomes onto stable {@link AppError} codes. It also exposes the representative-safe READ paths
 * used by the Button season catalog and the server-side season authorization used by the
 * affiliation surface.
 *
 * PUBLISH COMPLETENESS is enforced HERE (not as a table CHECK): a season may only be published when
 * it carries bilingual labels and a valid date span. Legacy rows classified as published by the
 * migration may retain null dates, but no NEW publish may proceed without them.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { resolveEffectiveSeason, resolveEffectiveSeasons } from './effectiveSeason.js';
import {
  type CloseSeasonWindowCommand,
  type CreateSeasonDraftCommand,
  type MakeSeasonCurrentCommand,
  type OpenSeasonWindowCommand,
  type PublishSeasonCommand,
  type RetireSeasonCommand,
  type ReviseSeasonDraftCommand,
  type SeasonCatalogStore,
  type SeasonMutationOutcome,
} from './SeasonCatalogStore.js';
import type {
  EffectiveSeason,
  SeasonLocale,
  SeasonRecord,
  SeasonResolution,
} from './SeasonCatalogTypes.js';

function requireNonBlank(value: string | undefined, field: string): string {
  const trimmed = value?.trim?.() ?? '';
  if (trimmed === '') {
    throw new AppError(ErrorCode.INVALID_INPUT, `Season ${field} is required.`, {
      details: { field },
    });
  }
  return value as string;
}

function assertDateSpan(startDate: string | undefined, endDate: string | undefined): void {
  if (startDate !== undefined && endDate !== undefined && Date.parse(endDate) <= Date.parse(startDate)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Season end date must be after the start date.', {
      details: { field: 'seasonEndDate' },
    });
  }
}

function assertWindowOrder(opensAt: string | undefined, closesAt: string | undefined): void {
  if (opensAt !== undefined && closesAt !== undefined && Date.parse(closesAt) <= Date.parse(opensAt)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Application window must close after it opens.', {
      details: { field: 'applicationClosesAt' },
    });
  }
}

export class SeasonCatalogService {
  constructor(
    private readonly store: SeasonCatalogStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---- Representative-facing reads ------------------------------------------------------------

  /** The representative-safe published season catalog for a tenant (current first, newest next). */
  async seasons(
    tenantId: string,
    nowIso: string = this.now().toISOString(),
    locale: SeasonLocale = 'en',
  ): Promise<readonly EffectiveSeason[]> {
    const records = await this.store.listPublishedForTenant(tenantId);
    return resolveEffectiveSeasons(records, nowIso, locale);
  }

  /**
   * Server-side season authorization for a requested key. Returns `ok` with the effective season
   * for any PUBLISHED season (including past / closed ones — viewable), and `unavailable` for
   * unknown keys, drafts, and retired seasons. Initiation eligibility is a further check on
   * {@link EffectiveSeason.acceptingApplications} at the call site.
   */
  async resolveSeason(
    tenantId: string,
    seasonId: string,
    nowIso: string = this.now().toISOString(),
    locale: SeasonLocale = 'en',
  ): Promise<SeasonResolution> {
    const record = await this.store.getBySeasonId(tenantId, seasonId);
    if (record === undefined) {
      return { outcome: 'unavailable' };
    }
    const season = resolveEffectiveSeason(record, nowIso, locale);
    return season === undefined ? { outcome: 'unavailable' } : { outcome: 'ok', season };
  }

  /** Read a single season head (operational/admin path), regardless of status. */
  async getSeason(tenantId: string, seasonId: string): Promise<SeasonRecord | undefined> {
    return this.store.getBySeasonId(tenantId, seasonId);
  }

  // ---- Governed commands ----------------------------------------------------------------------

  async createDraft(command: CreateSeasonDraftCommand): Promise<SeasonRecord> {
    requireNonBlank(command.seasonId, 'seasonId');
    requireNonBlank(command.labelEn, 'labelEn');
    requireNonBlank(command.labelFr, 'labelFr');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    assertDateSpan(command.seasonStartDate, command.seasonEndDate);
    assertWindowOrder(command.applicationOpensAt, command.applicationClosesAt);

    const outcome = await this.store.createDraft(command);
    if (outcome.outcome === 'conflict') {
      throw new AppError(ErrorCode.SEASON_CONFLICT, 'A season with this key already exists.', {
        details: { seasonId: command.seasonId },
      });
    }
    return outcome.record;
  }

  async reviseDraft(command: ReviseSeasonDraftCommand): Promise<SeasonRecord> {
    requireNonBlank(command.seasonId, 'seasonId');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    assertDateSpan(command.seasonStartDate, command.seasonEndDate);
    assertWindowOrder(command.applicationOpensAt, command.applicationClosesAt);
    return this.applyOrThrow(command.seasonId, await this.store.reviseDraft(command));
  }

  async publish(command: PublishSeasonCommand): Promise<SeasonRecord> {
    requireNonBlank(command.seasonId, 'seasonId');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');

    // Publish completeness is enforced at the command boundary (see file header).
    const head = await this.store.getBySeasonId(command.tenantId, command.seasonId);
    if (head === undefined) {
      throw new AppError(ErrorCode.SEASON_NOT_FOUND, 'The referenced season does not exist.', {
        details: { seasonId: command.seasonId },
      });
    }
    if (head.status === 'draft') {
      const missing: string[] = [];
      if ((head.labelEn ?? '').trim() === '') missing.push('labelEn');
      if ((head.labelFr ?? '').trim() === '') missing.push('labelFr');
      if (head.seasonStartDate === undefined) missing.push('seasonStartDate');
      if (head.seasonEndDate === undefined) missing.push('seasonEndDate');
      if (missing.length > 0) {
        throw new AppError(
          ErrorCode.SEASON_CONFLICT,
          'A season must have bilingual labels and a valid date span before it can be published.',
          { details: { seasonId: command.seasonId, missing } },
        );
      }
    }
    return this.applyOrThrow(command.seasonId, await this.store.publish(command));
  }

  async makeCurrent(command: MakeSeasonCurrentCommand): Promise<SeasonRecord> {
    requireNonBlank(command.seasonId, 'seasonId');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    return this.applyOrThrow(command.seasonId, await this.store.makeCurrent(command));
  }

  async openWindow(command: OpenSeasonWindowCommand): Promise<SeasonRecord> {
    requireNonBlank(command.seasonId, 'seasonId');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    assertWindowOrder(command.applicationOpensAt, command.applicationClosesAt);
    return this.applyOrThrow(command.seasonId, await this.store.openWindow(command));
  }

  async closeWindow(command: CloseSeasonWindowCommand): Promise<SeasonRecord> {
    requireNonBlank(command.seasonId, 'seasonId');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    return this.applyOrThrow(command.seasonId, await this.store.closeWindow(command));
  }

  async retire(command: RetireSeasonCommand): Promise<SeasonRecord> {
    requireNonBlank(command.seasonId, 'seasonId');
    requireNonBlank(command.idempotencyKey, 'idempotencyKey');
    return this.applyOrThrow(command.seasonId, await this.store.retire(command));
  }

  private applyOrThrow(seasonId: string, outcome: SeasonMutationOutcome): SeasonRecord {
    switch (outcome.outcome) {
      case 'applied':
      case 'replayed':
        return outcome.record;
      case 'not_found':
        throw new AppError(ErrorCode.SEASON_NOT_FOUND, 'The referenced season does not exist.', {
          details: { seasonId },
        });
      case 'version_conflict':
        throw new AppError(
          ErrorCode.SEASON_CONFLICT,
          'The season was modified concurrently; retry with the current version.',
          { details: { seasonId, currentVersion: outcome.record.version } },
        );
      case 'invalid_state':
        throw new AppError(
          ErrorCode.SEASON_CONFLICT,
          'The season is not in a state that permits this operation.',
          { details: { seasonId, status: outcome.record.status } },
        );
    }
  }
}
