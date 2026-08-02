/**
 * Representative-safe context types consumed by the Button frontend.
 *
 * These mirror the server's `GET /v1/button/context` response envelope EXACTLY. The browser is a
 * consumer only: it never asserts authority, capabilities, or accessible organizations — every
 * field here is derived and re-authorized server-side.
 */

export type ButtonLocale = 'en' | 'fr';

export type AuthorityStatus = 'active' | 'expired' | 'revoked';

export const ButtonCapability = {
  SelectContext: 'context.select',
  ViewAffiliation: 'affiliation.view',
  ViewAffiliationStanding: 'affiliation.standing.view',
  ReviewAffiliation: 'affiliation.review',
  ReviewAffiliationFinance: 'affiliation.finance.review',
} as const;
export type ButtonCapability = (typeof ButtonCapability)[keyof typeof ButtonCapability];

export interface JurisdictionView {
  readonly code: string;
  readonly labelKey: string;
}

export interface SeasonView {
  readonly id: string;
  readonly label: string;
  readonly current: boolean;
}

export interface AccessibleOrganizationView {
  readonly organizationId: string;
  readonly displayName: string;
  readonly organizationType: string;
  readonly jurisdiction: JurisdictionView;
}

export interface RepresentativeAuthorityView {
  readonly organizationId: string;
  readonly organizationDisplayName: string;
  readonly status: AuthorityStatus;
  readonly validUntil?: string;
}

export interface SelectedContextView {
  readonly organizationId: string;
  readonly organizationDisplayName: string;
  readonly jurisdiction: JurisdictionView;
  readonly season: SeasonView;
  readonly authorityStatus: AuthorityStatus;
}

export interface ButtonUserView {
  readonly displayName: string;
  readonly locale: ButtonLocale;
}

export interface ButtonContextView {
  readonly user: ButtonUserView;
  readonly locale: ButtonLocale;
  readonly representativeAuthorities: readonly RepresentativeAuthorityView[];
  readonly accessibleOrganizations: readonly AccessibleOrganizationView[];
  readonly availableSeasons: readonly SeasonView[];
  readonly currentContext: SelectedContextView | null;
  readonly capabilities: readonly ButtonCapability[];
  readonly supportReference?: string;
}

export interface ButtonContextResponseBody {
  readonly status: 'ok';
  readonly requestId: string;
  readonly context: ButtonContextView;
}

/** A representative-safe selection the browser may request (re-authorized server-side). */
export interface ButtonContextSelection {
  readonly organizationId?: string;
  readonly season?: string;
  readonly locale?: ButtonLocale;
}

/** Stable, non-leaking error categories the UI can branch on. */
export type ButtonErrorCategory =
  | 'unauthenticated'
  | 'access-denied'
  | 'invalid-selection'
  | 'service-unavailable';

/** A sanitized error surfaced to the UI. NEVER carries stack traces or internal detail. */
export class ButtonApiError extends Error {
  constructor(
    readonly category: ButtonErrorCategory,
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'ButtonApiError';
  }
}
