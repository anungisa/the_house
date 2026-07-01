import { describe, it, expect } from 'vitest';

import {
  handleFacilityCreate,
  handleFacilityUpdate,
  facilityWriteErrorToHttpResult,
  type FacilityWriteHttpDeps,
} from '../../../../src/http/facility/FacilityWriteHttpAdapter.js';
import {
  FacilityRegistryService,
  InMemoryFacilityRegistryStore,
  FACILITY_REGISTRY_CREATED_MESSAGE_TYPE,
  FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE,
  type OrganizationReader,
} from '../../../../src/domains/facility-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import { TelemetryCounters } from '../../../../src/observability/TelemetryEvents.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import { AppError, ErrorCode } from '../../../../src/shared/errors/AppError.js';

/**
 * Unit tests for the Facility Registry WRITE HTTP adapter — phase 1: create + update.
 *
 * Protocol-pure and fully hermetic: handlers are called directly with parsed request shapes,
 * identity is carried in the shared `x-house-*` trusted-header contract, and the backing store is
 * in-memory. NO database, NO Docker, NO real Azure or Entra are required. These endpoints mutate
 * the registry ONLY through the validated Facility Registry service — they never touch governed
 * lifecycle state, never invoke the Governance Kernel, and never enqueue outbox messages directly
 * (the service/store owns the transactional outbox). A facility STATUS transition is a separate
 * future pass and is NOT part of this surface, and the write path never mutates the read-only
 * Organization Registry.
 */

const DEMO = new DemoAuthContextResolver();
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CLOCK = fixedClock(1_700_000_000_000);

/** The CLOSED set of DTO keys the facility write response may ever expose (NO tenantId). */
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

/** A permissive organization reader: any non-blank id is an existing same-tenant org. */
const ANY_ORG_READER: OrganizationReader = {
  getById: (_tenantId, organizationId) =>
    Promise.resolve(organizationId.trim() === '' ? undefined : { organizationId }),
};

/** A reader where no organization ever resolves (drives FACILITY_ORGANIZATION_NOT_FOUND → 404). */
const NO_ORG_READER: OrganizationReader = {
  getById: () => Promise.resolve(undefined),
};

interface Harness {
  readonly deps: FacilityWriteHttpDeps;
  readonly store: InMemoryFacilityRegistryStore;
  readonly outbox: InMemoryOutboxStore;
  readonly telemetry: InMemoryTelemetry;
  readonly service: FacilityRegistryService;
}

function build(orgReader: OrganizationReader = ANY_ORG_READER): Harness {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryFacilityRegistryStore(outbox, { clock: CLOCK });
  const telemetry = new InMemoryTelemetry();
  const service = new FacilityRegistryService(store, {
    clock: CLOCK,
    organizationReader: orgReader,
  });
  return { deps: { service, readStore: store, telemetry }, store, outbox, telemetry, service };
}

/** Admin headers: the `facility_admin` role grants `facility.write` (and read) in v1. */
function adminHeaders(
  tenantId = TENANT_A,
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'admin-1',
    'x-house-actor-role-keys': 'facility_admin',
    'idempotency-key': 'idem-001',
    ...extra,
  };
}

/** Reader headers: `facility_reader` grants read but NOT write (fails closed → 403 on write). */
function readerHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'facility_reader',
    'idempotency-key': 'idem-001',
  };
}

/** Direct-permission headers: the `facility.write` permission key grants the action outright. */
function permissionHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'member',
    'x-house-actor-permission-keys': 'facility.write',
    'idempotency-key': 'idem-001',
  };
}

/** platform_admin headers: the wildcard super-role grants every known action. */
function platformAdminHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'platform_admin',
    'idempotency-key': 'idem-001',
  };
}

/** Member headers: an authenticated actor that lacks `facility.write` (fails closed → 403). */
function memberHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'member',
    'idempotency-key': 'idem-001',
  };
}

/** A full, valid create body. */
function createBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    facilityId: 'fac-1',
    organizationId: 'org-a',
    name: 'Central Venue',
    facilityType: 'venue',
    ...over,
  };
}

async function seed(
  h: Harness,
  over: Record<string, unknown> = {},
  headers = adminHeaders(),
): Promise<void> {
  const res = await handleFacilityCreate(
    h.deps,
    { headers, body: createBody(over) },
    'seed-req',
    DEMO,
  );
  expect(res.status).toBe(201);
}

