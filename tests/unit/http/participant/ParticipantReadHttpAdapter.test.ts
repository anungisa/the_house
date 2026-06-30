import { describe, it, expect } from 'vitest';

import {
  handleParticipantList,
  handleParticipantDetail,
  handleOrganizationParticipantList,
  type ParticipantReadHttpDeps,
} from '../../../../src/http/participant/ParticipantReadHttpAdapter.js';
import {
  InMemoryParticipantRegistryStore,
  ParticipantRegistryService,
  type OrganizationReader,
} from '../../../../src/domains/participant-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import { TelemetryCounters } from '../../../../src/observability/TelemetryEvents.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

/**
 * Unit tests for the Participant Registry READ HTTP adapter (participant list/detail + an
 * organization's participant relationships).
 *
 * Protocol-pure and fully hermetic: handlers are called directly with parsed request shapes,
 * identity is carried in the shared `x-house-*` trusted-header contract, and the backing store is
 * in-memory. NO database, NO Docker, NO real Azure or Entra are required. These endpoints are
 * READ-ONLY: they never mutate the registry, enqueue outbox messages, touch governed state, or
 * invoke the Governance Kernel.
 */

const DEMO = new DemoAuthContextResolver();
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CLOCK = fixedClock(1_700_000_000_000);

/** The CLOSED set of DTO keys the participant read surface may ever expose. */
const ALLOWED_PARTICIPANT_DTO_KEYS = new Set([
  'tenantId',
  'participantId',
  'displayName',
  'givenName',
  'familyName',
  'email',
  'status',
  'externalRefs',
  'createdAt',
  'updatedAt',
]);

/** The CLOSED set of DTO keys the organization-participant read surface may ever expose. */
const ALLOWED_LINK_DTO_KEYS = new Set([
  'tenantId',
  'relationshipId',
  'organizationId',
  'participantId',
  'relationshipType',
  'status',
  'startDate',
  'endDate',
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
  readonly deps: ParticipantReadHttpDeps;
  readonly store: InMemoryParticipantRegistryStore;
  readonly outbox: InMemoryOutboxStore;
  readonly telemetry: InMemoryTelemetry;
  readonly service: ParticipantRegistryService;
}

function build(idPrefix = 'p'): Harness {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK });
  const telemetry = new InMemoryTelemetry();
  const service = new ParticipantRegistryService(store, {
    telemetry: new InMemoryTelemetry(),
    clock: CLOCK,
    ids: seqIds(idPrefix),
    organizationReader: ANY_ORG_READER,
  });
  return { deps: { readStore: store, telemetry }, store, outbox, telemetry, service };
}

/** Reader headers: the `participant_reader` role grants `participant.read` in v1. */
function readerHeaders(
  tenantId = TENANT_A,
  userId = 'op-1',
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': userId,
    'x-house-actor-role-keys': 'participant_reader',
    ...extra,
  };
}

/** Member headers: an authenticated actor that lacks `participant.read` (fails closed → 403). */
function memberHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'member',
  };
}

async function seedParticipant(
  service: ParticipantRegistryService,
  tenantId: string,
  over: Partial<{
    participantId: string;
    displayName: string;
    givenName: string;
    familyName: string;
    email: string;
    status: 'draft' | 'active' | 'suspended' | 'archived';
  }> = {},
): Promise<string> {
  const view = await service.createParticipant({
    tenantId,
    displayName: over.displayName ?? 'Pat Reader',
    ...(over.participantId !== undefined ? { participantId: over.participantId } : {}),
    ...(over.givenName !== undefined ? { givenName: over.givenName } : {}),
    ...(over.familyName !== undefined ? { familyName: over.familyName } : {}),
    ...(over.email !== undefined ? { email: over.email } : {}),
    ...(over.status !== undefined ? { status: over.status } : {}),
  });
  return view.participantId;
}

async function seedLink(
  service: ParticipantRegistryService,
  tenantId: string,
  organizationId: string,
  participantId: string,
  over: Partial<{
    relationshipId: string;
    relationshipType: 'member' | 'staff' | 'volunteer' | 'official' | 'contact' | 'other';
    status: 'active' | 'suspended' | 'ended';
  }> = {},
): Promise<string> {
  const view = await service.linkParticipantToOrganization({
    tenantId,
    organizationId,
    participantId,
    relationshipType: over.relationshipType ?? 'member',
    ...(over.relationshipId !== undefined ? { relationshipId: over.relationshipId } : {}),
    ...(over.status !== undefined ? { status: over.status } : {}),
  });
  return view.relationshipId;
}

