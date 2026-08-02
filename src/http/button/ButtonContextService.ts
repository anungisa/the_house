/**
 * The Button — representative context assembly service.
 *
 * Assembles the {@link ButtonContextView} from TRUSTED server-side inputs only:
 *  - the resolved {@link AuthContext} (tenant + actor established by an auth resolver);
 *  - the tenant-isolated Organization Registry read projection (accessible organizations);
 *  - a {@link RepresentativeAuthorityProvider} (server-side authority + validity — NOT the browser);
 *  - a {@link SeasonCatalog} and {@link JurisdictionResolver} (bounded, policy-derived context).
 *
 * It NEVER trusts organization/jurisdiction/season identifiers asserted by the browser: a
 * requested selection is re-authorized against the actor's accessible organizations, and an
 * unauthorized/cross-tenant selection is REJECTED (fail closed). It performs NO governed writes,
 * never invokes the kernel, and never returns internal role/permission matrices, raw guard facts,
 * cross-tenant identifiers, financial internals, or restricted evidence.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AuthContext, AuthActor } from '../auth/AuthContext.js';
import type { OrganizationReadStore } from '../organization/OrganizationReadHttpAdapter.js';
import type { OrganizationView } from '../../domains/organization-registry/OrganizationTypes.js';
import {
  ButtonCapability,
  CLUB_AFFILIATION_REPRESENTATIVE_ROLE,
  coerceLocale,
  type AccessibleOrganizationView,
  type AuthorityStatus,
  type ButtonContextView,
  type ButtonLocale,
  type JurisdictionView,
  type RepresentativeAuthorityView,
  type SeasonView,
  type SelectedContextView,
} from './ButtonContextTypes.js';

/** A server-resolved representative authority over one organization. */
export interface ResolvedAuthority {
  readonly organizationId: string;
  readonly status: AuthorityStatus;
  readonly validUntil?: string;
}

/**
 * Resolves the representative authorities a trusted actor holds over a set of accessible
 * organizations. This is the SERVER-SIDE source of authority + validity — the browser never
 * supplies it. The default implementation derives authority from the actor's trusted role keys;
 * a real deployment injects a House authorization-service-backed provider.
 */
export interface RepresentativeAuthorityProvider {
  authoritiesFor(
    tenantId: string,
    actor: AuthActor,
    accessibleOrganizationIds: readonly string[],
  ): Promise<readonly ResolvedAuthority[]> | readonly ResolvedAuthority[];
}

/** Bounded catalog of seasons a representative may act within. */
export interface SeasonCatalog {
  seasons(nowIso: string): readonly SeasonView[];
}

/** Resolves a bounded jurisdiction context for an organization. */
export interface JurisdictionResolver {
  jurisdictionFor(organization: OrganizationView, actor: AuthActor): JurisdictionView;
}

export interface ButtonContextServiceDeps {
  readonly organizations: OrganizationReadStore;
  readonly authorities: RepresentativeAuthorityProvider;
  readonly seasons: SeasonCatalog;
  readonly jurisdictions: JurisdictionResolver;
  /** Injectable clock (ISO now) for deterministic season/validity resolution in tests. */
  readonly nowIso: () => string;
}

/** A representative-safe requested selection (already parsed from the query string). */
export interface ButtonContextSelection {
  readonly organizationId?: string;
  readonly season?: string;
  readonly locale?: string;
}

/**
 * Gather the organization ids a trusted actor may represent, from their identity context ONLY.
 * A representative acts for specific organizations (their club/scope), never "every tenant org":
 * we fail closed to the actor's explicit organizational references so the browser cannot widen
 * the accessible set.
 */
function representableOrganizationIds(actor: AuthActor): readonly string[] {
  const ids = [
    actor.organizationId,
    actor.localOrganizationId,
    actor.scopeId,
    actor.organizationUnitId,
  ].filter((id): id is string => typeof id === 'string' && id.trim() !== '');
  return [...new Set(ids)];
}

/** True when the actor holds the trusted representative role (or is a platform admin). */
function hasRepresentativeRole(actor: AuthActor): boolean {
  return (
    actor.roleKeys.includes(CLUB_AFFILIATION_REPRESENTATIVE_ROLE) ||
    actor.roleKeys.includes('platform_admin')
  );
}

/**
 * Default authority provider: derives authority from the actor's trusted role keys. When the
 * actor holds the representative role, they hold an OPEN-ENDED active authority over each
 * accessible organization. Time-bounded/revoked authority arrives from a real provider (or a
 * test double); this default never fabricates an expiry.
 */
