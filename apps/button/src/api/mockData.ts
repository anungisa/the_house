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
  | 'no-authority'
  | 'expired'
  | 'revoked'
  | 'service-error';

const SEASONS: readonly SeasonView[] = [
  { id: '2024-25', label: '2024\u201325', current: false },
  { id: '2025-26', label: '2025\u201326', current: true },
  { id: '2026-27', label: '2026\u201327', current: false },
];

const ORG = {
  organizationId: 'club-1',
  displayName: 'Riverside Curling Club',
  organizationType: 'local',
  jurisdiction: { code: 'member', labelKey: 'jurisdiction.member' },
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
          season,
          authorityStatus: status,
        }
      : null,
    capabilities:
      status === 'active'
        ? selected
          ? [ButtonCapability.SelectContext, ButtonCapability.ViewAffiliation]
          : [ButtonCapability.SelectContext]
        : [ButtonCapability.SelectContext],
  };
}