describe('Facility write HTTP adapter — create', () => {
  it('(1) creates a facility for a facility_admin (201) with a sanitized DTO', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: adminHeaders(), body: createBody() },
      'req-1',
      DEMO,
    );
    expect(res.status).toBe(201);
    const body = res.body as { status: string; facility: Record<string, unknown>; requestId: string };
    expect(body.status).toBe('ok');
    expect(body.facility['facilityId']).toBe('fac-1');
    for (const key of Object.keys(body.facility)) {
      expect(ALLOWED_FACILITY_DTO_KEYS.has(key)).toBe(true);
    }
    expect('tenantId' in body.facility).toBe(false);
  });

  it('(2) creates a facility for a direct facility.write permission (201)', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: permissionHeaders(), body: createBody() },
      'r',
      DEMO,
    );
    expect(res.status).toBe(201);
  });

  it('(3) creates a facility for platform_admin (201)', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: platformAdminHeaders(), body: createBody() },
      'r',
      DEMO,
    );
    expect(res.status).toBe(201);
  });

  it('(4) denies a facility_reader with 403 (read does not imply write)', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: readerHeaders(), body: createBody() },
      'r',
      DEMO,
    );
    expect(res.status).toBe(403);
  });

  it('(5) denies an authenticated member without facility.write with 403', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: memberHeaders(), body: createBody() },
      'r',
      DEMO,
    );
    expect(res.status).toBe(403);
  });

  it('(6) returns 401 when no tenant identity is present', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: { 'x-house-actor-role-keys': 'facility_admin', 'idempotency-key': 'i' }, body: createBody() },
      'r',
      DEMO,
    );
    expect(res.status).toBe(401);
  });

  it('(7) returns 400 when the Idempotency-Key header is missing', async () => {
    const h = build();
    const headers = adminHeaders();
    delete headers['idempotency-key'];
    const res = await handleFacilityCreate(h.deps, { headers, body: createBody() }, 'r', DEMO);
    expect(res.status).toBe(400);
  });

  it('(8) returns 400 when facilityId is missing', async () => {
    const h = build();
    const body = createBody();
    delete body['facilityId'];
    const res = await handleFacilityCreate(h.deps, { headers: adminHeaders(), body }, 'r', DEMO);
    expect(res.status).toBe(400);
  });

  it('(9) returns 400 when organizationId is missing', async () => {
    const h = build();
    const body = createBody();
    delete body['organizationId'];
    const res = await handleFacilityCreate(h.deps, { headers: adminHeaders(), body }, 'r', DEMO);
    expect(res.status).toBe(400);
  });

  it('(10) returns 400 when name is missing', async () => {
    const h = build();
    const body = createBody();
    delete body['name'];
    const res = await handleFacilityCreate(h.deps, { headers: adminHeaders(), body }, 'r', DEMO);
    expect(res.status).toBe(400);
  });

  it('(11) returns 400 for an unknown facilityType enum', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: adminHeaders(), body: createBody({ facilityType: 'stadium' }) },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(12) returns 400 for an unknown status enum', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: adminHeaders(), body: createBody({ status: 'pending' }) },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(13) returns 400 for an unknown body field (closed allow-list)', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: adminHeaders(), body: createBody({ tenantId: TENANT_B }) },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(14) returns 400 when the body is not a JSON object', async () => {
    const h = build();
    const res = await handleFacilityCreate(
      h.deps,
      { headers: adminHeaders(), body: [] as unknown },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(15) returns 409 on a duplicate facilityId for the tenant', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityCreate(
      h.deps,
      { headers: adminHeaders(TENANT_A, { 'idempotency-key': 'idem-002' }), body: createBody() },
      'r',
      DEMO,
    );
    expect(res.status).toBe(409);
  });

  it('(16) returns 404 when the same-tenant organization does not exist', async () => {
    const h = build(NO_ORG_READER);
    const res = await handleFacilityCreate(
      h.deps,
      { headers: adminHeaders(), body: createBody() },
      'r',
      DEMO,
    );
    expect(res.status).toBe(404);
  });

  it('(17) enqueues exactly one created outbox row (service owns the outbox) with no PII leak', async () => {
    const h = build();
    await seed(h, { contactEmail: 'ops@example.test', contactName: 'Facility Manager' });
    const createdRows = h.outbox.records.filter(
      (r) => r.messageType === FACILITY_REGISTRY_CREATED_MESSAGE_TYPE,
    );
    expect(createdRows.length).toBe(1);
    const serialized = JSON.stringify(createdRows[0]?.payload);
    expect(serialized).not.toContain('ops@example.test');
    expect(serialized).not.toContain('Facility Manager');
  });

  it('(18) emits a write telemetry counter tagged create/success', async () => {
    const h = build();
    await seed(h);
    const signals = h.telemetry
      .signalsNamed(TelemetryCounters.facilityRegistryWrite)
      .filter((s) => s.attributes?.['operation'] === 'create');
    expect(signals.length).toBe(1);
    expect(signals[0]?.attributes?.['result']).toBe('success');
  });

  it('(19) a cross-tenant duplicate id is allowed (isolation) — separate rows per tenant', async () => {
    const h = build();
    await seed(h); // TENANT_A / fac-1
    const res = await handleFacilityCreate(
      h.deps,
      { headers: adminHeaders(TENANT_B), body: createBody() },
      'r',
      DEMO,
    );
    expect(res.status).toBe(201);
  });
});

