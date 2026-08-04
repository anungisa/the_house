/**
 * Governed jurisdiction resolver — the single, tenant-isolated, hierarchy-aware source of an
 * organization's governing jurisdiction (§4). It REPLACES the organization-type-derived stub: an
 * organization type grants no jurisdiction, and nothing is inferred from a name.
 *
 * Precedence (highest first), evaluated at a resolution instant `nowIso`:
 *   1. the organization's OWN active, effective assignment (direct OR inheritable) — a direct
 *      assignment overrides any inherited one;
 *   2. otherwise, the NEAREST ancestor (walking the governed organization parent chain) with an
 *      active, effective, INHERITABLE assignment referencing a PUBLISHED jurisdiction;
 *   3. otherwise `unresolved`.
 *
 * An assignment is "effective" only when its status is active, its validity window contains the
 * instant, and the jurisdiction it references is PUBLISHED (a draft/retired jurisdiction, or a
 * revoked/future/expired assignment, does not resolve). Two assignments resolving at the SAME
 * precedence are `ambiguous`; a broken or cyclic hierarchy is `invalid_hierarchy`. Every non-
 * resolved outcome fails CLOSED — the surface collapses them to one safe "unavailable" posture.
 */

import type { OrganizationView } from '../organization-registry/OrganizationTypes.js';
import type { JurisdictionStore } from './JurisdictionStore.js';
import {
  toJurisdictionView,
  type JurisdictionAssignmentRecord,
  type JurisdictionLocale,
  type JurisdictionRecord,
  type JurisdictionResolution,
} from './JurisdictionTypes.js';

/**
 * The async, governed jurisdiction resolution contract shared by every Button consumer (context,
 * affiliation overview + initiation, requirement binding, standing/outcome context, renewal
 * eligibility). Resolution is tenant-scoped, evaluated at `nowIso`, and localized.
 */
export interface JurisdictionResolver {
  jurisdictionFor(
    tenantId: string,
    organization: OrganizationView,
    nowIso: string,
    locale: JurisdictionLocale,
  ): Promise<JurisdictionResolution>;
}

/** Narrow, read-only view of the organization hierarchy the resolver walks. */
export interface JurisdictionOrganizationReader {
  getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined>;
}

/** Read surface the resolver needs from the jurisdiction store. */
export type JurisdictionResolverStore = Pick<
  JurisdictionStore,
  'activeAssignmentsForOrganization' | 'getJurisdictionById'
>;

/** Defensive ceiling on the ancestor walk (mirrors OrganizationRegistryService). */
const MAX_HIERARCHY_DEPTH = 64;

/** An assignment that has passed every effectiveness test, paired with its published jurisdiction. */
interface EffectiveAssignment {
  readonly assignment: JurisdictionAssignmentRecord;
  readonly jurisdiction: JurisdictionRecord;
}

export class GovernedJurisdictionResolver implements JurisdictionResolver {
  constructor(
    private readonly store: JurisdictionResolverStore,
    private readonly organizations: JurisdictionOrganizationReader,
  ) {}

  async jurisdictionFor(
    tenantId: string,
    organization: OrganizationView,
    nowIso: string,
    locale: JurisdictionLocale,
  ): Promise<JurisdictionResolution> {
    const nowMs = Date.parse(nowIso);
    const now = Number.isFinite(nowMs) ? nowMs : Date.now();

    // 1) DIRECT precedence: the organization's own effective assignment (any inheritance mode)
    //    overrides inheritance. Two effective assignments here is an ambiguity (fail closed).
    const direct = await this.effectiveAssignments(tenantId, organization.organizationId, now);
    if (direct.length > 1) return { outcome: 'ambiguous' };
    if (direct.length === 1) {
      return { outcome: 'resolved', jurisdiction: toJurisdictionView(direct[0]!.jurisdiction, locale) };
    }

    // 2) INHERITED precedence: nearest ancestor with an effective INHERITABLE assignment.
    let cursor = organization.parentOrganizationId;
    let depth = 0;
    const visited = new Set<string>([organization.organizationId]);
    while (cursor !== undefined) {
      if (depth++ > MAX_HIERARCHY_DEPTH || visited.has(cursor)) {
        return { outcome: 'invalid_hierarchy' };
      }
      visited.add(cursor);
      const ancestor = await this.organizations.getById(tenantId, cursor);
      if (ancestor === undefined) {
        // A missing ancestor breaks the governed chain — fail closed rather than silently stop.
        return { outcome: 'invalid_hierarchy' };
      }
      const inheritable = (
        await this.effectiveAssignments(tenantId, ancestor.organizationId, now)
      ).filter((e) => e.assignment.inheritanceMode === 'inheritable');
      if (inheritable.length > 1) return { outcome: 'ambiguous' };
      if (inheritable.length === 1) {
        return {
          outcome: 'resolved',
          jurisdiction: toJurisdictionView(inheritable[0]!.jurisdiction, locale),
        };
      }
      cursor = ancestor.parentOrganizationId;
    }

    return { outcome: 'unresolved' };
  }

  /**
   * All effective assignments for an organization: active status, validity window containing the
   * instant, and a PUBLISHED referenced jurisdiction. A revoked/future/expired assignment, or one
   * referencing a draft/retired/missing jurisdiction, is excluded.
   */
  private async effectiveAssignments(
    tenantId: string,
    organizationId: string,
    nowMs: number,
  ): Promise<readonly EffectiveAssignment[]> {
    const assignments = await this.store.activeAssignmentsForOrganization(tenantId, organizationId);
    const effective: EffectiveAssignment[] = [];
    for (const assignment of assignments) {
      if (assignment.status !== 'active') continue;
      const from = Date.parse(assignment.validFrom);
      if (Number.isFinite(from) && from > nowMs) continue; // not yet in effect
      if (assignment.validUntil !== undefined) {
        const until = Date.parse(assignment.validUntil);
        if (Number.isFinite(until) && until <= nowMs) continue; // expired
      }
      const jurisdiction = await this.store.getJurisdictionById(tenantId, assignment.jurisdictionId);
      if (jurisdiction === undefined || jurisdiction.status !== 'published') continue;
      effective.push({ assignment, jurisdiction });
    }
    return effective;
  }
}
