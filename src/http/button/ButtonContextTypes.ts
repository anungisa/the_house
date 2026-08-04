/**
 * The Button — representative-safe context model (types only).
 *
 * `GET /v1/button/context` returns the MINIMUM representative-safe projection a signed-in
 * club-affiliation representative needs to orient themselves and act: who they are, which
 * organizations/seasons they may act for, their representative authority (and its validity),
 * the currently selected context (when a valid selection is supplied), and the bounded Button
 * capabilities they are permitted. It is derived ENTIRELY from the trusted server-side identity
 * context + governed House projections — the browser never supplies or asserts any of it.
 *
 * DELIBERATELY EXCLUDED (never returned): internal role/permission matrices, staff-only notes,
 * restricted evidence, financial accounting internals, cross-tenant identifiers, and raw guard
 * facts. The shapes below are the ONLY thing the Button frontend is allowed to consume.
 */

import type {
  JurisdictionLevel,
  JurisdictionView,
} from '../../domains/jurisdiction/JurisdictionTypes.js';

/** Supported representative-facing locales (bilingual: English + French). */
export type ButtonLocale = 'en' | 'fr';

/** The two supported locales as a runtime list (for validation + tests). */
export const BUTTON_LOCALES: readonly ButtonLocale[] = ['en', 'fr'];

/** Narrow an arbitrary string to a supported locale, defaulting to English. */
export function coerceLocale(value: string | undefined): ButtonLocale {
  return value === 'fr' ? 'fr' : 'en';
}

/**
 * The named representative-authority role a signed-in user must hold (server-side) to act as a
 * club-affiliation representative. A signed-in user WITHOUT this authority is not a representative.
 */
export const CLUB_AFFILIATION_REPRESENTATIVE_ROLE = 'club_affiliation_representative';

/** Bounded Button capabilities. Task-oriented, never a generic permission dump. */
export const ButtonCapability = {
  /** May select/switch the acting organization/jurisdiction/season context. */
  SelectContext: 'context.select',
  /** May view the representative affiliation overview for the selected context. */
  ViewAffiliation: 'affiliation.view',
  /** May view the representative standing (expiry & renewal) for the selected context. */
  ViewAffiliationStanding: 'affiliation.standing.view',
  /** May open the resource-scoped affiliation review workbench. */
  ReviewAffiliation: 'affiliation.review',
  /** May open the tenant- and scope-bounded financial reconciliation workbench. */
  ReviewAffiliationFinance: 'affiliation.finance.review',
} as const;
export type ButtonCapability = (typeof ButtonCapability)[keyof typeof ButtonCapability];

/** The lifecycle status of a representative authority, as resolved server-side. */
export type AuthorityStatus = 'active' | 'expired' | 'revoked';

/**
 * A governed, representative-safe jurisdiction projection (resolved server-side from the persisted
 * jurisdiction catalog + organization assignment edge). `label` is ALREADY localized for the
 * request locale; the browser renders it directly (no key lookup). It NEVER carries a source
 * reference, assignment id, parent lineage, actor, version, or reason code.
 */
export type { JurisdictionLevel, JurisdictionView };

/** A season the representative may act within. */
export interface SeasonView {
  readonly id: string;
  readonly label: string;
  readonly current: boolean;
  /** Derived temporal phase relative to now: an upcoming, the current, or a past season. */
  readonly phase: 'upcoming' | 'current' | 'past';
  /** Whether NEW applications may be initiated for this season right now (current + open window). */
  readonly acceptingApplications: boolean;
}

/** An organization the representative may act for (safe projection). */
export interface AccessibleOrganizationView {
  readonly organizationId: string;
  readonly displayName: string;
  readonly organizationType: string;
  /**
   * The organization's governed jurisdiction, when one resolves cleanly from the persisted
   * catalog + assignment hierarchy. OMITTED (fail closed) when no assignment resolves, or when
   * resolution is ambiguous / the hierarchy is broken — in which case `affiliationAvailable` is
   * false and the client must not offer to initiate an affiliation for this organization.
   */
  readonly jurisdiction?: JurisdictionView;
  /**
   * Whether a NEW affiliation may be initiated for this organization right now: true only when a
   * single governed jurisdiction resolves. Derived server-side; the browser never asserts it.
   */
  readonly affiliationAvailable: boolean;
}

/** A representative authority over one organization, with its server-resolved validity. */
export interface RepresentativeAuthorityView {
  readonly organizationId: string;
  readonly organizationDisplayName: string;
  readonly status: AuthorityStatus;
  /** ISO-8601 expiry when the authority is time-bounded; omitted when open-ended. */
  readonly validUntil?: string;
}

/** The currently selected acting context (only present when a valid selection is supplied). */
export interface SelectedContextView {
  readonly organizationId: string;
  readonly organizationDisplayName: string;
  /**
   * The selected organization's governed jurisdiction, when one resolves cleanly. OMITTED (fail
   * closed) when unresolved / ambiguous / hierarchy broken; `affiliationAvailable` is then false.
   */
  readonly jurisdiction?: JurisdictionView;
  /** Whether a NEW affiliation may be initiated in this selected context right now. */
  readonly affiliationAvailable: boolean;
  readonly season: SeasonView;
  /** The authority backing the current selection (drives guarded routing on the client). */
  readonly authorityStatus: AuthorityStatus;
}

/** The signed-in representative's safe self-description. */
export interface ButtonUserView {
  /** A representative-safe display label. NEVER a cross-tenant identifier or raw subject id. */
  readonly displayName: string;
  readonly locale: ButtonLocale;
}

/** The complete representative-safe context projection. */
export interface ButtonContextView {
  readonly user: ButtonUserView;
  readonly locale: ButtonLocale;
  readonly representativeAuthorities: readonly RepresentativeAuthorityView[];
  readonly accessibleOrganizations: readonly AccessibleOrganizationView[];
  readonly availableSeasons: readonly SeasonView[];
  /** Null when no valid selection is supplied (the client must resolve context first). */
  readonly currentContext: SelectedContextView | null;
  readonly capabilities: readonly ButtonCapability[];
  /**
   * A support-safe reference the representative can quote when access is denied or incomplete.
   * Never a stack trace, SQL, internal id, or policy detail.
   */
  readonly supportReference?: string;
}

/** The HTTP response envelope for `GET /v1/button/context`. */
export interface ButtonContextResponseBody {
  readonly status: 'ok';
  readonly requestId: string;
  readonly context: ButtonContextView;
}
