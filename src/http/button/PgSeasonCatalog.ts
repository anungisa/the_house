/**
 * Governed Button season catalog (PostgreSQL-backed).
 *
 * Implements the Button {@link SeasonCatalog} port over the governed {@link SeasonCatalogService}:
 * it returns ONLY the tenant's published seasons, in the actor's locale, projected to the
 * representative-safe {@link SeasonView}. Drafts, retired seasons, internal ids, audit actors, and
 * version numbers never cross this boundary. This is the production wiring that replaces the
 * clock-derived demo catalog.
 */

import type { SeasonCatalogService } from '../../domains/season-catalog/index.js';
import type { SeasonCatalog } from './ButtonContextService.js';
import type { ButtonLocale, SeasonView } from './ButtonContextTypes.js';

export class PgSeasonCatalog implements SeasonCatalog {
  constructor(private readonly service: SeasonCatalogService) {}

  async seasons(
    tenantId: string,
    nowIso: string,
    locale: ButtonLocale,
  ): Promise<readonly SeasonView[]> {
    const seasons = await this.service.seasons(tenantId, nowIso, locale);
    // EffectiveSeason is already representative-safe and shares SeasonView's shape.
    return seasons.map((season) => ({
      id: season.id,
      label: season.label,
      current: season.current,
      phase: season.phase,
      acceptingApplications: season.acceptingApplications,
    }));
  }
}
