import {
  ButtonCapability,
  type AuthorityStatus,
  type ButtonContextView,
  type ButtonLocale,
  type SeasonView,
} from '../api/types';

const SEASONS: readonly SeasonView[] = [
  { id: '2024-25', label: '2024\u201325', current: false, phase: 'past', acceptingApplications: false },
  { id: '2025-26', label: '2025\u201326', current: true, phase: 'current', acceptingApplications: true },
  { id: '2026-27', label: '2026\u201327', current: false, phase: 'upcoming', acceptingApplications: false },
];

const ORG = {
  organizationId: 'club-1',
  displayName: 'Riverside Curling Club',
  organizationType: 'local',
  jurisdiction: { code: 'member', labelKey: 'jurisdiction.member' },
} as const;

export function contextWith(options: {
  readonly selected?: boolean;
  readonly authorityStatus?: AuthorityStatus;
  readonly hasAuthority?: boolean;
  readonly locale?: ButtonLocale;
}): ButtonContextView {
  const locale = options.locale ?? 'en';
  const hasAuthority = options.hasAuthority ?? true;
  const status = options.authorityStatus ?? 'active';
  const selected = options.selected ?? false;

  return {
    user: { displayName: 'representative.displayNameFallback', locale },
    locale,
    representativeAuthorities: hasAuthority
      ? [
          {
            organizationId: ORG.organizationId,
            organizationDisplayName: ORG.displayName,
            status,
            ...(status === 'expired' ? { validUntil: '2025-01-01T00:00:00.000Z' } : {}),
          },
        ]
      : [],
    accessibleOrganizations: hasAuthority ? [ORG] : [],
    availableSeasons: SEASONS,
    currentContext: selected
      ? {
          organizationId: ORG.organizationId,
          organizationDisplayName: ORG.displayName,
          jurisdiction: ORG.jurisdiction,
          season: SEASONS[1]!,
          authorityStatus: status,
        }
      : null,
    capabilities:
      hasAuthority && status === 'active' && selected
        ? [
            ButtonCapability.SelectContext,
            ButtonCapability.ViewAffiliation,
            ButtonCapability.ViewAffiliationStanding,
          ]
        : hasAuthority
          ? [ButtonCapability.SelectContext]
          : [],
    ...(hasAuthority ? {} : { supportReference: 'BTN-NOACCESS' }),
  };
}
