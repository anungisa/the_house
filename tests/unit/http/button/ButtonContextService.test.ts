import { describe, it, expect } from 'vitest';

import {
  ButtonContextService,
  ClockDerivedSeasonCatalog,
  OrganizationTypeJurisdictionResolver,
  RoleDerivedRepresentativeAuthorityProvider,
  type RepresentativeAuthorityProvider,
  type ResolvedAuthority,
} from '../../../../src/http/button/ButtonContextService.js';
import {
  ButtonCapability,
  CLUB_AFFILIATION_REPRESENTATIVE_ROLE,
} from '../../../../src/http/button/ButtonContextTypes.js';
import type { OrganizationReadStore } from '../../../../src/http/organization/OrganizationReadHttpAdapter.js';
import type {
  OrganizationListFilter,
  OrganizationListResult,
  OrganizationView,
} from '../../../../src/domains/organization-registry/OrganizationTypes.js';
import type { AuthContext, AuthActor } from '../../../../src/http/auth/AuthContext.js';
import { AppError, ErrorCode } from '../../../../src/shared/errors/AppError.js';

/**
 * Unit tests for the Button representative-context assembly service.
 *
 * Fully hermetic: a fake tenant-scoped organization read store + injectable authority provider
 * stand in for the real registry and authorization service. NO database, NO Docker, NO Azure.
 * These assertions prove the SERVER is the sole source of authority/capabilities and that a
 * browser-supplied selection is re-authorized (fail closed) before it is honoured.
 */

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const NOW_ISO = '2026-01-15T00:00:00.000Z'; // mid-season → current season 2025-26

function org(over: Partial<OrganizationView> & { organizationId: string }): OrganizationView {
  return {
    tenantId: TENANT_A,
    organizationType: 'local',
    displayName: 'Riverside Curling Club',
    status: 'active',
    source: 'manual',
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...over,
  };
}

/** A fake tenant-isolated read store: getById only returns rows for the matching tenant. */
class FakeOrganizationReadStore implements OrganizationReadStore {
  constructor(private readonly rows: readonly OrganizationView[]) {}
  list(_tenantId: string, _filter: OrganizationListFilter): Promise<OrganizationListResult> {
    return Promise.resolve({ items: [] });
  }
  getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined> {
    return Promise.resolve(
      this.rows.find((r) => r.tenantId === tenantId && r.organizationId === organizationId),
    );
  }
}

/** An authority provider that returns a fixed authority (for expired/revoked scenarios). */
class FixedAuthorityProvider implements RepresentativeAuthorityProvider {
  constructor(private readonly authorities: readonly ResolvedAuthority[]) {}
  authoritiesFor(): readonly ResolvedAuthority[] {
    return this.authorities;
  }
}

function actor(over: Partial<AuthActor> = {}): AuthActor {
  return {
    userId: 'user-1',
    roleKeys: [CLUB_AFFILIATION_REPRESENTATIVE_ROLE],
    permissionKeys: [],
    organizationId: 'club-1',
    ...over,
  };
}

function auth(tenantId = TENANT_A, over: Partial<AuthActor> = {}): AuthContext {
  return { tenantId, actor: actor(over), mode: 'demo' };
}

function buildService(
  rows: readonly OrganizationView[],
  authorities?: RepresentativeAuthorityProvider,
): ButtonContextService {
  return new ButtonContextService({
    organizations: new FakeOrganizationReadStore(rows),
    authorities: authorities ?? new RoleDerivedRepresentativeAuthorityProvider(),
    seasons: new ClockDerivedSeasonCatalog(),
    jurisdictions: new OrganizationTypeJurisdictionResolver(),
    nowIso: () => NOW_ISO,
  });
}

