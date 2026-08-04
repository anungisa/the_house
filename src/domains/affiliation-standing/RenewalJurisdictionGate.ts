/**
 * Governed renewal jurisdiction gate.
 *
 * Wraps the shared {@link JurisdictionResolver} (the single, hierarchy-aware source of an
 * organization's governing jurisdiction) behind the narrow {@link RenewalJurisdictionGate} the
 * eligibility service depends on. It answers only "does this organization resolve to a governing
 * jurisdiction right now?" and fails CLOSED (false) for every non-resolved outcome (unresolved,
 * ambiguous, invalid/broken hierarchy) or a missing organization — an organization type or name
 * never grants a jurisdiction.
 */

import type { JurisdictionResolver } from '../jurisdiction/JurisdictionResolver.js';
import type { OrganizationView } from '../organization-registry/OrganizationTypes.js';
import type { RenewalJurisdictionGate } from './StandingRenewalEligibilityService.js';

/** Read surface the gate needs to load the organization the resolver walks. */
export interface GateOrganizationReader {
  getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined>;
}

export class GovernedRenewalJurisdictionGate implements RenewalJurisdictionGate {
  constructor(
    private readonly jurisdictions: JurisdictionResolver,
    private readonly organizations: GateOrganizationReader,
  ) {}

  async resolves(tenantId: string, organizationId: string, nowIso: string): Promise<boolean> {
    const organization = await this.organizations.getById(tenantId, organizationId);
    if (organization === undefined || organization.status !== 'active') return false;
    const resolution = await this.jurisdictions.jurisdictionFor(
      tenantId,
      organization,
      nowIso,
      'en',
    );
    return resolution.outcome === 'resolved';
  }
}
