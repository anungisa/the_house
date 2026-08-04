/**
 * In-memory {@link SeasonAuthorization} doubles for Button affiliation adapter tests.
 *
 * `acceptingSeasonAuthorization` treats every season as the current, open season (used by tests
 * that focus on organization authorization, not season gating). `seasonAuthorizationFrom` builds a
 * catalog from explicit entries so season-specific tests can assert unknown / draft / retired /
 * past / closed / current-open behavior deterministically.
 */

import type { SeasonAuthorization } from '../../src/http/button/affiliation/ButtonAffiliationHttpAdapter.js';
import type { EffectiveSeason, SeasonResolution } from '../../src/domains/season-catalog/index.js';

/** Every requested season resolves to a current, application-accepting season. */
export const acceptingSeasonAuthorization: SeasonAuthorization = {
  resolveSeason(_tenantId, seasonId): Promise<SeasonResolution> {
    return Promise.resolve({
      outcome: 'ok',
      season: {
        id: seasonId,
        label: seasonId,
        current: true,
        phase: 'current',
        acceptingApplications: true,
      },
    });
  },
};

/** Build a season authorization from an explicit map of season key -> effective season (or absent). */
export function seasonAuthorizationFrom(
  seasons: Readonly<Record<string, EffectiveSeason>>,
): SeasonAuthorization {
  return {
    resolveSeason(_tenantId, seasonId): Promise<SeasonResolution> {
      const season = seasons[seasonId];
      return Promise.resolve(
        season === undefined ? { outcome: 'unavailable' } : { outcome: 'ok', season },
      );
    },
  };
}