export class RoleDerivedRepresentativeAuthorityProvider implements RepresentativeAuthorityProvider {
  authoritiesFor(
    _tenantId: string,
    actor: AuthActor,
    accessibleOrganizationIds: readonly string[],
  ): readonly ResolvedAuthority[] {
    if (!hasRepresentativeRole(actor)) return [];
    // Defense-in-depth: never grant authority beyond the actor's own explicit organizational
    // references, even if a caller passes a wider accessible set. Fail closed to the intersection
    // of the requested organizations and the actor's representable organizations.
    const representable = new Set(representableOrganizationIds(actor));
    return accessibleOrganizationIds
      .filter((organizationId) => representable.has(organizationId))
      .map((organizationId) => ({
        organizationId,
        status: 'active' as const,
      }));
  }
}

/**
 * Default season catalog (POLICY-DERIVED STUB — a known Slice A/B gap): derives the current
 * season and its immediate neighbours from the clock using a Sept→Aug season window. A real
 * deployment injects the governed season catalog.
 */
export class ClockDerivedSeasonCatalog implements SeasonCatalog {
  seasons(nowIso: string): readonly SeasonView[] {
    const now = new Date(nowIso);
    const year = now.getUTCFullYear();
    // Season starts in September (month index 8). Before September we are in the prior window.
    const startYear = now.getUTCMonth() >= 8 ? year : year - 1;
    const make = (start: number, current: boolean): SeasonView => ({
      id: `${start}-${String((start + 1) % 100).padStart(2, '0')}`,
      label: `${start}\u2013${start + 1}`,
      current,
    });
    return [make(startYear - 1, false), make(startYear, true), make(startYear + 1, false)];
  }
}

/**
 * Default jurisdiction resolver (POLICY-DERIVED STUB — a known gap): maps an organization to a
 * bounded jurisdiction label key by its type. A real deployment resolves the province/territory
 * from the governed organization hierarchy.
 */
export class OrganizationTypeJurisdictionResolver implements JurisdictionResolver {
  jurisdictionFor(organization: OrganizationView, _actor: AuthActor): JurisdictionView {
    if (organization.organizationType === 'national') {
      return { code: 'national', labelKey: 'jurisdiction.national' };
    }
    if (organization.organizationType === 'regional') {
      return { code: 'regional', labelKey: 'jurisdiction.regional' };
    }
    return { code: 'member', labelKey: 'jurisdiction.member' };
  }
}

export class ButtonContextService {
  constructor(private readonly deps: ButtonContextServiceDeps) {}

  /**
   * Build the representative-safe context for the trusted actor. `selection` carries the browser's
   * requested organization/season/locale, which are RE-AUTHORIZED here (never trusted blindly).
   */
  async resolve(
    auth: AuthContext,
    selection: ButtonContextSelection,
  ): Promise<ButtonContextView> {
    // 1) Authentication: a non-blank tenant + subject is required (fail closed → 401).
    if (auth.tenantId.trim() === '' || auth.actor.userId.trim() === '') {
      throw new AppError(
        ErrorCode.UNAUTHENTICATED,
        'A trusted tenant and user identity are required to load the Button context.',
      );
    }

    const locale: ButtonLocale = coerceLocale(selection.locale);
    const nowIso = this.deps.nowIso();

    // 2) Accessible organizations — tenant-isolated read of the actor's explicit references only.
    const candidateIds = representableOrganizationIds(auth.actor);
    const organizations: OrganizationView[] = [];
    for (const id of candidateIds) {
      const org = await this.deps.organizations.getById(auth.tenantId, id);
      // Only surface existing, tenant-owned, active organizations.
      if (org !== undefined && org.status === 'active') {
        organizations.push(org);
      }
    }
    const accessibleOrganizations: AccessibleOrganizationView[] = organizations.map((org) => ({
      organizationId: org.organizationId,
      displayName: org.displayName,
      organizationType: org.organizationType,
      jurisdiction: this.deps.jurisdictions.jurisdictionFor(org, auth.actor),
    }));
    const accessibleById = new Map(organizations.map((o) => [o.organizationId, o]));

    // 3) Representative authorities (server-side; browser never asserts these).
    const resolvedAuthorities = await this.deps.authorities.authoritiesFor(
      auth.tenantId,
      auth.actor,
      organizations.map((o) => o.organizationId),
    );
    const authorityByOrg = new Map(resolvedAuthorities.map((a) => [a.organizationId, a]));
    const representativeAuthorities: RepresentativeAuthorityView[] = resolvedAuthorities.map((a) => {
      const org = accessibleById.get(a.organizationId);
      return {
        organizationId: a.organizationId,
        organizationDisplayName: org?.displayName ?? a.organizationId,
        status: a.status,
        ...(a.validUntil !== undefined ? { validUntil: a.validUntil } : {}),
      };
    });

    // 4) Seasons (bounded, policy-derived).
    const availableSeasons = this.deps.seasons.seasons(nowIso);

    // 5) Re-authorize the requested selection (fail closed on anything unaccessible).
    const currentContext = this.resolveSelection(
      selection,
      accessibleById,
      authorityByOrg,
      availableSeasons,
      auth.actor,
    );

    // 6) Bounded capabilities, derived from authority (never a permission dump).
    const capabilities = this.deriveCapabilities(
      accessibleOrganizations.length > 0,
      currentContext,
      auth.actor,
    );

    return {
      user: { displayName: this.safeDisplayName(auth.actor, locale), locale },
      locale,
      representativeAuthorities,
      accessibleOrganizations,
      availableSeasons,
      currentContext,
      capabilities,
      ...(accessibleOrganizations.length === 0
        ? { supportReference: 'BTN-NOACCESS' }
        : {}),
    };
  }

