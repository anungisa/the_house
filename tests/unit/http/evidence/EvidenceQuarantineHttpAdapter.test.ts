import { describe, expect, it } from 'vitest';

import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryEvidenceQuarantineStore } from '../../../../src/governance/evidence/quarantine/InMemoryEvidenceQuarantineStore.js';
import { EvidenceQuarantineService } from '../../../../src/governance/evidence/quarantine/EvidenceQuarantineService.js';
import {
  EVIDENCE_QUARANTINE_RELEASED_MESSAGE_TYPE,
  EVIDENCE_QUARANTINE_REVIEWED_MESSAGE_TYPE,
} from '../../../../src/governance/evidence/quarantine/EvidenceQuarantineTypes.js';
import {
  handleQuarantineDetail,
  handleQuarantineDisposition,
  handleQuarantineList,
  type EvidenceQuarantineHttpDeps,
} from '../../../../src/http/evidence/EvidenceQuarantineHttpAdapter.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

/**
 * Unit tests for the evidence quarantine REVIEW/DISPOSITION HTTP adapter. Fully hermetic: an
 * in-memory outbox + in-memory quarantine store + the real service, with identity supplied via
 * the trusted-header contract resolved by the adapter's default demo resolver. No DB, Azure,
 * AV, or Entra.
 *
 * These tests assert the operational-security boundary: the adapter lists/reads quarantine
 * events and records dispositions; it never stores bytes, creates governed evidence, or mutates
 * governed lifecycle state (the deps graph contains NO governance store or kernel at all).
 */

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222';

function fixedIds(prefix: string): IdGenerator {
  let i = 0;
  return { newId: () => `${prefix}-${++i}` };
}

interface Harness {
  deps: EvidenceQuarantineHttpDeps;
  outbox: InMemoryOutboxStore;
  service: EvidenceQuarantineService;
  store: InMemoryEvidenceQuarantineStore;
}

function buildHarness(): Harness {
  const outbox = new InMemoryOutboxStore();
  const store = new InMemoryEvidenceQuarantineStore(outbox);
  const service = new EvidenceQuarantineService(store, {
    generateId: fixedIds('q'),
    maxRetries: 5,
  });
  return { deps: { reviewer: service }, outbox, service, store };
}

/** Build trusted-header identity. Omit a field to simulate its absence. */
function headers(opts: {
  tenant?: string;
  user?: string;
  perms?: readonly string[];
  roles?: readonly string[];
}): Record<string, string | undefined> {
  return {
    ...(opts.tenant !== undefined ? { 'x-house-tenant-id': opts.tenant } : {}),
    ...(opts.user !== undefined ? { 'x-house-actor-user-id': opts.user } : {}),
    ...(opts.perms !== undefined ? { 'x-house-actor-permission-keys': opts.perms.join(',') } : {}),
    ...(opts.roles !== undefined ? { 'x-house-actor-role-keys': opts.roles.join(',') } : {}),
  };
}

const READER = headers({
  tenant: TENANT,
  user: 'sec-op-1',
  perms: ['evidence.quarantine.read'],
});
const DISPOSER = headers({
  tenant: TENANT,
  user: 'sec-op-1',
  perms: ['evidence.quarantine.read', 'evidence.quarantine.disposition'],
});

/** Seed a blocked-upload quarantine event (status `recorded`) and return its id. */
async function seed(
  service: EvidenceQuarantineService,
  overrides: { tenant?: string; filename?: string; uploader?: string } = {},
): Promise<string> {
  const result = await service.recordBlockedUpload({
    tenantId: overrides.tenant ?? TENANT,
    sourceFilename: overrides.filename ?? 'evil.pdf',
    contentType: 'application/pdf',
    sizeBytes: 4242,
    contentHash: 'deadbeef',
    scanStatus: 'infected',
    scanner: 'signature',
    threatName: 'EICAR-Test-File',
    reason: 'matched test signature',
    uploadActorUserId: overrides.uploader ?? 'member-42',
    requestId: 'req-seed',
  });
  return result.quarantineEventId;
}

