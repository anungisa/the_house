import { describe, it, expect } from 'vitest';

import {
  GovernedJurisdictionResolver,
  InMemoryJurisdictionStore,
  type JurisdictionOrganizationReader,
} from '../../../../src/domains/jurisdiction/index.js';
import type {
  JurisdictionAssignmentRecord,
  JurisdictionRecord,
} from '../../../../src/domains/jurisdiction/JurisdictionTypes.js';
import type { OrganizationView } from '../../../../src/domains/organization-registry/OrganizationTypes.js';

/**
 * Unit tests for the governed jurisdiction resolver. Fully hermetic: an in-memory jurisdiction
 * store (seeded directly, including the DB-forbidden two-active case) + a fake organization reader
 * stand in for Postgres. These prove the resolver is the SINGLE source of an organization's
 * governing jurisdiction: direct overrides inherited, an organization TYPE grants nothing, every
 * non-resolvable case (revoked / future / expired / draft / retired / ambiguous / broken hierarchy)
 * fails CLOSED, and bilingual labels are projected safely.
 */

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const NOW = '2026-01-15T00:00:00.000Z';
const NOW_MS = Date.parse(NOW);

function jurisdiction(over: Partial<JurisdictionRecord> & { id: string; code: string }): JurisdictionRecord {
  return {
    tenantId: TENANT_A,
    level: 'subdivision',
    labelEn: `${over.code} EN`,
    labelFr: `${over.code} FR`,
    status: 'published',
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function assignment(
  over: Partial<JurisdictionAssignmentRecord> & {
    id: string;
    organizationId: string;
    jurisdictionId: string;
  },
): JurisdictionAssignmentRecord {
  return {
    tenantId: TENANT_A,
    assignmentType: 'primary',
    inheritanceMode: 'direct',
    status: 'active',
    validFrom: '2020-01-01T00:00:00.000Z',
    version: 1,
    assignedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function org(over: Partial<OrganizationView> & { organizationId: string }): OrganizationView {
  return {
    tenantId: TENANT_A,
    organizationType: 'local',
    displayName: over.organizationId,
    status: 'active',
    source: 'manual',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** A tenant-isolated fake organization reader backed by an explicit row set. */
function orgReader(rows: readonly OrganizationView[]): JurisdictionOrganizationReader {
  return {
    getById: (tenantId, organizationId) =>
      Promise.resolve(
        rows.find((r) => r.tenantId === tenantId && r.organizationId === organizationId),
      ),
  };
}

function resolver(
  store: InMemoryJurisdictionStore,
  rows: readonly OrganizationView[] = [],
): GovernedJurisdictionResolver {
  return new GovernedJurisdictionResolver(store, orgReader(rows));
}

describe('GovernedJurisdictionResolver', () => {
  it('resolves an organization DIRECT active assignment to a published jurisdiction', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-1', code: 'on', level: 'subdivision' }));
    store.seedAssignment(assignment({ id: 'a-1', organizationId: 'club-1', jurisdictionId: 'j-1' }));
    const club = org({ organizationId: 'club-1' });

    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({
      outcome: 'resolved',
      jurisdiction: { code: 'on', label: 'on EN', level: 'subdivision' },
    });
  });

  it('projects the FRENCH label when the locale is fr', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-1', code: 'on' }));
    store.seedAssignment(assignment({ id: 'a-1', organizationId: 'club-1', jurisdictionId: 'j-1' }));
    const club = org({ organizationId: 'club-1' });

    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'fr');

    expect(result).toMatchObject({ outcome: 'resolved', jurisdiction: { label: 'on FR' } });
  });

  it('returns UNRESOLVED for an organization with no assignment (type grants nothing)', async () => {
    const store = new InMemoryJurisdictionStore();
    // A 'national' organization type MUST NOT manufacture a jurisdiction on its own.
    const national = org({ organizationId: 'nso-1', organizationType: 'national' });

    const result = await resolver(store, [national]).jurisdictionFor(TENANT_A, national, NOW, 'en');

    expect(result).toEqual({ outcome: 'unresolved' });
  });

  it('INHERITS the nearest ancestor inheritable jurisdiction when the org has none', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-prov', code: 'on', level: 'subdivision' }));
    store.seedAssignment(
      assignment({
        id: 'a-prov',
        organizationId: 'prov-1',
        jurisdictionId: 'j-prov',
        inheritanceMode: 'inheritable',
      }),
    );
    const prov = org({ organizationId: 'prov-1', organizationType: 'regional' });
    const club = org({ organizationId: 'club-1', parentOrganizationId: 'prov-1' });

    const result = await resolver(store, [prov, club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toMatchObject({ outcome: 'resolved', jurisdiction: { code: 'on' } });
  });

  it('lets a DIRECT assignment OVERRIDE an inherited one', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-prov', code: 'on' }));
    store.seedJurisdiction(jurisdiction({ id: 'j-club', code: 'on-metro', level: 'local' }));
    store.seedAssignment(
      assignment({
        id: 'a-prov',
        organizationId: 'prov-1',
        jurisdictionId: 'j-prov',
        inheritanceMode: 'inheritable',
      }),
    );
    store.seedAssignment(
      assignment({ id: 'a-club', organizationId: 'club-1', jurisdictionId: 'j-club' }),
    );
    const prov = org({ organizationId: 'prov-1' });
    const club = org({ organizationId: 'club-1', parentOrganizationId: 'prov-1' });

    const result = await resolver(store, [prov, club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toMatchObject({ outcome: 'resolved', jurisdiction: { code: 'on-metro' } });
  });

  it('does NOT inherit a DIRECT (non-inheritable) ancestor assignment', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-prov', code: 'on' }));
    store.seedAssignment(
      assignment({
        id: 'a-prov',
        organizationId: 'prov-1',
        jurisdictionId: 'j-prov',
        inheritanceMode: 'direct',
      }),
    );
    const prov = org({ organizationId: 'prov-1' });
    const club = org({ organizationId: 'club-1', parentOrganizationId: 'prov-1' });

    const result = await resolver(store, [prov, club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({ outcome: 'unresolved' });
  });

  it('does NOT resolve a FUTURE (not-yet-effective) assignment', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-1', code: 'on' }));
    store.seedAssignment(
      assignment({
        id: 'a-1',
        organizationId: 'club-1',
        jurisdictionId: 'j-1',
        validFrom: new Date(NOW_MS + 86_400_000).toISOString(),
      }),
    );
    const club = org({ organizationId: 'club-1' });

    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({ outcome: 'unresolved' });
  });

  it('does NOT resolve an EXPIRED assignment', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-1', code: 'on' }));
    store.seedAssignment(
      assignment({
        id: 'a-1',
        organizationId: 'club-1',
        jurisdictionId: 'j-1',
        validUntil: new Date(NOW_MS - 1).toISOString(),
      }),
    );
    const club = org({ organizationId: 'club-1' });

    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({ outcome: 'unresolved' });
  });

  it('does NOT resolve an assignment referencing a DRAFT jurisdiction', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-1', code: 'on', status: 'draft' }));
    store.seedAssignment(assignment({ id: 'a-1', organizationId: 'club-1', jurisdictionId: 'j-1' }));
    const club = org({ organizationId: 'club-1' });

    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({ outcome: 'unresolved' });
  });

  it('does NOT resolve an assignment referencing a RETIRED jurisdiction', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-1', code: 'on', status: 'retired' }));
    store.seedAssignment(assignment({ id: 'a-1', organizationId: 'club-1', jurisdictionId: 'j-1' }));
    const club = org({ organizationId: 'club-1' });

    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({ outcome: 'unresolved' });
  });

  it('fails CLOSED (ambiguous) when two effective assignments resolve at the same precedence', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-1', code: 'on' }));
    store.seedJurisdiction(jurisdiction({ id: 'j-2', code: 'qc' }));
    store.seedAssignment(assignment({ id: 'a-1', organizationId: 'club-1', jurisdictionId: 'j-1' }));
    store.seedAssignment(assignment({ id: 'a-2', organizationId: 'club-1', jurisdictionId: 'j-2' }));
    const club = org({ organizationId: 'club-1' });

    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({ outcome: 'ambiguous' });
  });

  it('fails CLOSED (invalid_hierarchy) on a cyclic parent chain', async () => {
    const store = new InMemoryJurisdictionStore();
    const a = org({ organizationId: 'org-a', parentOrganizationId: 'org-b' });
    const b = org({ organizationId: 'org-b', parentOrganizationId: 'org-a' });

    const result = await resolver(store, [a, b]).jurisdictionFor(TENANT_A, a, NOW, 'en');

    expect(result).toEqual({ outcome: 'invalid_hierarchy' });
  });

  it('fails CLOSED (invalid_hierarchy) when an ancestor is missing from the registry', async () => {
    const store = new InMemoryJurisdictionStore();
    const club = org({ organizationId: 'club-1', parentOrganizationId: 'ghost' });

    // The parent 'ghost' is not in the reader — a broken chain must not silently resolve to none.
    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({ outcome: 'invalid_hierarchy' });
  });

  it('is TENANT-ISOLATED: an assignment in another tenant does not resolve', async () => {
    const store = new InMemoryJurisdictionStore();
    store.seedJurisdiction(jurisdiction({ id: 'j-b', code: 'on', tenantId: TENANT_B }));
    store.seedAssignment(
      assignment({ id: 'a-b', organizationId: 'club-1', jurisdictionId: 'j-b', tenantId: TENANT_B }),
    );
    const club = org({ organizationId: 'club-1' });

    const result = await resolver(store, [club]).jurisdictionFor(TENANT_A, club, NOW, 'en');

    expect(result).toEqual({ outcome: 'unresolved' });
  });
});