  private resolveSelection(
    selection: ButtonContextSelection,
    accessibleById: Map<string, OrganizationView>,
    authorityByOrg: Map<string, ResolvedAuthority>,
    availableSeasons: readonly SeasonView[],
    actor: AuthActor,
  ): SelectedContextView | null {
    const requestedOrg = selection.organizationId?.trim();
    if (requestedOrg === undefined || requestedOrg === '') return null;

    // Re-authorization: the requested organization MUST be in the actor's accessible set.
    // A cross-tenant or otherwise unauthorized organization is REJECTED (fail closed).
    const org = accessibleById.get(requestedOrg);
    if (org === undefined) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'The requested organization is not available for this representative.',
      );
    }

    // Season selection must be within the bounded catalog; default to the current season.
    const requestedSeason = selection.season?.trim();
    let season = availableSeasons.find((s) => s.current) ?? availableSeasons[0];
    if (requestedSeason !== undefined && requestedSeason !== '') {
      const match = availableSeasons.find((s) => s.id === requestedSeason);
      if (match === undefined) {
        throw new AppError(
          ErrorCode.INVALID_INPUT,
          'The requested season is not available for this context.',
        );
      }
      season = match;
    }
    if (season === undefined) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'No season is available for this context.');
    }

    const authority = authorityByOrg.get(requestedOrg);
    return {
      organizationId: org.organizationId,
      organizationDisplayName: org.displayName,
      jurisdiction: this.deps.jurisdictions.jurisdictionFor(org, actor),
      season,
      authorityStatus: authority?.status ?? 'revoked',
    };
  }

  private deriveCapabilities(
    hasAccessibleOrgs: boolean,
    currentContext: SelectedContextView | null,
    actor: AuthActor,
  ): readonly ButtonCapability[] {
    const capabilities: ButtonCapability[] = [];
    if (hasAccessibleOrgs) capabilities.push(ButtonCapability.SelectContext);
    if (currentContext !== null && currentContext.authorityStatus === 'active') {
      capabilities.push(ButtonCapability.ViewAffiliation);
      capabilities.push(ButtonCapability.ViewAffiliationStanding);
    }
    if (
      actor.roleKeys.some((role) =>
        [
          'reviewer',
          'approver',
          'regional_reviewer',
          'national_reviewer',
          'workflow_admin',
          'admin',
          'platform_admin',
        ].includes(role),
      )
    ) {
      capabilities.push(ButtonCapability.ReviewAffiliation);
    }
    if (
      actor.roleKeys.some((role) =>
        [
          'financial_assessor',
          'financial_assessment_reviser',
          'financial_provider',
          'financial_accounting',
          'financial_reconciler',
          'financial_waiver_authority',
          'admin',
          'platform_admin',
        ].includes(role),
      )
    ) {
      capabilities.push(ButtonCapability.ReviewAffiliationFinance);
    }
    return capabilities;
  }

  /**
   * A representative-safe display label. We do NOT expose the raw subject id (avoid leaking a
   * potentially cross-tenant identifier). A verifying edge may inject a display name; otherwise
   * the frontend localizes a generic representative label from this key.
   */
  private safeDisplayName(actor: AuthActor, _locale: ButtonLocale): string {
    void actor;
    return 'representative.displayNameFallback';
  }
}
