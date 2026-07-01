import { describe, it, expect } from 'vitest';

import {
  handleParticipantCreate,
  handleParticipantUpdate,
  handleParticipantStatusTransition,
  handleOrganizationParticipantLink,
  handleOrganizationParticipantStatusTransition,
  participantWriteErrorToHttpResult,
  type ParticipantWriteHttpDeps,
} from '../../../../src/http/participant/ParticipantWriteHttpAdapter.js';
import {
  InMemoryParticipantRegistryStore,
  ParticipantRegistryService,
  PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
} from '../../../../src/domains/participant-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import { TelemetryCounters } from '../../../../src/observability/TelemetryEvents.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import { AppError, ErrorCode } from '../../../../src/shared/errors/AppError.js';

/**
 * Unit tests for the Participant Registry WRITE HTTP adapter — create, update, and the
 * reference-data status transition (`POST /v1/participants/:participantId/status-transitions`).
 *
 * Protocol-pure and fully hermetic: handlers are called directly with parsed request shapes,
 * identity is carried in the shared `x-house-*` trusted-header contract, and the backing store is
 * in-memory. NO database, NO Docker, NO real Azure or Entra are required. These endpoints mutate
 * the registry ONLY through the validated Participant Registry service — they never touch governed
 * lifecycle state, never invoke the Governance Kernel, and never enqueue outbox messages directly.
 * The status transition changes a denormalized reference-data status (it is NOT a governed FSM);
 * organization-link writes are NOT part of this surface.
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
  readonly organizations: StubOrganizationReader;
}

/**
 * A read-only, tenant-scoped organization-existence reader for the hermetic harness. Mirrors the
 * narrow {@link OrganizationReader} port the service depends on: it never creates or mutates an
 * organization (the Organization Registry is read-only reference), and a cross-tenant organization
 * simply does not resolve.
 */
class StubOrganizationReader {
  private readonly orgs = new Set<string>();
  seed(tenantId: string, organizationId: string): void {
    this.orgs.add(`${tenantId}:${organizationId}`);
  }
  async getById(
    tenantId: string,
    organizationId: string,
  ): Promise<{ readonly organizationId: string } | undefined> {
    return this.orgs.has(`${tenantId}:${organizationId}`) ? { organizationId } : undefined;
  }
}

function build(): Harness {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK });
  const organizations = new StubOrganizationReader();
  const telemetry = new InMemoryTelemetry();
  const service = new ParticipantRegistryService(store, {
    telemetry: new InMemoryTelemetry(),
    clock: CLOCK,
    organizationReader: organizations,
  });
  return {
    deps: { service, readStore: store, telemetry },
    store,
    outbox,
    telemetry,
    service,
    organizations,
  };
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