describe('participant registry read HTTP adapter', () => {
  // (1) Authorized participant list returns 200 with tenant-scoped items.
  it('(1) lists participants for an authorized tenant', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A, { participantId: 'a-1' });
    await seedParticipant(h.service, TENANT_A, { participantId: 'a-2', status: 'active' });

    const res = await handleParticipantList(h.deps, { headers: readerHeaders(), query: {} }, 'r1', DEMO);
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['participantId']).sort()).toEqual(['a-1', 'a-2']);
    expect((res.body['page'] as Record<string, unknown>)['limit']).toBe(50);
  });

  // (2) Authorized participant detail returns 200 with the participant.
  it('(2) reads a single participant for an authorized tenant', async () => {
    const h = build();
    const id = await seedParticipant(h.service, TENANT_A, { displayName: 'Head Contact' });
    const res = await handleParticipantDetail(
      h.deps,
      { participantId: id, headers: readerHeaders() },
      'r2',
      DEMO,
    );
    expect(res.status).toBe(200);
    const participant = res.body['participant'] as Record<string, unknown>;
    expect(participant['participantId']).toBe(id);
    expect(participant['displayName']).toBe('Head Contact');
  });

  // (3) Authorized organization-participant list returns 200 with tenant-scoped relationships.
  it('(3) lists organization participant relationships for an authorized tenant', async () => {
    const h = build();
    const pid = await seedParticipant(h.service, TENANT_A);
    const rid = await seedLink(h.service, TENANT_A, 'org-1', pid);

    const res = await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: readerHeaders(), query: {} },
      'r3',
      DEMO,
    );
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['relationshipId'])).toEqual([rid]);
    expect(items[0]!['organizationId']).toBe('org-1');
  });

  // (4) An authenticated actor lacking participant.read is denied the list (403, fail closed).
  it('(4) denies an unauthorized actor on list (403)', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A);
    const res = await handleParticipantList(h.deps, { headers: memberHeaders(), query: {} }, 'r4', DEMO);
    expect(res.status).toBe(403);
  });

  // (5) An authenticated actor lacking participant.read is denied the detail (403, fail closed).
  it('(5) denies an unauthorized actor on detail (403)', async () => {
    const h = build();
    const id = await seedParticipant(h.service, TENANT_A);
    const res = await handleParticipantDetail(
      h.deps,
      { participantId: id, headers: memberHeaders() },
      'r5',
      DEMO,
    );
    expect(res.status).toBe(403);
  });

  // (6) An authenticated actor lacking participant.read is denied the org-participant list (403).
  it('(6) denies an unauthorized actor on organization participant list (403)', async () => {
    const h = build();
    const pid = await seedParticipant(h.service, TENANT_A);
    await seedLink(h.service, TENANT_A, 'org-1', pid);
    const res = await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: memberHeaders(), query: {} },
      'r6',
      DEMO,
    );
    expect(res.status).toBe(403);
  });

  // (7) Tenant B cannot see Tenant A's participants in a list (tenant isolation).
  it('(7) does not list another tenant participants', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A, { participantId: 'a-1' });
    const res = await handleParticipantList(
      h.deps,
      { headers: readerHeaders(TENANT_B), query: {} },
      'r7',
      DEMO,
    );
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(0);
  });

  // (8) Reading another tenant's participant detail returns 404 (never reveals existence).
  it('(8) returns 404 for a cross-tenant participant detail read', async () => {
    const h = build();
    const aId = await seedParticipant(h.service, TENANT_A);
    const res = await handleParticipantDetail(
      h.deps,
      { participantId: aId, headers: readerHeaders(TENANT_B) },
      'r8',
      DEMO,
    );
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('PARTICIPANT_NOT_FOUND');
  });

  // (9) Tenant B does not see Tenant A's organization relationships.
  it('(9) does not list another tenant organization relationships', async () => {
    const h = build();
    const pid = await seedParticipant(h.service, TENANT_A);
    await seedLink(h.service, TENANT_A, 'org-1', pid);
    const res = await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: readerHeaders(TENANT_B), query: {} },
      'r9',
      DEMO,
    );
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(0);
  });

  // (10) A missing participant returns 404.
  it('(10) returns 404 for a missing participant', async () => {
    const h = build();
    const res = await handleParticipantDetail(
      h.deps,
      { participantId: 'does-not-exist', headers: readerHeaders() },
      'r10',
      DEMO,
    );
    expect(res.status).toBe(404);
    expect(res.body['code']).toBe('PARTICIPANT_NOT_FOUND');
  });

  // (11) A missing/unknown organization yields an EMPTY relationship list (documented contract:
  // the org-participants route does not probe organization existence; it never reveals
  // cross-tenant existence — it simply returns no relationships).
  it('(11) returns an empty list for an unknown organization (documented contract)', async () => {
    const h = build();
    const res = await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'no-such-org', headers: readerHeaders(), query: {} },
      'r11',
      DEMO,
    );
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(0);
  });

  // (12) The default page limit is 50 when none is supplied.
  it('(12) defaults the page limit to 50', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A);
    const res = await handleParticipantList(h.deps, { headers: readerHeaders(), query: {} }, 'r12', DEMO);
    expect((res.body['page'] as Record<string, unknown>)['limit']).toBe(50);
  });

  // (13) A non-numeric limit is rejected with 400.
  it('(13) rejects a non-numeric limit with 400', async () => {
    const h = build();
    const res = await handleParticipantList(
      h.deps,
      { headers: readerHeaders(), query: { limit: 'lots' } },
      'r13',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  // (14) A negative limit is rejected with 400.
  it('(14) rejects a negative limit with 400', async () => {
    const h = build();
    const res = await handleParticipantList(
      h.deps,
      { headers: readerHeaders(), query: { limit: '-3' } },
      'r14',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  // (15) A requested limit above the HTTP cap (100) is clamped down, not rejected.
  it('(15) clamps a limit above the HTTP max down to 100', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A);
    const res = await handleParticipantList(
      h.deps,
      { headers: readerHeaders(), query: { limit: '500' } },
      'r15',
      DEMO,
    );
    expect(res.status).toBe(200);
    expect((res.body['page'] as Record<string, unknown>)['limit']).toBe(100);
  });

  // (16) Participants can be filtered by status.
  it('(16) filters participants by status', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A, { participantId: 'a-1', status: 'active' });
    await seedParticipant(h.service, TENANT_A, { participantId: 'a-2', status: 'suspended' });

    const res = await handleParticipantList(
      h.deps,
      { headers: readerHeaders(), query: { status: 'suspended' } },
      'r16',
      DEMO,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['participantId'])).toEqual(['a-2']);
  });

  // (17) An invalid participant status filter is rejected with 400.
  it('(17) rejects an invalid status filter with 400', async () => {
    const h = build();
    const res = await handleParticipantList(
      h.deps,
      { headers: readerHeaders(), query: { status: 'nonsense' } },
      'r17',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  // (18) Relationships can be filtered by relationshipType.
  it('(18) filters organization relationships by relationshipType', async () => {
    const h = build();
    const p1 = await seedParticipant(h.service, TENANT_A, { participantId: 'a-1' });
    const p2 = await seedParticipant(h.service, TENANT_A, { participantId: 'a-2' });
    await seedLink(h.service, TENANT_A, 'org-1', p1, { relationshipType: 'staff' });
    const volunteerRid = await seedLink(h.service, TENANT_A, 'org-1', p2, {
      relationshipType: 'volunteer',
    });

    const res = await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: readerHeaders(), query: { relationshipType: 'volunteer' } },
      'r18',
      DEMO,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['relationshipId'])).toEqual([volunteerRid]);
  });

  // (19) Relationships can be filtered by relationship status.
  it('(19) filters organization relationships by status', async () => {
    const h = build();
    const p1 = await seedParticipant(h.service, TENANT_A, { participantId: 'a-1' });
    const p2 = await seedParticipant(h.service, TENANT_A, { participantId: 'a-2' });
    await seedLink(h.service, TENANT_A, 'org-1', p1, { relationshipType: 'staff', status: 'active' });
    const suspendedRid = await seedLink(h.service, TENANT_A, 'org-1', p2, {
      relationshipType: 'volunteer',
      status: 'suspended',
    });

    const res = await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: readerHeaders(), query: { status: 'suspended' } },
      'r19',
      DEMO,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => i['relationshipId'])).toEqual([suspendedRid]);
  });

  // (20) An invalid relationshipType filter is rejected with 400.
  it('(20) rejects an invalid relationshipType filter with 400', async () => {
    const h = build();
    const res = await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: readerHeaders(), query: { relationshipType: 'captain' } },
      'r20',
      DEMO,
    );
    expect(res.status).toBe(400);
  });

  // (21) The participant DTO exposes ONLY the closed, safe field set.
  it('(21) participant DTO exposes only the closed safe field set', async () => {
    const h = build();
    const id = await seedParticipant(h.service, TENANT_A, {
      givenName: 'Pat',
      familyName: 'Reader',
      email: 'pat@example.test',
    });
    const res = await handleParticipantDetail(
      h.deps,
      { participantId: id, headers: readerHeaders() },
      'r21',
      DEMO,
    );
    const participant = res.body['participant'] as Record<string, unknown>;
    for (const key of Object.keys(participant)) {
      expect(ALLOWED_PARTICIPANT_DTO_KEYS.has(key)).toBe(true);
    }
    expect(new Set(Object.keys(participant))).toEqual(ALLOWED_PARTICIPANT_DTO_KEYS);
  });

  // (22) The relationship DTO exposes ONLY the closed, safe field set.
  it('(22) relationship DTO exposes only the closed safe field set', async () => {
    const h = build();
    const pid = await seedParticipant(h.service, TENANT_A);
    await seedLink(h.service, TENANT_A, 'org-1', pid);
    const res = await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: readerHeaders(), query: {} },
      'r22',
      DEMO,
    );
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(new Set(Object.keys(items[0]!))).toEqual(ALLOWED_LINK_DTO_KEYS);
  });

  // (23) List + detail + org-list emit success telemetry tagged with the operation.
  it('(23) emits read telemetry for list, detail, and organization links', async () => {
    const h = build();
    const id = await seedParticipant(h.service, TENANT_A);
    await seedLink(h.service, TENANT_A, 'org-1', id);

    await handleParticipantList(h.deps, { headers: readerHeaders(), query: {} }, 'r23a', DEMO);
    await handleParticipantDetail(h.deps, { participantId: id, headers: readerHeaders() }, 'r23b', DEMO);
    await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: readerHeaders(), query: {} },
      'r23c',
      DEMO,
    );

    expect(h.telemetry.counterTotal(TelemetryCounters.participantRegistryRead)).toBe(3);
    const signals = h.telemetry.signalsNamed(TelemetryCounters.participantRegistryRead);
    const operations = signals.map((s) => s.attributes?.['operation']);
    expect(operations).toContain('list');
    expect(operations).toContain('detail');
    expect(operations).toContain('organization_links');
    const results = signals.map((s) => s.attributes?.['result']);
    expect(results.every((r) => r === 'success')).toBe(true);
  });

  // (24) A denied read emits no sensitive data (no tenant id, user id, or email).
  it('(24) denial telemetry carries no identifiers or secrets', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A, { email: 'secret@example.test' });
    await handleParticipantList(
      h.deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'op-secret',
          'x-house-actor-role-keys': 'member',
        },
        query: {},
      },
      'r24',
      DEMO,
    );
    const denied = h.telemetry.signalsNamed('authz.denied.count');
    expect(denied.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(h.telemetry.snapshot());
    expect(serialized).not.toContain(TENANT_A);
    expect(serialized).not.toContain('op-secret');
    expect(serialized).not.toContain('secret@example.test');
  });

  // (25) Reads never enqueue an outbox message and never mutate the registry.
  it('(25) reads produce no outbox messages and no mutations', async () => {
    const h = build();
    const id = await seedParticipant(h.service, TENANT_A);
    await seedLink(h.service, TENANT_A, 'org-1', id);
    const outboxBefore = h.outbox.records.length;
    const participantsBefore = h.store.listAllParticipants().length;
    const linksBefore = h.store.listAllLinks().length;

    await handleParticipantList(h.deps, { headers: readerHeaders(), query: {} }, 'r25a', DEMO);
    await handleParticipantDetail(h.deps, { participantId: id, headers: readerHeaders() }, 'r25b', DEMO);
    await handleOrganizationParticipantList(
      h.deps,
      { organizationId: 'org-1', headers: readerHeaders(), query: {} },
      'r25c',
      DEMO,
    );

    expect(h.outbox.records.length).toBe(outboxBefore);
    expect(h.store.listAllParticipants().length).toBe(participantsBefore);
    expect(h.store.listAllLinks().length).toBe(linksBefore);
  });

  // (26) A blank tenant identity fails closed with 401 (never falls through to a read).
  it('(26) fails closed with 401 when no tenant identity is present', async () => {
    const h = build();
    const res = await handleParticipantList(
      h.deps,
      { headers: { 'x-house-actor-user-id': 'op-1', 'x-house-actor-role-keys': 'participant_reader' }, query: {} },
      'r26',
      DEMO,
    );
    expect(res.status).toBe(401);
  });

  // (27) The platform_admin role is authorized for participant.read.
  it('(27) authorizes the platform_admin role', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A);
    const res = await handleParticipantList(
      h.deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-role-keys': 'platform_admin',
        },
        query: {},
      },
      'r27',
      DEMO,
    );
    expect(res.status).toBe(200);
  });

  // (28) An exact participant.read permission key is authorized.
  it('(28) authorizes an exact participant.read permission key', async () => {
    const h = build();
    await seedParticipant(h.service, TENANT_A);
    const res = await handleParticipantList(
      h.deps,
      {
        headers: {
          'x-house-tenant-id': TENANT_A,
          'x-house-actor-user-id': 'op-1',
          'x-house-actor-permission-keys': 'participant.read',
        },
        query: {},
      },
      'r28',
      DEMO,
    );
    expect(res.status).toBe(200);
  });
});
