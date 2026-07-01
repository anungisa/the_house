import { describe, it, expect } from 'vitest';

import {
  handleFacilityList,
  handleFacilityDetail,
  handleOrganizationFacilityList,
  toFacilityDto,
  type FacilityReadHttpDeps,
} from '../../../../src/http/facility/FacilityReadHttpAdapter.js';
import {
  FacilityRegistryService,
  InMemoryFacilityRegistryStore,
  type OrganizationReader,
} from '../../../../src/domains/facility-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import { TelemetryCounters } from '../../../../src/observability/TelemetryEvents.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

/**
 * Unit tests for the Facility Registry READ HTTP adapter (facility list/detail + an organization's
 * facilities).
 *
 * Protocol-pure and fully hermetic: handlers are called directly with parsed request shapes,
 * identity is carried in the shared `x-house-*` trusted-header contract, and the backing store is
 * in-memory. NO database, NO Docker, NO real Azure or Entra are required. These endpoints are
 * READ-ONLY: they never mutate the registry, enqueue outbox messages, touch governed state, invoke
 * the Governance Kernel, or mutate the Organization Registry.
 */

const DEMO = new DemoAuthContextResolver();
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ORG_A = 'org-a';
const ORG_OTHER = 'org-other';
const CLOCK = fixedClock(1_700_000_000_000);

/** The CLOSED set of DTO keys the facility read surface may ever expose (NO tenantId). */
const ALLOWED_FACILITY_DTO_KEYS = new Set([
  'facilityId',
  'organizationId',
  'name',
  'facilityType',
  'status',
  'addressLine1',
  'addressLine2',
  'locality',
  'region',
  'postalCode',
  'countryCode',
  'latitude',
  'longitude',
  'contactName',
  'contactEmail',
  'contactPhone',
  'visibility',
  'capabilityTags',
  'createdAt',
  'updatedAt',
]);

function seqIds(prefix: string): IdGenerator {
  let i = 0;
  return { newId: () => `${prefix}-${++i}` };
}

/** A permissive organization reader: any non-blank id is treated as an existing same-tenant org. */
const ANY_ORG_READER: OrganizationReader = {
  getById: (_tenantId, organizationId) =>
    Promise.resolve(organizationId.trim() === '' ? undefined : { organizationId }),
};

interface Harness {
  readonly deps: FacilityReadHttpDeps;
  readonly store: InMemoryFacilityRegistryStore;
  readonly outbox: InMemoryOutboxStore;
  readonly telemetry: InMemoryTelemetry;
  readonly service: FacilityRegistryService;
}

function build(idPrefix = 'f'): Harness {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryFacilityRegistryStore(outbox, { clock: CLOCK });
  const telemetry = new InMemoryTelemetry();
  const service = new FacilityRegistryService(store, {
    clock: CLOCK,
    ids: seqIds(idPrefix),
    organizationReader: ANY_ORG_READER,
  });
  return { deps: { readStore: store, telemetry }, store, outbox, telemetry, service };
}

/** Reader headers: the `facility_reader` role grants `facility.read` in v1. */
function readerHeaders(
  tenantId = TENANT_A,
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'facility_reader',
    ...extra,
  };
}

/** Admin headers: the `facility_admin` role also grants `facility.read` in v1. */
function adminHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'facility_admin',
  };
}

/** Direct-permission headers: the `facility.read` permission key grants the action outright. */
function permissionHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'member',
    'x-house-actor-permission-keys': 'facility.read',
  };
}

/** platform_admin headers: the wildcard super-role grants every known action. */
function platformAdminHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'platform_admin',
  };
}

/** Member headers: an authenticated actor that lacks `facility.read` (fails closed → 403). */
function memberHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'member',
  };
}

async function seedFacility(
  service: FacilityRegistryService,
  tenantId: string,
  over: Partial<{
    facilityId: string;
    organizationId: string;
    name: string;
    facilityType: 'venue' | 'training_site' | 'office' | 'storage_site' | 'partner_site' | 'other';
    status: 'draft' | 'active' | 'inactive' | 'archived';
    contactEmail: string;
    latitude: number;
    longitude: number;
    capabilityTags: readonly string[];
  }> = {},
): Promise<string> {
  const view = await service.createFacility({
    tenantId,
    organizationId: over.organizationId ?? ORG_A,
    name: over.name ?? 'Central Venue',
    facilityType: over.facilityType ?? 'venue',
    ...(over.facilityId !== undefined ? { facilityId: over.facilityId } : {}),
    ...(over.status !== undefined ? { status: over.status } : {}),
    ...(over.contactEmail !== undefined ? { contactEmail: over.contactEmail } : {}),
    ...(over.latitude !== undefined ? { latitude: over.latitude } : {}),
    ...(over.longitude !== undefined ? { longitude: over.longitude } : {}),
    ...(over.capabilityTags !== undefined ? { capabilityTags: over.capabilityTags } : {}),
  });
  return view.facilityId;
}