describe('participant write HTTP adapter — status transition', () => {
  /** Seed an active participant (so suspend/archive/reinstate transitions have a target). */
  async function seedActive(h: Harness, participantId = 'p-st'): Promise<void> {
    const res = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: {
        participantId,
        displayName: 'Seed Person',
        givenName: 'Given',
        familyName: 'Family',
        email: 'seed@example.test',
        status: 'active',
      },
    });
    expect(res.status).toBe(201);
  }

  /** Headers carrying ONLY the `participant.write` permission (NOT `participant.status.write`). */
  function profileWriteOnlyHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
    return {
      'x-house-tenant-id': tenantId,
      'x-house-actor-user-id': 'op-2',
      'x-house-actor-permission-keys': 'participant.write',
      'idempotency-key': 'idem-001',
    };
  }

  it('(23) transitions a draft participant to active and returns 200 with the closed DTO', async () => {
    const h = build();
    const created = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { participantId: 'p-d', displayName: 'Draft Person' },
    });
    expect(created.status).toBe(201);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-d',
      headers: adminHeaders(),
      body: { targetStatus: 'active' },
    });
    expect(res.status).toBe(200);
    const body = res.body as { status: string; participant: Record<string, unknown> };
    expect(body.status).toBe('ok');
    expect(body.participant['status']).toBe('active');
    for (const key of Object.keys(body.participant)) {
      expect(ALLOWED_PARTICIPANT_DTO_KEYS.has(key)).toBe(true);
    }
  });

  it('(24) transitions active → suspended', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(200);
    expect((res.body as { participant: { status: string } }).participant.status).toBe('suspended');
  });

  it('(25) transitions suspended → active (reinstate)', async () => {
    const h = build();
    await seedActive(h);
    await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'active' },
    });
    expect(res.status).toBe(200);
    expect((res.body as { participant: { status: string } }).participant.status).toBe('active');
  });

  it('(26) transitions active → archived', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'archived' },
    });
    expect(res.status).toBe(200);
    expect((res.body as { participant: { status: string } }).participant.status).toBe('archived');
  });

  it('(27) denies a read-only actor (participant.read only) with 403', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: readerHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(403);
  });

  it('(28) denies an actor with participant.write but NOT participant.status.write with 403', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: profileWriteOnlyHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(403);
  });

  it('(29) requires the Idempotency-Key header (400 when absent)', async () => {
    const h = build();
    await seedActive(h);
    const headers = adminHeaders();
    delete headers['idempotency-key'];
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers,
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(400);
  });

  it('(30) rejects a missing targetStatus with 400', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it('(31) rejects an unknown targetStatus value with 400', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'banished' },
    });
    expect(res.status).toBe(400);
  });

  it('(32) rejects a misplaced profile field (displayName) with 400', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', displayName: 'Nope' },
    });
    expect(res.status).toBe(400);
  });

  it('(33) rejects a misplaced organization-link field (organizationId) with 400', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', organizationId: 'org-1' },
    });
    expect(res.status).toBe(400);
  });

  it('(34) rejects any other unknown body key with 400', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', surprise: 1 },
    });
    expect(res.status).toBe(400);
  });

  it('(35) returns 404 for a missing participant', async () => {
    const h = build();
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'does-not-exist',
      headers: adminHeaders(),
      body: { targetStatus: 'active' },
    });
    expect(res.status).toBe(404);
  });

  it('(36) returns 404 for a cross-tenant participant (never reveals existence)', async () => {
    const h = build();
    await seedActive(h); // seeded in TENANT_A
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(TENANT_B),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(404);
  });

  it('(37) requires a tenant identity (401 when absent)', async () => {
    const h = build();
    await seedActive(h);
    const headers = adminHeaders();
    delete headers['x-house-tenant-id'];
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers,
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(401);
  });

  it('(38) re-applying the current status is an idempotent no-op (no duplicate outbox row)', async () => {
    const h = build();
    await seedActive(h); // status already active
    const before = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
    ).length;
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'active' },
    });
    expect(res.status).toBe(200);
    expect((res.body as { participant: { status: string } }).participant.status).toBe('active');
    const after = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
    ).length;
    expect(after).toBe(before); // no-op emits no status_changed signal
  });

  it('(39) a real transition enqueues exactly one status_changed outbox row (service owns the outbox)', async () => {
    const h = build();
    await seedActive(h);
    await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    const statusRows = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
    );
    expect(statusRows.length).toBe(1);
    // The payload is sanitized: it carries no email or names.
    const serialized = JSON.stringify(statusRows[0]?.payload);
    expect(serialized).not.toContain('seed@example.test');
    expect(serialized).not.toContain('Seed Person');
    expect(serialized).not.toContain('Given');
    expect(serialized).not.toContain('Family');
  });

  it('(40) emits a write telemetry counter tagged status_transition/success without leaking PII', async () => {
    const h = build();
    await seedActive(h);
    await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    const signals = h.telemetry.signalsNamed(TelemetryCounters.participantRegistryWrite);
    const stSignals = signals.filter((s) => s.attributes?.['operation'] === 'status_transition');
    expect(stSignals.length).toBe(1);
    expect(stSignals[0]?.attributes?.['result']).toBe('success');
    const serialized = JSON.stringify(h.telemetry.snapshot());
    expect(serialized).not.toContain('seed@example.test');
    expect(serialized).not.toContain('Seed Person');
  });

  it('(41) accepts an optional reason (200) — the reason is never persisted or signaled', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', reason: 'operator note' },
    });
    expect(res.status).toBe(200);
    const serializedOutbox = JSON.stringify(h.outbox.records);
    expect(serializedOutbox).not.toContain('operator note');
    const serializedTelemetry = JSON.stringify(h.telemetry.snapshot());
    expect(serializedTelemetry).not.toContain('operator note');
  });

  it('(42) rejects an over-length reason with 400', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', reason: 'x'.repeat(1025) },
    });
    expect(res.status).toBe(400);
  });

  it('(43) rejects a non-string reason with 400', async () => {
    const h = build();
    await seedActive(h);
    const res = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-st',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', reason: 123 },
    });
    expect(res.status).toBe(400);
  });
});

