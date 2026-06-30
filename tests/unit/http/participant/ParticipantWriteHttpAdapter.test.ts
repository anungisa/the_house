import { describe, it, expect } from 'vitest';

import {
  handleParticipantCreate,
  handleParticipantUpdate,
  participantWriteErrorToHttpResult,
  type ParticipantWriteHttpDeps,
} from '../../../../src/http/participant/ParticipantWriteHttpAdapter.js';
import {
  InMemoryParticipantRegistryStore,
  ParticipantRegistryService,
} from '../../../../src/domains/participant-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import { TelemetryCounters } from '../../../../src/observability/TelemetryEvents.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

/**
 * Unit tests for the Participant Registry WRITE HTTP adapter — PHASE 1 (create + update only).
 *
 * Protocol-pure and fully hermetic: handlers are called directly with parsed request shapes,
 * identity is carried in the shared `x-house-*` trusted-header contract, and the backing store is
 * in-memory. NO database, NO Docker, NO real Azure or Entra are required. These endpoints mutate
 * the registry ONLY through the validated Participant Registry service — they never touch governed
 * lifecycle state, never invoke the Governance Kernel, and never enqueue outbox messages directly.
 * Status transitions and organization-link writes are NOT part of phase 1.
 */

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CLOCK = fixedClock(1_700_000_000_000);

/** The CLOSED set of keys a participant write response may ever expose. */
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

interface Harness {
  readonly deps: ParticipantWriteHttpDeps;
  readonly store: InMemoryParticipantRegistryStore;
  readonly outbox: InMemoryOutboxStore;
  readonly telemetry: InMemoryTelemetry;
  readonly service: ParticipantRegistryService;
}

function build(): Harness {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK });
  const telemetry = new InMemoryTelemetry();
  const service = new ParticipantRegistryService(store, {
    telemetry: new InMemoryTelemetry(),
    clock: CLOCK,
  });
  return { deps: { service, readStore: store, telemetry }, store, outbox, telemetry, service };
}

/** Admin headers: the `participant_admin` role grants `participant.write` (and read) in v1. */
function adminHeaders(
  tenantId = TENANT_A,
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'admin-1',
    'x-house-actor-role-keys': 'participant_admin',
    'idempotency-key': 'idem-001',
    ...extra,
  };
}

/** Reader headers: `participant_reader` grants read but NOT write (fails closed → 403 on write). */
function readerHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'participant_reader',
    'idempotency-key': 'idem-001',
  };
}

describe('participant write HTTP adapter — create', () => {
  it('(1) creates a participant and returns 201 with the closed DTO', async () => {
    const h = build();
    const res = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { participantId: 'p-1', displayName: 'Pat Player', email: 'Pat@Example.test' },
    });
    expect(res.status).toBe(201);
    const body = res.body as { status: string; participant: Record<string, unknown> };
    expect(body.status).toBe('ok');
    expect(body.participant['participantId']).toBe('p-1');
    expect(body.participant['status']).toBe('draft');
    // Email is normalized by the service (lowercased) and read back for the authorized operator.
    expect(body.participant['email']).toBe('pat@example.test');
    for (const key of Object.keys(body.participant)) {
      expect(ALLOWED_PARTICIPANT_DTO_KEYS.has(key)).toBe(true);
    }
  });

  it('(2) accepts an explicit active initial status', async () => {
    const h = build();
    const res = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { participantId: 'p-2', displayName: 'Active One', status: 'active' },
    });
    expect(res.status).toBe(201);
    expect((res.body as { participant: { status: string } }).participant.status).toBe('active');
  });

  it('(3) rejects a non-create initial status (e.g. suspended) with 400', async () => {
    const h = build();
    const res = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { participantId: 'p-3', displayName: 'Nope', status: 'suspended' },
    });
    expect(res.status).toBe(400);
  });

  it('(4) requires the Idempotency-Key header (400 when absent)', async () => {
    const h = build();
    const headers = adminHeaders();
    delete headers['idempotency-key'];
    const res = await handleParticipantCreate(h.deps, {
      headers,
      body: { participantId: 'p-4', displayName: 'No Key' },
    });
    expect(res.status).toBe(400);
  });

  it('(5) requires a participantId (400 when absent/blank)', async () => {
    const h = build();
    const res = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { displayName: 'No Id' },
    });
    expect(res.status).toBe(400);
  });

  it('(6) rejects unknown body keys (e.g. an organization-link field) with 400', async () => {
    const h = build();
    const res = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { participantId: 'p-6', displayName: 'X', organizationId: 'org-1' },
    });
    expect(res.status).toBe(400);
  });

  it('(7) rejects a non-object body with 400', async () => {
    const h = build();
    const res = await handleParticipantCreate(h.deps, { headers: adminHeaders(), body: undefined });
    expect(res.status).toBe(400);
  });

  it('(8) denies a reader (no participant.write) with 403', async () => {
    const h = build();
    const res = await handleParticipantCreate(h.deps, {
      headers: readerHeaders(),
      body: { participantId: 'p-8', displayName: 'X' },
    });
    expect(res.status).toBe(403);
  });

  it('(9) requires a tenant identity (401 when absent)', async () => {
    const h = build();
    const headers = adminHeaders();
    delete headers['x-house-tenant-id'];
    const res = await handleParticipantCreate(h.deps, {
      headers,
      body: { participantId: 'p-9', displayName: 'X' },
    });
    expect(res.status).toBe(401);
  });

  it('(10) returns 409 for a duplicate participantId in the same tenant', async () => {
    const h = build();
    const first = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { participantId: 'dup-1', displayName: 'First' },
    });
    expect(first.status).toBe(201);
    const second = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(undefined, { 'idempotency-key': 'idem-002' }),
      body: { participantId: 'dup-1', displayName: 'Second' },
    });
    expect(second.status).toBe(409);
  });

  it('(11) emits a write telemetry counter tagged create/success without sensitive data', async () => {
    const h = build();
    await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: {
        participantId: 'p-11',
        displayName: 'Sensitive Name',
        email: 'secret@example.test',
      },
    });
    const signals = h.telemetry.signalsNamed(TelemetryCounters.participantRegistryWrite);
    expect(signals.length).toBe(1);
    expect(signals[0]?.attributes?.['operation']).toBe('create');
    expect(signals[0]?.attributes?.['result']).toBe('success');
    const serialized = JSON.stringify(h.telemetry.snapshot());
    expect(serialized).not.toContain('secret@example.test');
    expect(serialized).not.toContain('Sensitive Name');
  });
});