describe('Facility read HTTP adapter — list', () => {
  it('lists facilities for a facility_reader', async () => {
    const h = build();
    const id = await seedFacility(h.service, TENANT_A);
    const res = await handleFacilityList(
      h.deps,
      { headers: readerHeaders(), query: {} },
      'req-1',
      DEMO,
    );
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ facilityId: string }>; page: { limit: number } };
    expect(body.items.map((i) => i.facilityId)).toEqual([id]);
    expect(body.page.limit).toBe(50);
  });

  it('lists facilities for a facility_admin', async () => {
    const h = build();
    await seedFacility(h.service, TENANT_A);
    const res = await handleFacilityList(h.deps, { headers: adminHeaders(), query: {} }, 'r', DEMO);
    expect(res.status).toBe(200);
  });

  it('lists facilities for a direct facility.read permission', async () => {
    const h = build();
    await seedFacility(h.service, TENANT_A);
    const res = await handleFacilityList(
      h.deps,
      { headers: permissionHeaders(), query: {} },
      'r',
      DEMO,
    );
    expect(res.status).toBe(200);
  });

  it('lists facilities for platform_admin', async () => {
    const h = build();
    await seedFacility(h.service, TENANT_A);
    const res = await handleFacilityList(
      h.deps,
      { headers: platformAdminHeaders(), query: {} },
      'r',
      DEMO,
    );
    expect(res.status).toBe(200);
  });

  it('returns 401 when no tenant identity is present', async () => {
    const h = build();
    const res = await handleFacilityList(
      h.deps,
      { headers: { 'x-house-actor-role-keys': 'facility_reader' }, query: {} },
      'r',
      DEMO,
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when the actor lacks facility.read', async () => {
    const h = build();
    const res = await handleFacilityList(h.deps, { headers: memberHeaders(), query: {} }, 'r', DEMO);
    expect(res.status).toBe(403);
  });

  it('rejects an invalid status filter with 400', async () => {
    const h = build();
    const res = await handleFacilityList(
      h.deps,
      { headers: readerHeaders(), query: { status: 'bogus' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('rejects an invalid facilityType filter with 400', async () => {
    const h = build();
    const res = await handleFacilityList(
      h.deps,
      { headers: readerHeaders(), query: { facilityType: 'rink' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a non-integer limit with 400', async () => {
    const h = build();
    const res = await handleFacilityList(
      h.deps,
      { headers: readerHeaders(), query: { limit: 'abc' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a malformed cursor with 400', async () => {
    const h = build();
    const res = await handleFacilityList(
      h.deps,
      { headers: readerHeaders(), query: { cursor: '!!!not-base64!!!' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('filters by status', async () => {
    const h = build();
    await seedFacility(h.service, TENANT_A, { facilityId: 'a', status: 'active' });
    await seedFacility(h.service, TENANT_A, { facilityId: 'd', status: 'draft' });
    const res = await handleFacilityList(
      h.deps,
      { headers: readerHeaders(), query: { status: 'active' } },
      'r',
      DEMO,
    );
    const body = res.body as { items: Array<{ facilityId: string }> };
    expect(body.items.map((i) => i.facilityId)).toEqual(['a']);
  });

  it('does not enqueue any outbox message on a read', async () => {
    const h = build();
    await seedFacility(h.service, TENANT_A);
    const before = h.outbox.records.length;
    await handleFacilityList(h.deps, { headers: readerHeaders(), query: {} }, 'r', DEMO);
    await handleFacilityDetail(
      h.deps,
      { headers: readerHeaders(), facilityId: 'nope' },
      'r',
      DEMO,
    );
    expect(h.outbox.records.length).toBe(before);
  });
});

describe('Facility read HTTP adapter — detail', () => {
  it('returns a single facility', async () => {
    const h = build();
    const id = await seedFacility(h.service, TENANT_A);
    const res = await handleFacilityDetail(
      h.deps,
      { headers: readerHeaders(), facilityId: id },
      'r',
      DEMO,
    );
    expect(res.status).toBe(200);
    const body = res.body as { facility: { facilityId: string } };
    expect(body.facility.facilityId).toBe(id);
  });

  it('returns 400 for a blank facilityId', async () => {
    const h = build();
    const res = await handleFacilityDetail(
      h.deps,
      { headers: readerHeaders(), facilityId: '   ' },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for a missing facility', async () => {
    const h = build();
    const res = await handleFacilityDetail(
      h.deps,
      { headers: readerHeaders(), facilityId: 'missing' },
      'r',
      DEMO,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for a cross-tenant facility (never reveals existence)', async () => {
    const h = build();
    const id = await seedFacility(h.service, TENANT_B);
    const res = await handleFacilityDetail(
      h.deps,
      { headers: readerHeaders(TENANT_A), facilityId: id },
      'r',
      DEMO,
    );
    expect(res.status).toBe(404);
  });
});

describe('Facility read HTTP adapter — organization facilities', () => {
  it("lists an organization's facilities", async () => {
    const h = build();
    const id = await seedFacility(h.service, TENANT_A, { organizationId: ORG_A });
    await seedFacility(h.service, TENANT_A, { organizationId: ORG_OTHER });
    const res = await handleOrganizationFacilityList(
      h.deps,
      { headers: readerHeaders(), organizationId: ORG_A, query: {} },
      'r',
      DEMO,
    );
    expect(res.status).toBe(200);
    const body = res.body as { items: Array<{ facilityId: string; organizationId: string }> };
    expect(body.items.map((i) => i.facilityId)).toEqual([id]);
  });

  it('returns an empty list for an unknown organization (no cross-tenant probe)', async () => {
    const h = build();
    await seedFacility(h.service, TENANT_A, { organizationId: ORG_A });
    const res = await handleOrganizationFacilityList(
      h.deps,
      { headers: readerHeaders(), organizationId: 'org-does-not-exist', query: {} },
      'r',
      DEMO,
    );
    expect(res.status).toBe(200);
    const body = res.body as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('binds the organizationId from the path (path wins over the query)', async () => {
    const h = build();
    const id = await seedFacility(h.service, TENANT_A, { organizationId: ORG_A });
    await seedFacility(h.service, TENANT_A, { organizationId: ORG_OTHER });
    const res = await handleOrganizationFacilityList(
      h.deps,
      { headers: readerHeaders(), organizationId: ORG_A, query: { organizationId: ORG_OTHER } },
      'r',
      DEMO,
    );
    const body = res.body as { items: Array<{ facilityId: string }> };
    expect(body.items.map((i) => i.facilityId)).toEqual([id]);
  });

  it('returns 400 for a blank organizationId', async () => {
    const h = build();
    const res = await handleOrganizationFacilityList(
      h.deps,
      { headers: readerHeaders(), organizationId: '  ', query: {} },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });
});

describe('Facility read HTTP adapter — DTO + telemetry', () => {
  it('maps facilityId (not id) and normalizes optional fields to null/[]', () => {
    const dto = toFacilityDto({
      tenantId: TENANT_A,
      facilityId: 'fac-1',
      organizationId: ORG_A,
      name: 'Central Venue',
      facilityType: 'venue',
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });
    expect(dto.facilityId).toBe('fac-1');
    expect(dto.addressLine1).toBeNull();
    expect(dto.latitude).toBeNull();
    expect(dto.longitude).toBeNull();
    expect(dto.visibility).toBeNull();
    expect(dto.capabilityTags).toEqual([]);
  });

  it('exposes exactly the closed DTO key set (no tenantId, no leaked fields)', async () => {
    const h = build();
    await seedFacility(h.service, TENANT_A, {
      facilityId: 'fac-1',
      contactEmail: 'ops@example.org',
      latitude: 45.5,
      longitude: -73.6,
      capabilityTags: ['accessible', 'parking'],
    });
    const res = await handleFacilityDetail(
      h.deps,
      { headers: readerHeaders(), facilityId: 'fac-1' },
      'r',
      DEMO,
    );
    const body = res.body as { facility: Record<string, unknown> };
    expect(new Set(Object.keys(body.facility))).toEqual(ALLOWED_FACILITY_DTO_KEYS);
    expect(Object.keys(body.facility)).not.toContain('tenantId');
  });

  it('emits a read counter that carries only operation/result (no descriptive attributes)', async () => {
    const h = build();
    await seedFacility(h.service, TENANT_A, {
      facilityId: 'fac-1',
      name: 'Secret Name',
      contactEmail: 'ops@example.org',
      latitude: 45.5,
      longitude: -73.6,
      capabilityTags: ['accessible'],
    });
    h.telemetry.clear();
    await handleFacilityList(h.deps, { headers: readerHeaders(), query: {} }, 'r', DEMO);
    const counters = h.telemetry.signalsNamed(TelemetryCounters.facilityRegistryRead);
    expect(counters.length).toBe(1);
    const attrs = counters[0]!.attributes ?? {};
    expect(attrs['operation']).toBe('list');
    expect(attrs['result']).toBe('success');
    const serialized = JSON.stringify(h.telemetry.snapshot());
    expect(serialized).not.toContain('Secret Name');
    expect(serialized).not.toContain('ops@example.org');
    expect(serialized).not.toContain('accessible');
    expect(serialized).not.toContain('45.5');
  });
});