/** The CLOSED set of keys an organization-participant relationship DTO may ever expose. */
const ALLOWED_RELATIONSHIP_DTO_KEYS = new Set([
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

const ORG_A = '33333333-3333-3333-3333-333333333333';

describe('participant write HTTP adapter — organization link', () => {
  /** Seed an organization (read-only reference) + a participant in TENANT_A, returning the harness. */
  async function seedLinkable(h: Harness, tenantId = TENANT_A): Promise<void> {
    h.organizations.seed(tenantId, ORG_A);
    const created = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(tenantId),
      body: {
        participantId: 'p-link',
        displayName: 'Link Person',
        givenName: 'Given',
        familyName: 'Family',
        email: 'link@example.test',
        status: 'active',
      },
    });
    expect(created.status).toBe(201);
  }

  /** Headers carrying ONLY the exact `participant.organization_link.write` permission. */
  function linkOnlyHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
    return {
      'x-house-tenant-id': tenantId,
      'x-house-actor-user-id': 'op-3',
      'x-house-actor-permission-keys': 'participant.organization_link.write',
      'idempotency-key': 'idem-001',
    };
  }

  /** Headers carrying ONLY the `participant.write` permission (NOT the link action). */
  function profileWriteOnlyHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
    return {
      'x-house-tenant-id': tenantId,
      'x-house-actor-user-id': 'op-4',
      'x-house-actor-permission-keys': 'participant.write',
      'idempotency-key': 'idem-001',
    };
  }

  /** Headers carrying ONLY the `participant.status.write` permission (NOT the link action). */
  function statusWriteOnlyHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
    return {
      'x-house-tenant-id': tenantId,
      'x-house-actor-user-id': 'op-5',
      'x-house-actor-permission-keys': 'participant.status.write',
      'idempotency-key': 'idem-001',
    };
  }

  it('(L1) links a participant to an organization and returns 201 with the closed relationship DTO', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(201);
    const body = res.body as { status: string; relationship: Record<string, unknown> };
    expect(body.status).toBe('ok');
    expect(body.relationship['organizationId']).toBe(ORG_A);
    expect(body.relationship['participantId']).toBe('p-link');
    expect(body.relationship['relationshipType']).toBe('member');
    expect(body.relationship['status']).toBe('active');
    for (const key of Object.keys(body.relationship)) {
      expect(ALLOWED_RELATIONSHIP_DTO_KEYS.has(key)).toBe(true);
    }
  });

  it('(L2) accepts an explicit status and ISO dates', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: {
        participantId: 'p-link',
        relationshipType: 'staff',
        status: 'suspended',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    });
    expect(res.status).toBe(201);
    const rel = (res.body as { relationship: Record<string, unknown> }).relationship;
    expect(rel['status']).toBe('suspended');
    expect(rel['startDate']).toBe('2024-01-01');
    expect(rel['endDate']).toBe('2024-12-31');
  });

  it('(L3) authorizes the exact participant.organization_link.write permission (201)', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: linkOnlyHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(201);
  });

  it('(L4) denies an actor with participant.write but NOT the link action (403)', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: profileWriteOnlyHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(403);
  });

  it('(L5) denies an actor with participant.status.write but NOT the link action (403)', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: statusWriteOnlyHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(403);
  });

  it('(L6) denies a read-only actor (participant.read only) with 403', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: readerHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(403);
  });

  it('(L7) fails closed for an actor with no roles or permissions (403)', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: {
        'x-house-tenant-id': TENANT_A,
        'x-house-actor-user-id': 'nobody',
        'idempotency-key': 'idem-001',
      },
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(403);
  });

  it('(L8) requires a tenant identity (401 when absent)', async () => {
    const h = build();
    await seedLinkable(h);
    const headers = adminHeaders();
    delete headers['x-house-tenant-id'];
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers,
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(401);
  });

  it('(L9) requires the Idempotency-Key header (400 when absent)', async () => {
    const h = build();
    await seedLinkable(h);
    const headers = adminHeaders();
    delete headers['idempotency-key'];
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers,
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(400);
  });

  it('(L10) rejects a blank organizationId path parameter with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: '   ',
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(400);
  });

  it('(L11) rejects a missing participantId with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { relationshipType: 'member' },
    });
    expect(res.status).toBe(400);
  });

  it('(L12) rejects a missing relationshipType with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link' },
    });
    expect(res.status).toBe(400);
  });

  it('(L13) rejects an unknown relationshipType value with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'captain' },
    });
    expect(res.status).toBe(400);
  });

  it('(L14) rejects an unknown status value with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member', status: 'pending' },
    });
    expect(res.status).toBe(400);
  });

  it('(L15) rejects a non-string startDate with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member', startDate: 20240101 },
    });
    expect(res.status).toBe(400);
  });

  it('(L16) rejects a misplaced profile field (displayName) with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member', displayName: 'Nope' },
    });
    expect(res.status).toBe(400);
  });

  it('(L17) rejects a misplaced participant-status field (targetStatus) with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member', targetStatus: 'archived' },
    });
    expect(res.status).toBe(400);
  });

  it('(L18) rejects a relationshipId in the body with 400 (server-generated only)', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member', relationshipId: 'r-1' },
    });
    expect(res.status).toBe(400);
  });

  it('(L19) rejects any other unknown body key with 400', async () => {
    const h = build();
    await seedLinkable(h);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member', surprise: 1 },
    });
    expect(res.status).toBe(400);
  });

  it('(L20) returns 404 for a missing participant', async () => {
    const h = build();
    h.organizations.seed(TENANT_A, ORG_A);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'does-not-exist', relationshipType: 'member' },
    });
    expect(res.status).toBe(404);
  });

  it('(L21) returns 404 for a missing organization', async () => {
    const h = build();
    // Seed the participant but NOT the organization.
    const created = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { participantId: 'p-link', displayName: 'Link Person', status: 'active' },
    });
    expect(created.status).toBe(201);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(404);
  });

  it('(L22) returns 404 for a cross-tenant organization (never reveals existence)', async () => {
    const h = build();
    // Organization ORG_A exists only in TENANT_A; the participant exists in TENANT_B.
    h.organizations.seed(TENANT_A, ORG_A);
    const created = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(TENANT_B),
      body: { participantId: 'p-link', displayName: 'Link Person', status: 'active' },
    });
    expect(created.status).toBe(201);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(TENANT_B),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(404);
  });

  it('(L23) linking the same type twice is idempotent: 201 then 200 with one outbox row', async () => {
    const h = build();
    await seedLinkable(h);
    const first = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(first.status).toBe(201);
    const firstRel = (first.body as { relationship: { relationshipId: string } }).relationship;
    const second = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(second.status).toBe(200);
    const secondRel = (second.body as { relationship: { relationshipId: string } }).relationship;
    // Same relationship returned (no new row), and exactly one organization_linked outbox signal.
    expect(secondRel.relationshipId).toBe(firstRel.relationshipId);
    const linkedRows = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
    );
    expect(linkedRows.length).toBe(1);
  });

  it('(L24) an archived participant cannot receive a NEW active link (409)', async () => {
    const h = build();
    h.organizations.seed(TENANT_A, ORG_A);
    const created = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(),
      body: { participantId: 'p-arch', displayName: 'Archived One', status: 'active' },
    });
    expect(created.status).toBe(201);
    const archived = await handleParticipantStatusTransition(h.deps, {
      participantId: 'p-arch',
      headers: adminHeaders(),
      body: { targetStatus: 'archived' },
    });
    expect(archived.status).toBe(200);
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-arch', relationshipType: 'member' },
    });
    expect(res.status).toBe(409);
  });

  it('(L25) the create enqueues exactly one sanitized organization_linked outbox row', async () => {
    const h = build();
    await seedLinkable(h);
    await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    const linkedRows = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
    );
    expect(linkedRows.length).toBe(1);
    // The payload carries no email or names.
    const serialized = JSON.stringify(linkedRows[0]?.payload);
    expect(serialized).not.toContain('link@example.test');
    expect(serialized).not.toContain('Link Person');
    expect(serialized).not.toContain('Given');
    expect(serialized).not.toContain('Family');
  });

  it('(L26) emits a write telemetry counter tagged organization_link/success without leaking PII', async () => {
    const h = build();
    await seedLinkable(h);
    await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    const signals = h.telemetry.signalsNamed(TelemetryCounters.participantRegistryWrite);
    const linkSignals = signals.filter((s) => s.attributes?.['operation'] === 'organization_link');
    expect(linkSignals.length).toBe(1);
    expect(linkSignals[0]?.attributes?.['result']).toBe('success');
    const serialized = JSON.stringify(h.telemetry.snapshot());
    expect(serialized).not.toContain('link@example.test');
    expect(serialized).not.toContain('Link Person');
  });

  it('(L27) the idempotent read-back (200) enqueues no additional outbox row', async () => {
    const h = build();
    await seedLinkable(h);
    await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    const before = h.outbox.records.length;
    const res = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(res.status).toBe(200);
    expect(h.outbox.records.length).toBe(before); // no new signal on the idempotent read-back
  });

  it('(L28) a different relationship type creates a distinct relationship (201)', async () => {
    const h = build();
    await seedLinkable(h);
    const member = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'member' },
    });
    expect(member.status).toBe(201);
    const staff = await handleOrganizationParticipantLink(h.deps, {
      organizationId: ORG_A,
      headers: adminHeaders(),
      body: { participantId: 'p-link', relationshipType: 'staff' },
    });
    expect(staff.status).toBe(201);
    const memberId = (member.body as { relationship: { relationshipId: string } }).relationship
      .relationshipId;
    const staffId = (staff.body as { relationship: { relationshipId: string } }).relationship
      .relationshipId;
    expect(memberId).not.toBe(staffId);
    const linkedRows = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
    );
    expect(linkedRows.length).toBe(2);
  });

  it('(L29) participantWriteErrorToHttpResult maps ORGANIZATION_NOT_FOUND to 404', () => {
    const res = participantWriteErrorToHttpResult(
      new AppError(ErrorCode.ORGANIZATION_NOT_FOUND, 'nope'),
      'req-1',
    );
    expect(res.status).toBe(404);
  });
});