describe('ButtonContextService', () => {
  it('(1) assembles context for an authorized representative (no selection → null context)', async () => {
    const svc = buildService([org({ organizationId: 'club-1' })]);
    const view = await svc.resolve(auth(), {});

    expect(view.accessibleOrganizations.map((o) => o.organizationId)).toEqual(['club-1']);
    expect(view.representativeAuthorities).toHaveLength(1);
    expect(view.representativeAuthorities[0]?.status).toBe('active');
    expect(view.currentContext).toBeNull();
    // With accessible orgs but no active selection, only the select-context capability is present.
    expect(view.capabilities).toEqual([ButtonCapability.SelectContext]);
    expect(view.availableSeasons.some((s) => s.current)).toBe(true);
  });

  it('(2) a signed-in NON-representative gets no authority and no affiliation capability', async () => {
    const svc = buildService([org({ organizationId: 'club-1' })]);
    const view = await svc.resolve(auth(TENANT_A, { roleKeys: ['organization_reader'] }), {
      organizationId: 'club-1',
    });

    expect(view.representativeAuthorities).toHaveLength(0);
    // Selection is accessible, but with no active authority the affiliation capability is withheld.
    expect(view.currentContext?.authorityStatus).toBe('revoked');
    expect(view.capabilities).not.toContain(ButtonCapability.ViewAffiliation);
  });

  it('(3) a valid selection is honoured and preserved (org + jurisdiction + season)', async () => {
    const svc = buildService([org({ organizationId: 'club-1', organizationType: 'local' })]);
    const view = await svc.resolve(auth(), { organizationId: 'club-1', season: '2026-27' });

    expect(view.currentContext).not.toBeNull();
    expect(view.currentContext?.organizationId).toBe('club-1');
    expect(view.currentContext?.season.id).toBe('2026-27');
    expect(view.currentContext?.jurisdiction.code).toBe('member');
    expect(view.currentContext?.authorityStatus).toBe('active');
    expect(view.capabilities).toContain(ButtonCapability.ViewAffiliation);
  });

  it('(4) an unauthorized organization selection is REJECTED (fail closed, 403)', async () => {
    const svc = buildService([org({ organizationId: 'club-1' })]);
    // The actor can only represent club-1; requesting club-9 must be rejected server-side.
    await expect(
      svc.resolve(auth(TENANT_A, { organizationId: 'club-1' }), { organizationId: 'club-9' }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('(5) a cross-tenant organization is invisible and its selection is rejected', async () => {
    // Row belongs to TENANT_B; the TENANT_A actor references it but the store is tenant-isolated.
    const svc = buildService([org({ organizationId: 'club-b', tenantId: TENANT_B })]);
    const view = await svc.resolve(auth(TENANT_A, { organizationId: 'club-b' }), {});
    expect(view.accessibleOrganizations).toHaveLength(0);
    await expect(
      svc.resolve(auth(TENANT_A, { organizationId: 'club-b' }), { organizationId: 'club-b' }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('(6) an EXPIRED authority is reflected and withholds the affiliation capability', async () => {
    const svc = buildService(
      [org({ organizationId: 'club-1' })],
      new FixedAuthorityProvider([
        { organizationId: 'club-1', status: 'expired', validUntil: '2025-01-01T00:00:00.000Z' },
      ]),
    );
    const view = await svc.resolve(auth(), { organizationId: 'club-1' });
    expect(view.representativeAuthorities[0]?.status).toBe('expired');
    expect(view.representativeAuthorities[0]?.validUntil).toBe('2025-01-01T00:00:00.000Z');
    expect(view.currentContext?.authorityStatus).toBe('expired');
    expect(view.capabilities).not.toContain(ButtonCapability.ViewAffiliation);
  });

  it('(7) a REVOKED authority is reflected and withholds the affiliation capability', async () => {
    const svc = buildService(
      [org({ organizationId: 'club-1' })],
      new FixedAuthorityProvider([{ organizationId: 'club-1', status: 'revoked' }]),
    );
    const view = await svc.resolve(auth(), { organizationId: 'club-1' });
    expect(view.currentContext?.authorityStatus).toBe('revoked');
    expect(view.capabilities).not.toContain(ButtonCapability.ViewAffiliation);
  });

  it('(8) an unknown season selection is rejected (400 INVALID_INPUT)', async () => {
    const svc = buildService([org({ organizationId: 'club-1' })]);
    await expect(
      svc.resolve(auth(), { organizationId: 'club-1', season: '1999-00' }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('(9) an unauthenticated actor (blank tenant/user) is rejected (401)', async () => {
    const svc = buildService([]);
    await expect(
      svc.resolve({ tenantId: '', actor: actor(), mode: 'demo' }, {}),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      svc.resolve({ tenantId: TENANT_A, actor: actor({ userId: '' }), mode: 'demo' }, {}),
    ).rejects.toMatchObject({ code: ErrorCode.UNAUTHENTICATED });
  });

  it('(10) only suspended/archived orgs are excluded from the accessible set', async () => {
    const svc = buildService([org({ organizationId: 'club-1', status: 'suspended' })]);
    const view = await svc.resolve(auth(), {});
    expect(view.accessibleOrganizations).toHaveLength(0);
    expect(view.supportReference).toBe('BTN-NOACCESS');
  });

  it('(11) derives the bounded finance-workbench capability from trusted financial authority', async () => {
    const svc = buildService([]);
    const view = await svc.resolve(
      auth(TENANT_A, {
        roleKeys: ['financial_reconciler'],
        organizationId: '22222222-2222-4222-8222-222222222222',
      }),
      {},
    );
    expect(view.capabilities).toContain(ButtonCapability.ReviewAffiliationFinance);
    expect(view.capabilities).not.toContain(ButtonCapability.ReviewAffiliation);
  });
});

describe('RoleDerivedRepresentativeAuthorityProvider', () => {
  const provider = new RoleDerivedRepresentativeAuthorityProvider();
  const representativeActor: AuthActor = {
    userId: 'rep-1',
    roleKeys: [CLUB_AFFILIATION_REPRESENTATIVE_ROLE],
    permissionKeys: [],
    organizationId: 'org-own',
  };

  it('grants active authority only for the actor\'s own representable organizations', () => {
    const authorities = provider.authoritiesFor(TENANT_A, representativeActor, ['org-own']);
    expect(authorities).toEqual([{ organizationId: 'org-own', status: 'active' }]);
  });

  it('fails closed: never grants authority for an organization the actor does not reference', () => {
    // Defense-in-depth: even if a caller passes a wider accessible set, the provider intersects
    // it with the actor's explicit organizational references and drops anything unreferenced.
    const authorities = provider.authoritiesFor(TENANT_A, representativeActor, [
      'org-own',
      'org-not-mine',
    ]);
    expect(authorities).toEqual([{ organizationId: 'org-own', status: 'active' }]);
  });

  it('grants nothing to an actor without the representative role', () => {
    const authorities = provider.authoritiesFor(
      TENANT_A,
      { userId: 'u', roleKeys: ['viewer'], permissionKeys: [], organizationId: 'org-own' },
      ['org-own'],
    );
    expect(authorities).toEqual([]);
  });
});
