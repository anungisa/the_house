import { describe, it, expect } from 'vitest';

import {
  handleOrganizationList,
  handleOrganizationDetail,
  type OrganizationReadHttpDeps,
} from '../../../../src/http/organization/OrganizationReadHttpAdapter.js';
import {
  InMemoryOrganizationRegistryStore,
  OrganizationRegistryService,
} from '../../../../src/domains/organization-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import { TelemetryCounters } from '../../../../src/observability/TelemetryEvents.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

/**
 * Unit tests for the Organization Registry READ HTTP adapter (list + detail).
 *
 * Protocol-pure and fully hermetic: handlers are called directly with parsed request shapes,
 * identity is carried in the shared `x-house-*` trusted-header contract, and the backing store
 * is in-memory. NO database, NO Docker, NO real Azure or Entra are required. These endpoints are
 * READ-ONLY: they never mutate the registry, enqueue outbox messages, touch governed state, or
 * invoke the Governance Kernel.
 */

const DEMO = new DemoAuthContextResolver();
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CLOCK = fixedClock(1_700_000_000_000);

/** The CLOSED set of DTO keys the read surface may ever expose. */
const ALLOWED_DTO_KEYS = new Set([
  'tenantId',
  'organizationId',
  'organizationType',
  'displayName',
  'legalName',
  'status',
  'parentOrganizationId',
  'source',
  'sourceEntityType',
  'sourceEntityId',
  'createdAt',
  'updatedAt',
]);

function seqIds(prefix: string): IdGenerator {
  let i = 0;
  return { newId: () => `${prefix}-${++i}` };
}

interface Harness {
  readonly deps: OrganizationReadHttpDeps;
  readonly store: InMemoryOrganizationRegistryStore;
  readonly outbox: InMemoryOutboxStore;
  readonly telemetry: InMemoryTelemetry;
  readonly service: OrganizationRegistryService;
}

function build(idPrefix = 'org'): Harness {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryOrganizationRegistryStore(outbox, { clock: CLOCK });
  const telemetry = new InMemoryTelemetry();
  const service = new OrganizationRegistryService(store, {
    telemetry: new InMemoryTelemetry(),
    clock: CLOCK,
    ids: seqIds(idPrefix),
  });
  return { deps: { readStore: store, telemetry }, store, outbox, telemetry, service };
}

/** Reader headers: the `organization_reader` role grants `organization.read` in v1. */
function readerHeaders(
  tenantId = TENANT_A,
  userId = 'op-1',
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': userId,
    'x-house-actor-role-keys': 'organization_reader',
    ...extra,
  };
}

async function seedOrg(
  service: OrganizationRegistryService,
  tenantId: string,
  over: Partial<{
    organizationId: string;
    organizationType: 'national' | 'regional' | 'local' | 'external' | 'applicant';
    displayName: string;
    legalName: string;
    status: 'draft' | 'active' | 'suspended' | 'archived';
    parentOrganizationId: string;
  }> = {},
): Promise<string> {
  const view = await service.createOrganization({
    tenantId,
    organizationType: over.organizationType ?? 'regional',
    displayName: over.displayName ?? 'Region Office',
    ...(over.legalName !== undefined ? { legalName: over.legalName } : {}),
    ...(over.status !== undefined ? { status: over.status } : {}),
    ...(over.organizationId !== undefined ? { organizationId: over.organizationId } : {}),
    ...(over.parentOrganizationId !== undefined
      ? { parentOrganizationId: over.parentOrganizationId }
      : {}),
  });
  return view.organizationId;
}