describe('participant write HTTP adapter — organization relationship status transition', () => {
  const ORG_B = '44444444-4444-4444-4444-444444444444';

  /** Headers carrying ONLY the exact `participant.organization_link.write` permission. */
  function linkOnlyHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
    return {
      'x-house-tenant-id': tenantId,
      'x-house-actor-user-id': 'op-6',
      'x-house-actor-permission-keys': 'participant.organization_link.write',
      'idempotency-key': 'idem-001',
    };
  }

  /** Headers carrying ONLY the `participant.write` permission (NOT the link action). */
  function profileWriteOnlyHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
    return {
      'x-house-tenant-id': tenantId,
      'x-house-actor-user-id': 'op-7',
      'x-house-actor-permission-keys': 'participant.write',
      'idempotency-key': 'idem-001',
    };
  }

  /** Headers carrying ONLY the `participant.status.write` permission (NOT the link action). */
  function statusWriteOnlyHeaders(tenantId = TENANT_A): Record<string, string | undefined> {
    return {
      'x-house-tenant-id': tenantId,
      'x-house-actor-user-id': 'op-8',
      'x-house-actor-permission-keys': 'participant.status.write',
      'idempotency-key': 'idem-001',
    };
  }

  /**
   * Seed an organization + a participant + an active `member` relationship in the given tenant,
   * returning the server-generated relationshipId. The organization is read-only reference; the
   * relationship is created through the validated link route.
   */
  async function seedRelationship(
    h: Harness,
    tenantId = TENANT_A,
    organizationId = ORG_A,
  ): Promise<string> {
    h.organizations.seed(tenantId, organizationId);
    const created = await handleParticipantCreate(h.deps, {
      headers: adminHeaders(tenantId),
      body: {
        participantId: 'p-rel',
        displayName: 'Rel Person',
        givenName: 'Given',
        familyName: 'Family',
        email: 'rel@example.test',
        status: 'active',
      },
    });
    expect(created.status).toBe(201);
    const linked = await handleOrganizationParticipantLink(h.deps, {
      organizationId,
      headers: adminHeaders(tenantId),
      body: { participantId: 'p-rel', relationshipType: 'member' },
    });
    expect(linked.status).toBe(201);
    return (linked.body as { relationship: { relationshipId: string } }).relationship.relationshipId;
  }

  it('(S1) transitions a relationship status and returns 200 with the closed relationship DTO', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(200);
    const body = res.body as { status: string; relationship: Record<string, unknown> };
    expect(body.status).toBe('ok');
    expect(body.relationship['relationshipId']).toBe(relationshipId);
    expect(body.relationship['status']).toBe('suspended');
    for (const key of Object.keys(body.relationship)) {
      expect(ALLOWED_RELATIONSHIP_DTO_KEYS.has(key)).toBe(true);
    }
  });

  it('(S2) accepts an optional reason (validated but not persisted) — 200', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'ended', reason: 'season complete' },
    });
    expect(res.status).toBe(200);
    // The reason never reaches the outbox payload.
    const rows = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
    );
    expect(rows.length).toBe(1);
    expect(JSON.stringify(rows[0]?.payload)).not.toContain('season complete');
  });

  it('(S3) authorizes the exact participant.organization_link.write permission (200)', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: linkOnlyHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(200);
  });

  it('(S4) denies an actor with participant.write but NOT the link action (403)', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: profileWriteOnlyHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(403);
  });

  it('(S5) denies an actor with participant.status.write but NOT the link action (403)', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: statusWriteOnlyHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(403);
  });

  it('(S6) denies a read-only actor (participant.read only) with 403', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: readerHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(403);
  });

  it('(S7) requires a tenant identity (401 when absent)', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const headers = adminHeaders();
    delete headers['x-house-tenant-id'];
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers,
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(401);
  });

  it('(S8) requires the Idempotency-Key header (400 when absent)', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const headers = adminHeaders();
    delete headers['idempotency-key'];
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers,
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(400);
  });

  it('(S9) rejects a blank organizationId path parameter with 400', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: '   ',
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(400);
  });

  it('(S10) rejects a blank relationshipId path parameter with 400', async () => {
    const h = build();
    await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId: '   ',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(400);
  });

  it('(S11) rejects a missing targetStatus with 400', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it('(S12) rejects an unknown targetStatus value with 400', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'archived' },
    });
    expect(res.status).toBe(400);
  });

  it('(S13) rejects a non-string reason with 400', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', reason: 42 },
    });
    expect(res.status).toBe(400);
  });

  it('(S14) rejects an over-long reason with 400', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', reason: 'x'.repeat(1025) },
    });
    expect(res.status).toBe(400);
  });

  it('(S15) rejects a misplaced link-CREATE field (participantId) with 400', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', participantId: 'p-rel' },
    });
    expect(res.status).toBe(400);
  });

  it('(S16) rejects a misplaced link-CREATE field (relationshipType/endDate) with 400', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', relationshipType: 'staff', endDate: '2024-12-31' },
    });
    expect(res.status).toBe(400);
  });

  it('(S17) rejects any other unknown body key with 400', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended', surprise: 1 },
    });
    expect(res.status).toBe(400);
  });

  it('(S18) returns 404 for a missing relationship', async () => {
    const h = build();
    h.organizations.seed(TENANT_A, ORG_A);
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId: 'does-not-exist',
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(404);
  });

  it('(S19) returns 404 when the relationship exists but under a DIFFERENT organization', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    // The relationship belongs to ORG_A; asking for it under ORG_B must be indistinguishable
    // from not-found (the path organization is authoritative).
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_B,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(404);
  });

  it('(S20) returns 404 for a cross-tenant relationship (never reveals existence)', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h, TENANT_A);
    // Same relationshipId, but the caller is in TENANT_B where it is invisible.
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(TENANT_B),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(404);
  });

  it('(S21) re-applying the current status is an idempotent no-op: 200 with no new outbox row', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const first = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(first.status).toBe(200);
    const afterFirst = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
    ).length;
    const second = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(second.status).toBe(200);
    const afterSecond = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
    ).length;
    expect(afterSecond).toBe(afterFirst); // no duplicate signal on the no-op re-apply
  });

  it('(S22) enqueues exactly one sanitized status-changed outbox row (no PII)', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    const rows = h.outbox.records.filter(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
    );
    expect(rows.length).toBe(1);
    const payload = rows[0]?.payload as Record<string, unknown>;
    const SAFE_LINK_STATUS_PAYLOAD_KEYS = new Set([
      'relationshipId',
      'tenantId',
      'organizationId',
      'participantId',
      'relationshipType',
      'previousStatus',
      'newStatus',
      'requestId',
      'correlationId',
      'actorUserId',
    ]);
    for (const key of Object.keys(payload)) {
      expect(SAFE_LINK_STATUS_PAYLOAD_KEYS.has(key)).toBe(true);
    }
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('rel@example.test');
    expect(serialized).not.toContain('Rel Person');
    expect(serialized).not.toContain('Given');
    expect(serialized).not.toContain('Family');
    expect(payload['previousStatus']).toBe('active');
    expect(payload['newStatus']).toBe('suspended');
  });

  it('(S23) emits a write telemetry counter tagged organization_link_status/success without leaking PII', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: adminHeaders(),
      body: { targetStatus: 'suspended' },
    });
    const signals = h.telemetry.signalsNamed(TelemetryCounters.participantRegistryWrite);
    const statusSignals = signals.filter(
      (s) => s.attributes?.['operation'] === 'organization_link_status',
    );
    expect(statusSignals.length).toBe(1);
    expect(statusSignals[0]?.attributes?.['result']).toBe('success');
    const serialized = JSON.stringify(h.telemetry.snapshot());
    expect(serialized).not.toContain('rel@example.test');
    expect(serialized).not.toContain('Rel Person');
  });

  it('(S24) a denied request (403) never enqueues an outbox row', async () => {
    const h = build();
    const relationshipId = await seedRelationship(h);
    const before = h.outbox.records.length;
    const res = await handleOrganizationParticipantStatusTransition(h.deps, {
      organizationId: ORG_A,
      relationshipId,
      headers: readerHeaders(),
      body: { targetStatus: 'suspended' },
    });
    expect(res.status).toBe(403);
    expect(h.outbox.records.length).toBe(before);
  });
});