describe('Facility write HTTP adapter — update', () => {
  it('(1) updates a facility name for a facility_admin (200)', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: { name: 'Renamed Venue' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(200);
    const body = res.body as { facility: Record<string, unknown> };
    expect(body.facility['name']).toBe('Renamed Venue');
  });

  it('(2) updates via a direct facility.write permission (200)', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: permissionHeaders(), body: { locality: 'Ottawa' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(200);
  });

  it('(3) clears an optional field with null', async () => {
    const h = build();
    await seed(h, { contactEmail: 'ops@example.test' });
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: { contactEmail: null } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(200);
    const body = res.body as { facility: Record<string, unknown> };
    expect(body.facility['contactEmail'] ?? null).toBeNull();
  });

  it('(4) denies a facility_reader with 403', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: readerHeaders(), body: { name: 'X' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(403);
  });

  it('(5) denies an authenticated member without facility.write with 403', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: memberHeaders(), body: { name: 'X' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(403);
  });

  it('(6) returns 401 when no tenant identity is present', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      {
        facilityId: 'fac-1',
        headers: { 'x-house-actor-role-keys': 'facility_admin' },
        body: { name: 'X' },
      },
      'r',
      DEMO,
    );
    expect(res.status).toBe(401);
  });

  it('(7) returns 404 for a missing facility', async () => {
    const h = build();
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'missing', headers: adminHeaders(), body: { name: 'X' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(404);
  });

  it('(8) returns 404 for a cross-tenant facility (never reveals existence)', async () => {
    const h = build();
    await seed(h); // TENANT_A
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(TENANT_B), body: { name: 'X' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(404);
  });

  it('(9) returns 400 for an empty update body', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: {} },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(10) rejects an attempt to change status via update (unknown key → 400)', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: { status: 'inactive' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(11) rejects an attempt to change facilityType via update (unknown key → 400)', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: { facilityType: 'office' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(12) rejects an attempt to move organizationId via update (unknown key → 400)', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: { organizationId: 'org-b' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(13) returns 400 for an unknown body field (closed allow-list)', async () => {
    const h = build();
    await seed(h);
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: { tenantId: TENANT_B } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(14) returns 400 when the path facilityId is blank', async () => {
    const h = build();
    const res = await handleFacilityUpdate(
      h.deps,
      { facilityId: '   ', headers: adminHeaders(), body: { name: 'X' } },
      'r',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  it('(15) enqueues exactly one updated outbox row (service owns the outbox)', async () => {
    const h = build();
    await seed(h);
    await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: { name: 'Renamed' } },
      'r',
      DEMO,
    );
    const updatedRows = h.outbox.records.filter(
      (r) => r.messageType === FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE,
    );
    expect(updatedRows.length).toBe(1);
  });

  it('(16) emits a write telemetry counter tagged update/success', async () => {
    const h = build();
    await seed(h);
    await handleFacilityUpdate(
      h.deps,
      { facilityId: 'fac-1', headers: adminHeaders(), body: { name: 'Renamed' } },
      'r',
      DEMO,
    );
    const signals = h.telemetry
      .signalsNamed(TelemetryCounters.facilityRegistryWrite)
      .filter((s) => s.attributes?.['operation'] === 'update');
    expect(signals.length).toBe(1);
    expect(signals[0]?.attributes?.['result']).toBe('success');
  });
});

describe('facilityWriteErrorToHttpResult', () => {
  it('maps an AppError to its HTTP status', () => {
    const res = facilityWriteErrorToHttpResult(
      new AppError(ErrorCode.FACILITY_ALREADY_EXISTS, 'dup'),
      'req-x',
    );
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe(ErrorCode.FACILITY_ALREADY_EXISTS);
  });

  it('collapses an unknown error to an opaque 500', () => {
    const res = facilityWriteErrorToHttpResult(new Error('boom'), 'req-x');
    expect(res.status).toBe(500);
    expect((res.body as { message: string }).message).toBe('Internal server error.');
  });
});