describe('organization registry read HTTP adapter', () => {
  // (1) Authorized list returns 200 with tenant-scoped items.
  it('(1) lists organizations for an authorized tenant', async () => {
    const h = build();
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-1' });
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-2', organizationType: 'local' });

    const res = await handleOrganizationList(h.deps, { headers: readerHeaders(), query: {} }, 'r1', DEMO);
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['organizationId']).sort()).toEqual(['a-1', 'a-2']);
    expect((res.body['page'] as Record<string, unknown>)['limit']).toBe(50);
  });

  // (2) Authorized detail returns 200 with the organization.
  it('(2) reads a single organization for an authorized tenant', async () => {
    const h = build();
    const id = await seedOrg(h.service, TENANT_A, { displayName: 'Head Office', legalName: 'Head Office Inc.' });

    const res = await handleOrganizationDetail(
      h.deps,
      { organizationId: id, headers: readerHeaders() },
      'r2',
      DEMO,
    );
    expect(res.status).toBe(200);
    const org = res.body['organization'] as Record<string, unknown>;
    expect(org['organizationId']).toBe(id);
    expect(org['displayName']).toBe('Head Office');
    expect(org['legalName']).toBe('Head Office Inc.');
  });

  // (3) Unauthenticated list (no tenant identity) is denied 401.
  it('(3) denies an unauthenticated list (401)', async () => {
    const h = build();
    const res = await handleOrganizationList(h.deps, { headers: {}, query: {} }, 'r3', DEMO);
    expect(res.status).toBe(401);
  });

  // (4) Unauthenticated detail (no tenant identity) is denied 401.
  it('(4) denies an unauthenticated detail (401)', async () => {
    const h = build();
    const res = await handleOrganizationDetail(
      h.deps,
      { organizationId: 'whatever', headers: {} },
      'r4',
      DEMO,
    );
    expect(res.status).toBe(401);
  });

  // (5) Authenticated but unauthorized actor is denied 403 (fail closed) on list.
  it('(5) denies an authenticated actor lacking organization.read (403)', async () => {
    const h = build();
    const res = await handleOrganizationList(
      h.deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-role-keys': 'member',
        },
        query: {},
      },
      'r5',
      DEMO,
    );
    expect(res.status).toBe(403);
  });

  // (6) Authenticated but unauthorized actor is denied 403 on detail.
  it('(6) denies an unauthorized detail (403)', async () => {
    const h = build();
    const id = await seedOrg(h.service, TENANT_A);
    const res = await handleOrganizationDetail(
      h.deps,
      {
        organizationId: id,
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-role-keys': 'member',
        },
      },
      'r6',
      DEMO,
    );
    expect(res.status).toBe(403);
  });

  // (6b) The exact organization.read permission alone grants access.
  it('(6b) allows an actor holding the organization.read permission', async () => {
    const h = build();
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-1' });
    const res = await handleOrganizationList(
      h.deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-permission-keys': 'organization.read',
        },
        query: {},
      },
      'r6b',
      DEMO,
    );
    expect(res.status).toBe(200);
  });

  // (7) Tenant B cannot see Tenant A's organizations in a list.
  it('(7) isolates the list by tenant', async () => {
    const h = build();
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-1' });
    await seedOrg(h.service, TENANT_B, { organizationId: 'b-1' });

    const res = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(TENANT_B), query: {} },
      'r7',
      DEMO,
    );
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['organizationId'])).toEqual(['b-1']);
  });

  // (8) Tenant B reading Tenant A's organization detail gets 404 (never reveals existence).
  it('(8) returns 404 for a cross-tenant detail read', async () => {
    const h = build();
    const id = await seedOrg(h.service, TENANT_A, { organizationId: 'a-secret' });

    const res = await handleOrganizationDetail(
      h.deps,
      { organizationId: id, headers: readerHeaders(TENANT_B) },
      'r8',
      DEMO,
    );
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('ORGANIZATION_NOT_FOUND');
  });

  // (9) A missing organization returns 404.
  it('(9) returns 404 for a missing organization', async () => {
    const h = build();
    const res = await handleOrganizationDetail(
      h.deps,
      { organizationId: 'does-not-exist', headers: readerHeaders() },
      'r9',
      DEMO,
    );
    expect(res.status).toBe(404);
  });

  // (10) The default page limit (50) is applied when no limit is provided.
  it('(10) applies the default page limit', async () => {
    const h = build();
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-1' });
    const res = await handleOrganizationList(h.deps, { headers: readerHeaders(), query: {} }, 'r10', DEMO);
    expect((res.body['page'] as Record<string, unknown>)['limit']).toBe(50);
  });

  // (11) An invalid limit returns 400.
  it('(11) rejects an invalid limit (400)', async () => {
    const h = build();
    for (const limit of ['0', '-3', 'abc', '1.5']) {
      const res = await handleOrganizationList(
        h.deps,
        { headers: readerHeaders(), query: { limit } },
        'r11',
        DEMO,
      );
      expect(res.status).toBe(400);
    }
  });

  // (12) Filters by organizationType.
  it('(12) filters the list by organizationType', async () => {
    const h = build();
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-nat', organizationType: 'national' });
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-loc', organizationType: 'local' });

    const res = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(), query: { organizationType: 'national' } },
      'r12',
      DEMO,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['organizationId'])).toEqual(['a-nat']);
  });

  // (13) Filters by status.
  it('(13) filters the list by status', async () => {
    const h = build();
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-draft' });
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-active', status: 'active' });

    const res = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(), query: { status: 'active' } },
      'r13',
      DEMO,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['organizationId'])).toEqual(['a-active']);
  });

  // (14) Filters by parentOrganizationId.
  it('(14) filters the list by parentOrganizationId', async () => {
    const h = build();
    const parent = await seedOrg(h.service, TENANT_A, {
      organizationId: 'a-parent',
      organizationType: 'national',
    });
    await seedOrg(h.service, TENANT_A, {
      organizationId: 'a-child',
      organizationType: 'regional',
      parentOrganizationId: parent,
    });
    await seedOrg(h.service, TENANT_A, { organizationId: 'a-orphan', organizationType: 'regional' });

    const res = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(), query: { parentOrganizationId: parent } },
      'r14',
      DEMO,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['organizationId'])).toEqual(['a-child']);
  });

  // (15) An invalid filter enum returns 400.
  it('(15) rejects an invalid filter enum (400)', async () => {
    const h = build();
    const byType = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(), query: { organizationType: 'club' } },
      'r15a',
      DEMO,
    );
    expect(byType.status).toBe(400);
    const byStatus = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(), query: { status: 'pending' } },
      'r15b',
      DEMO,
    );
    expect(byStatus.status).toBe(400);
  });

  // (16) The DTO exposes only the closed, safe field set.
  it('(16) exposes only the documented safe DTO fields', async () => {
    const h = build();
    const id = await seedOrg(h.service, TENANT_A, { legalName: 'Legal Co.' });
    const res = await handleOrganizationDetail(
      h.deps,
      { organizationId: id, headers: readerHeaders() },
      'r16',
      DEMO,
    );
    const org = res.body['organization'] as Record<string, unknown>;
    for (const key of Object.keys(org)) {
      expect(ALLOWED_DTO_KEYS.has(key)).toBe(true);
    }
    expect(new Set(Object.keys(org))).toEqual(ALLOWED_DTO_KEYS);
  });

  // (17) Keyset pagination returns an opaque cursor that continues the list.
  it('(17) paginates with an opaque continuation cursor', async () => {
    const h = build();
    for (let i = 0; i < 3; i++) {
      await seedOrg(h.service, TENANT_A, { organizationId: `a-${i}` });
    }
    const first = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(), query: { limit: '2' } },
      'r17a',
      DEMO,
    );
    const firstItems = first.body['items'] as Array<Record<string, unknown>>;
    expect(firstItems).toHaveLength(2);
    const cursor = (first.body['page'] as Record<string, unknown>)['nextCursor'] as string;
    expect(typeof cursor).toBe('string');

    const second = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(), query: { limit: '2', cursor } },
      'r17b',
      DEMO,
    );
    const secondItems = second.body['items'] as Array<Record<string, unknown>>;
    expect(secondItems).toHaveLength(1);
    expect((second.body['page'] as Record<string, unknown>)['nextCursor']).toBeNull();
  });

  // (18) A malformed cursor returns 400.
  it('(18) rejects a malformed cursor (400)', async () => {
    const h = build();
    const res = await handleOrganizationList(
      h.deps,
      { headers: readerHeaders(), query: { cursor: 'not-a-cursor!!' } },
      'r18',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  // (19) List + detail emit success telemetry (operation list/detail).
  it('(19) emits read telemetry for list and detail', async () => {
    const h = build();
    const id = await seedOrg(h.service, TENANT_A);
    await handleOrganizationList(h.deps, { headers: readerHeaders(), query: {} }, 'r19a', DEMO);
    await handleOrganizationDetail(h.deps, { organizationId: id, headers: readerHeaders() }, 'r19b', DEMO);

    expect(h.telemetry.counterTotal(TelemetryCounters.organizationRegistryRead)).toBe(2);
    const signals = h.telemetry.signalsNamed(TelemetryCounters.organizationRegistryRead);
    const operations = signals.map((s) => s.attributes?.['operation']);
    expect(operations).toContain('list');
    expect(operations).toContain('detail');
    const results = signals.map((s) => s.attributes?.['result']);
    expect(results.every((r) => r === 'success')).toBe(true);
  });

  // (20) A denied read emits no sensitive data (only the action + reason on authz.denied).
  it('(20) denial telemetry carries no identifiers or secrets', async () => {
    const h = build();
    await handleOrganizationList(
      h.deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-role-keys': 'member',
        },
        query: {},
      },
      'r20',
      DEMO,
    );
    const denied = h.telemetry.signalsNamed('authz.denied.count');
    expect(denied.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(h.telemetry.snapshot());
    expect(serialized).not.toContain(TENANT_A);
    expect(serialized).not.toContain('op-1');
  });

  // (21) Reads never enqueue an outbox message and never mutate the registry.
  it('(21) reads produce no outbox messages and no mutations', async () => {
    const h = build();
    const id = await seedOrg(h.service, TENANT_A);
    const outboxBefore = h.outbox.records.length;
    const rowsBefore = h.store.listAll().length;

    await handleOrganizationList(h.deps, { headers: readerHeaders(), query: {} }, 'r21a', DEMO);
    await handleOrganizationDetail(h.deps, { organizationId: id, headers: readerHeaders() }, 'r21b', DEMO);

    expect(h.outbox.records.length).toBe(outboxBefore);
    expect(h.store.listAll().length).toBe(rowsBefore);
  });

  // (22) No sport-specific vocabulary leaks into serialized response bodies.
  it('(22) response bodies stay NSO-generic (no sport terminology)', async () => {
    const h = build();
    const id = await seedOrg(h.service, TENANT_A);
    const list = await handleOrganizationList(h.deps, { headers: readerHeaders(), query: {} }, 'r22a', DEMO);
    const detail = await handleOrganizationDetail(
      h.deps,
      { organizationId: id, headers: readerHeaders() },
      'r22b',
      DEMO,
    );
    const sportTerms = /curl|curler|bonspiel|rink|sheet|\bclub\b|skip|hockey|soccer|ptso/i;
    expect(sportTerms.test(JSON.stringify(list.body))).toBe(false);
    expect(sportTerms.test(JSON.stringify(detail.body))).toBe(false);
  });
});
