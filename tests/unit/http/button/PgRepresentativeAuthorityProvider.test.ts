import { describe, expect, it, vi } from 'vitest';

import type { AuthActor } from '../../../../src/http/auth/AuthContext.js';
import { PgRepresentativeAuthorityProvider } from '../../../../src/http/button/PgRepresentativeAuthorityProvider.js';
import type { RepresentativeAuthorityService } from '../../../../src/domains/representative-authority/index.js';
import type { EffectiveAuthority } from '../../../../src/domains/representative-authority/index.js';

const TENANT = 'tenant-a';
const NOW = '2026-01-01T00:00:00.000Z';

function actor(over: Partial<AuthActor> = {}): AuthActor {
  return { userId: 'subject-1', roleKeys: [], permissionKeys: [], ...over };
}

/** A service stub exposing only the method the provider consumes. */
function serviceStub(
  result: readonly EffectiveAuthority[],
): { service: RepresentativeAuthorityService; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn().mockResolvedValue(result);
  return {
    service: { listEffectiveForSubject: spy } as unknown as RepresentativeAuthorityService,
    spy,
  };
}

describe('PgRepresentativeAuthorityProvider', () => {
  it('maps effective authorities to resolved authorities (identity is the lookup key)', async () => {
    const { service, spy } = serviceStub([
      { organizationId: 'org-1', status: 'active', validUntil: '2026-08-31T00:00:00.000Z' },
      { organizationId: 'org-2', status: 'expired' },
    ]);
    const provider = new PgRepresentativeAuthorityProvider(service);

    const result = await provider.authoritiesFor(TENANT, actor(), NOW);

    expect(result).toEqual([
      { organizationId: 'org-1', status: 'active', validUntil: '2026-08-31T00:00:00.000Z' },
      { organizationId: 'org-2', status: 'expired' },
    ]);
    // The subject (userId) and the configured House issuer are the lookup key — never a role key.
    expect(spy).toHaveBeenCalledWith(
      TENANT,
      'house.trusted',
      'subject-1',
      'club_affiliation_representative',
      NOW,
    );
  });

  it('honours a configured issuer override', async () => {
    const { service, spy } = serviceStub([]);
    const provider = new PgRepresentativeAuthorityProvider(service, { issuer: 'entra.example' });
    await provider.authoritiesFor(TENANT, actor(), NOW);
    expect(spy).toHaveBeenCalledWith(
      TENANT,
      'entra.example',
      'subject-1',
      'club_affiliation_representative',
      NOW,
    );
  });

  it('returns nothing (and does not query) for a blank tenant or subject — fail closed', async () => {
    const { service, spy } = serviceStub([{ organizationId: 'org-1', status: 'active' }]);
    const provider = new PgRepresentativeAuthorityProvider(service);

    expect(await provider.authoritiesFor('  ', actor(), NOW)).toEqual([]);
    expect(await provider.authoritiesFor(TENANT, actor({ userId: '' }), NOW)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('never derives authority from role keys alone (a role holder with no grant gets nothing)', async () => {
    const { service } = serviceStub([]);
    const provider = new PgRepresentativeAuthorityProvider(service);
    const result = await provider.authoritiesFor(
      TENANT,
      actor({ roleKeys: ['club_affiliation_representative'], organizationId: 'org-1' }),
      NOW,
    );
    expect(result).toEqual([]);
  });
});