describe('EvidenceQuarantineHttpAdapter — list', () => {
  it('requires an authenticated tenant (401 when no tenant identity)', async () => {
    const { deps } = buildHarness();
    const res = await handleQuarantineList(deps, {
      headers: headers({ user: 'sec-op-1', perms: ['evidence.quarantine.read'] }),
      query: {},
    });
    expect(res.status).toBe(401);
    expect(res.body['status']).toBe('error');
  });

  it('requires the read permission or a security role (403 when neither)', async () => {
    const { deps, service } = buildHarness();
    await seed(service);
    const res = await handleQuarantineList(deps, {
      headers: headers({ tenant: TENANT, user: 'nobody' }),
      query: {},
    });
    expect(res.status).toBe(403);
  });

  it('grants read via a security role even without an explicit permission', async () => {
    const { deps, service } = buildHarness();
    await seed(service);
    const res = await handleQuarantineList(deps, {
      headers: headers({ tenant: TENANT, user: 'sec-op-1', roles: ['security_reviewer'] }),
      query: {},
    });
    expect(res.status).toBe(200);
    expect((res.body['items'] as unknown[]).length).toBe(1);
  });

  it('returns quarantine events for the tenant only (tenant isolation)', async () => {
    const { deps, service } = buildHarness();
    await seed(service);
    await seed(service);
    await seed(service, { tenant: OTHER_TENANT });

    const res = await handleQuarantineList(deps, { headers: READER, query: {} });
    expect(res.status).toBe(200);
    const items = res.body['items'] as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    for (const item of items) expect(item['quarantineStatus']).toBe('recorded');
  });

  it('filters by quarantine status', async () => {
    const { deps, service } = buildHarness();
    const id = await seed(service);
    await seed(service);
    await service.recordQuarantineDisposition({
      tenantId: TENANT,
      quarantineEventId: id,
      disposition: 'reviewed',
      actorUserId: 'sec-op-1',
    });

    const reviewed = await handleQuarantineList(deps, {
      headers: READER,
      query: { status: 'reviewed' },
    });
    expect(reviewed.status).toBe(200);
    expect((reviewed.body['items'] as unknown[]).length).toBe(1);

    const recorded = await handleQuarantineList(deps, {
      headers: READER,
      query: { status: 'recorded' },
    });
    expect((recorded.body['items'] as unknown[]).length).toBe(1);
  });

  it('rejects an invalid status filter (400)', async () => {
    const { deps } = buildHarness();
    const res = await handleQuarantineList(deps, {
      headers: READER,
      query: { status: 'bogus' },
    });
    expect(res.status).toBe(400);
  });

  it('paginates with an opaque cursor', async () => {
    const { deps, service } = buildHarness();
    await seed(service);
    await seed(service);
    await seed(service);

    const first = await handleQuarantineList(deps, { headers: READER, query: { limit: '2' } });
    expect((first.body['items'] as unknown[]).length).toBe(2);
    const cursor = first.body['nextCursor'];
    expect(typeof cursor).toBe('string');

    const second = await handleQuarantineList(deps, {
      headers: READER,
      query: { limit: '2', cursor: cursor as string },
    });
    expect((second.body['items'] as unknown[]).length).toBe(1);
    expect(second.body['nextCursor']).toBeNull();
  });
});

