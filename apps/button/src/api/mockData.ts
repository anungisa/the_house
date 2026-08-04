/**
 * Deterministic synthetic context data for browser tests and offline development.
 *
 * NON-PRODUCTION ONLY. Mirrors the shape and re-authorization behaviour of the governed
 * `GET /v1/button/context` endpoint so the e2e suite exercises the real client/guard/routing
 * paths without a backend. Selecting an organization outside the accessible set throws the same
 * `access-denied` error the server would return (fail closed).
 */

import {
  ButtonApiError,
  ButtonCapability,
  type ButtonContextSelection,
  type ButtonContextView,
  type SeasonView,
} from './types';

export type MockScenario =
  | 'representative'
  | 'reviewer'
  | 'finance'
  | 'no-authority'
  | 'expired'
  | 'revoked'
  | 'service-error';

/** The closed set of synthetic scenarios the mock transport supports. */
export const MOCK_SCENARIOS: readonly MockScenario[] = [
  'representative',
  'reviewer',
  'finance',
  'no-authority',
  'expired',
  'revoked',
  'service-error',
];

/** Narrow an arbitrary string to a known {@link MockScenario} (fail closed to unknown). */
export function isMockScenario(value: string | null | undefined): value is MockScenario {
  return value !== null && value !== undefined && (MOCK_SCENARIOS as readonly string[]).includes(value);
}

const SEASONS: readonly SeasonView[] = [
  { id: '2024-25', label: '2024\u201325', current: false, phase: 'past', acceptingApplications: false },
  { id: '2025-26', label: '2025\u201326', current: true, phase: 'current', acceptingApplications: true },
  { id: '2026-27', label: '2026\u201327', current: false, phase: 'upcoming', acceptingApplications: false },
];

const ORG = {
  organizationId: 'club-1',
  displayName: 'Riverside Curling Club',
  organizationType: 'local',
  jurisdiction: { code: 'member', label: 'Member association', level: 'local' },
  affiliationAvailable: true,
} as const;

function currentSeason(selection: ButtonContextSelection): SeasonView {
  if (selection.season) {
    const match = SEASONS.find((s) => s.id === selection.season);
    if (!match) throw new ButtonApiError('invalid-selection', 400, 'Unknown season.');
    return match;
  }
  return SEASONS.find((s) => s.current) ?? SEASONS[0]!;
}

export function mockContextForScenario(
  scenario: MockScenario,
  selection: ButtonContextSelection,
): ButtonContextView {
  if (scenario === 'service-error') {
    throw new ButtonApiError('service-unavailable', 503, 'The service is temporarily unavailable.');
  }

  const locale = selection.locale ?? 'en';
  const requestedOrg = selection.organizationId;
  // Re-authorize the requested organization exactly like the server (fail closed).
  if (requestedOrg !== undefined && requestedOrg !== ORG.organizationId) {
    throw new ButtonApiError('access-denied', 403, 'Organization not available.');
  }

  if (scenario === 'no-authority') {
    return {
      user: { displayName: 'representative.displayNameFallback', locale },
      locale,
      representativeAuthorities: [],
      accessibleOrganizations: [],
      availableSeasons: SEASONS,
      currentContext: null,
      capabilities: [],
      supportReference: 'BTN-NOACCESS',
    };
  }

  if (scenario === 'reviewer') {
    return {
      user: { displayName: 'reviewer.displayNameFallback', locale },
      locale,
      representativeAuthorities: [],
      accessibleOrganizations: [ORG],
      availableSeasons: SEASONS,
      currentContext: null,
      capabilities: [ButtonCapability.ReviewAffiliation],
    };
  }

  if (scenario === 'finance') {
    return {
      user: { displayName: 'finance.displayNameFallback', locale },
      locale,
      representativeAuthorities: [],
      accessibleOrganizations: [ORG],
      availableSeasons: SEASONS,
      currentContext: null,
      capabilities: [ButtonCapability.ReviewAffiliationFinance],
    };
  }

  const status = scenario === 'expired' ? 'expired' : scenario === 'revoked' ? 'revoked' : 'active';
  const season = currentSeason(selection);
  const selected = requestedOrg === ORG.organizationId;

  return {
    user: { displayName: 'representative.displayNameFallback', locale },
    locale,
    representativeAuthorities: [
      {
        organizationId: ORG.organizationId,
        organizationDisplayName: ORG.displayName,
        status,
        ...(status === 'expired' ? { validUntil: '2025-01-01T00:00:00.000Z' } : {}),
      },
    ],
    accessibleOrganizations: [ORG],
    availableSeasons: SEASONS,
    currentContext: selected
      ? {
          organizationId: ORG.organizationId,
          organizationDisplayName: ORG.displayName,
          jurisdiction: ORG.jurisdiction,
          affiliationAvailable: ORG.affiliationAvailable,
          season,
          authorityStatus: status,
        }
      : null,
    capabilities:
      status === 'active'
        ? selected
          ? [
              ButtonCapability.SelectContext,
              ButtonCapability.ViewAffiliation,
              ButtonCapability.ViewAffiliationStanding,
            ]
          : [ButtonCapability.SelectContext]
        : [ButtonCapability.SelectContext],
  };
}