describe('participant write HTTP adapter — update', () => {
  async function seed(h: Harness, participantId = 'p-seed'): Promise<void> {
    const res = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: {
        participantId,
        displayName: 'Original',
        givenName: 'Gn',
        familyName: 'Fn',
        email: 'orig@example.test',
      },
    });
    expect(res.status).toBe(201);
  }

  it('(12) updates safe profile fields and returns 200', async () => {
    const h = build();
    await seed(h);
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers: adminHeaders(),
      body: { displayName: 'Renamed', email: 'New@Example.test' },
    });
    expect(res.status).toBe(200);
    const participant = (res.body as { participant: Record<string, unknown> }).participant;
    expect(participant['displayName']).toBe('Renamed');
    expect(participant['email']).toBe('new@example.test');
  });

  it('(13) clears an optional field with null', async () => {
    const h = build();
    await seed(h);
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers: adminHeaders(),
      body: { givenName: null },
    });
    expect(res.status).toBe(200);
    expect((res.body as { participant: { givenName: unknown } }).participant.givenName).toBeNull();
  });

  it('(14) returns 404 for a missing participant', async () => {
    const h = build();
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'nope',
      headers: adminHeaders(),
      body: { displayName: 'X' },
    });
    expect(res.status).toBe(404);
  });

  it('(15) returns 404 for a cross-tenant participant (never reveals existence)', async () => {
    const h = build();
    await seed(h); // created in TENANT_A
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers: adminHeaders(TENANT_B),
      body: { displayName: 'X' },
    });
    expect(res.status).toBe(404);
  });

  it('(16) denies a reader (no participant.write) with 403', async () => {
    const h = build();
    await seed(h);
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers: readerHeaders(),
      body: { displayName: 'X' },
    });
    expect(res.status).toBe(403);
  });

  it('(17) requires a tenant identity (401 when absent)', async () => {
    const h = build();
    await seed(h);
    const headers = adminHeaders();
    delete headers['x-house-tenant-id'];
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers,
      body: { displayName: 'X' },
    });
    expect(res.status).toBe(401);
  });

  it('(18) rejects an empty update body with 400', async () => {
    const h = build();
    await seed(h);
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers: adminHeaders(),
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it('(19) rejects a status field on update (status transitions are not phase 1) with 400', async () => {
    const h = build();
    await seed(h);
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers: adminHeaders(),
      body: { status: 'active' },
    });
    expect(res.status).toBe(400);
  });

  it('(20) rejects an organization-link field on update with 400', async () => {
    const h = build();
    await seed(h);
    const res = await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers: adminHeaders(),
      body: { organizationId: 'org-1' },
    });
    expect(res.status).toBe(400);
  });

  it('(21) emits a write telemetry counter tagged update/success', async () => {
    const h = build();
    await seed(h);
    await handleParticipantUpdate(h.deps, {
      participantId: 'p-seed',
      headers: adminHeaders(),
      body: { displayName: 'Renamed' },
    });
    const signals = h.telemetry.signalsNamed(TelemetryCounters.participantRegistryWrite);
    const updateSignals = signals.filter((s) => s.attributes?.['operation'] === 'update');
    expect(updateSignals.length).toBe(1);
    expect(updateSignals[0]?.attributes?.['result']).toBe('success');
  });
});

describe('participantWriteErrorToHttpResult', () => {
  it('(22) collapses an unknown error into an opaque 500', () => {
    const res = participantWriteErrorToHttpResult(new Error('boom'), 'req-1');
    expect(res.status).toBe(500);
    const body = res.body as { code: string; message: string };
    expect(body.code).toBe('INTERNAL');
    expect(body.message).not.toContain('boom');
  });
});