describe('EvidenceQuarantineHttpAdapter — detail', () => {
  it('returns a single event for the tenant', async () => {
    const { deps, service } = buildHarness();
    const id = await seed(service);
    const res = await handleQuarantineDetail(deps, { quarantineEventId: id, headers: READER });
    expect(res.status).toBe(200);
    expect((res.body['event'] as Record<string, unknown>)['quarantineEventId']).toBe(id);
  });

  it('404s an unknown id', async () => {
    const { deps } = buildHarness();
    const res = await handleQuarantineDetail(deps, {
      quarantineEventId: 'does-not-exist',
      headers: READER,
    });
    expect(res.status).toBe(404);
  });

  it("404s another tenant's event (no cross-tenant read)", async () => {
    const { deps, service } = buildHarness();
    const id = await seed(service, { tenant: OTHER_TENANT });
    const res = await handleQuarantineDetail(deps, { quarantineEventId: id, headers: READER });
    expect(res.status).toBe(404);
  });

  it('requires read access (403)', async () => {
    const { deps, service } = buildHarness();
    const id = await seed(service);
    const res = await handleQuarantineDetail(deps, {
      quarantineEventId: id,
      headers: headers({ tenant: TENANT, user: 'nobody' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('EvidenceQuarantineHttpAdapter — disposition', () => {
  it('requires an authenticated tenant (401)', async () => {
    const { deps, service } = buildHarness();
    const id = await seed(service);
    const res = await handleQuarantineDisposition(deps, {
      quarantineEventId: id,
      headers: headers({ user: 'sec-op-1', perms: ['evidence.quarantine.disposition'] }),
      body: { disposition: 'reviewed' },
    });
    expect(res.status).toBe(401);
  });

  it('requires the disposition permission or a security role (403)', async () => {
    const { deps, service } = buildHarness();
    const id = await seed(service);
    // Read permission alone is not enough to disposition.
    const res = await handleQuarantineDisposition(deps, {
      quarantineEventId: id,
      headers: READER,
      body: { disposition: 'reviewed' },
    });
    expect(res.status).toBe(403);
  });

  it.each(['reviewed', 'released', 'discarded'] as const)(
    'records a %s disposition and advances the status',
    async (disposition) => {
      const { deps, service, store } = buildHarness();
      const id = await seed(service);
      const res = await handleQuarantineDisposition(deps, {
        quarantineEventId: id,
        headers: DISPOSER,
        body: { disposition, reason: 'investigated' },
      });
      expect(res.status).toBe(200);
      expect(res.body['previousStatus']).toBe('recorded');
      expect(res.body['newStatus']).toBe(disposition);

      const view = await store.getById(TENANT, id);
      expect(view?.quarantineStatus).toBe(disposition);
      expect(view?.reviewedByUserId).toBe('sec-op-1');
    },
  );

  it('rejects an unknown disposition value (400)', async () => {
    const { deps, service } = buildHarness();
    const id = await seed(service);
    const res = await handleQuarantineDisposition(deps, {
      quarantineEventId: id,
      headers: DISPOSER,
      body: { disposition: 'deleted-forever' },
    });
    expect(res.status).toBe(400);
  });

  it('404s a disposition against an unknown event', async () => {
    const { deps } = buildHarness();
    const res = await handleQuarantineDisposition(deps, {
      quarantineEventId: 'nope',
      headers: DISPOSER,
      body: { disposition: 'reviewed' },
    });
    expect(res.status).toBe(404);
  });

  it('409s when re-dispositioning a terminal (released) event', async () => {
    const { deps, service } = buildHarness();
    const id = await seed(service);
    const first = await handleQuarantineDisposition(deps, {
      quarantineEventId: id,
      headers: DISPOSER,
      body: { disposition: 'released' },
    });
    expect(first.status).toBe(200);

    const second = await handleQuarantineDisposition(deps, {
      quarantineEventId: id,
      headers: DISPOSER,
      body: { disposition: 'discarded' },
    });
    expect(second.status).toBe(409);
  });

  it('emits the correct sanitized disposition outbox event (no bytes, no uploader identity)', async () => {
    const { deps, service, outbox } = buildHarness();
    const id = await seed(service, { filename: 'evil.pdf', uploader: 'member-42' });
    const recordedCount = outbox.records.length;

    const res = await handleQuarantineDisposition(deps, {
      quarantineEventId: id,
      headers: DISPOSER,
      body: { disposition: 'reviewed' },
    });
    expect(res.status).toBe(200);

    // Exactly one new outbox message for the disposition.
    expect(outbox.records.length).toBe(recordedCount + 1);
    const message = outbox.records[outbox.records.length - 1]!;
    expect(message.messageType).toBe(EVIDENCE_QUARANTINE_REVIEWED_MESSAGE_TYPE);

    const payload = message.payload as Record<string, unknown>;
    expect(payload['quarantineEventId']).toBe(id);
    expect(payload['previousStatus']).toBe('recorded');
    expect(payload['newStatus']).toBe('reviewed');
    // The acting operator — NOT the uploader.
    expect(payload['actorUserId']).toBe('sec-op-1');

    // Defence-in-depth: the disposition payload never carries uploader identity, the source
    // filename, or any raw bytes.
    expect(payload).not.toHaveProperty('uploadActorUserId');
    expect(payload).not.toHaveProperty('uploaderId');
    expect(payload).not.toHaveProperty('sourceFilename');
    expect(payload).not.toHaveProperty('bytes');
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('evil.pdf');
    expect(serialized).not.toContain('member-42');
  });

  it('emits the released message type for a release disposition', async () => {
    const { deps, service, outbox } = buildHarness();
    const id = await seed(service);
    await handleQuarantineDisposition(deps, {
      quarantineEventId: id,
      headers: DISPOSER,
      body: { disposition: 'released' },
    });
    const message = outbox.records[outbox.records.length - 1]!;
    expect(message.messageType).toBe(EVIDENCE_QUARANTINE_RELEASED_MESSAGE_TYPE);
  });

  it('disposition is operational-security only: the deps graph holds no governance store', () => {
    // Structural guarantee: the adapter depends solely on the reviewer port. There is no kernel,
    // governance store, evidence store, or entity_state writer anywhere in this wiring, so a
    // disposition cannot mutate governed lifecycle state, create evidence_object rows, or write
    // audit_event/state_transition rows.
    const { deps } = buildHarness();
    expect(Object.keys(deps)).toEqual(['reviewer']);
  });
});
