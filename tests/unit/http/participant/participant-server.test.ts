import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { createAffiliationHttpServer } from '../../../../src/http/server.js';
import type { AffiliationCommandExecutor } from '../../../../src/http/AffiliationHttpAdapter.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import {
  InMemoryParticipantRegistryStore,
  ParticipantRegistryService,
  type OrganizationReader,
} from '../../../../src/domains/participant-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

const { fetch } = globalThis;

/**
 * Transport tests for the Participant Registry READ endpoints wired into the native HTTP server.
 * They drive the routes over a short-lived ephemeral loopback listener and confirm the existing
 * transition route still works when the participant routes are present. NO database, NO Docker, NO
 * real Azure are involved — the registry store is in-process.
 */

const CLOCK = fixedClock(1_700_000_000_000);
const TENANT_A = '11111111-1111-1111-1111-111111111111';

const ANY_ORG_READER: OrganizationReader = {
  getById: (_tenantId, organizationId) =>
    Promise.resolve(organizationId.trim() === '' ? undefined : { organizationId }),
};

class FailingExecutor implements AffiliationCommandExecutor {
  executeCommand(
    _command: string,
    _request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return Promise.reject(new Error('read routes must never call the command executor'));
  }
}

function readerHeaders(tenantId = TENANT_A): Record<string, string> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'participant_reader',
  };
}

async function build(): Promise<{
  server: Server;
  baseUrl: string;
  participantId: string;
  relationshipId: string;
}> {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK });
  let n = 0;
  const service = new ParticipantRegistryService(store, {
    clock: CLOCK,
    ids: { newId: () => `p-fixed-${++n}` },
    organizationReader: ANY_ORG_READER,
  });
  const participant = await service.createParticipant({
    tenantId: TENANT_A,
    displayName: 'Pat Reader',
  });
  const link = await service.linkParticipantToOrganization({
    tenantId: TENANT_A,
    organizationId: 'org-1',
    participantId: participant.participantId,
    relationshipType: 'member',
  });

  const server = createAffiliationHttpServer({
    executor: new FailingExecutor(),
    participantRead: { readStore: store },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    participantId: participant.participantId,
    relationshipId: link.relationshipId,
  };
}

let active: Server | undefined;

afterEach(async () => {
  if (active !== undefined) {
    await new Promise<void>((resolve) => active!.close(() => resolve()));
    active = undefined;
  }
});

describe('participant read routes (server transport)', () => {
  it('serves GET /v1/participants', async () => {
    const { server, baseUrl, participantId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants`, { headers: readerHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ participantId: string }> };
    expect(body.items.map((i) => i.participantId)).toEqual([participantId]);
  });

  it('serves GET /v1/participants/:id', async () => {
    const { server, baseUrl, participantId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants/${participantId}`, {
      headers: readerHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { participant: { participantId: string } };
    expect(body.participant.participantId).toBe(participantId);
  });

  it('serves GET /v1/organizations/:id/participants', async () => {
    const { server, baseUrl, relationshipId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations/org-1/participants`, {
      headers: readerHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ relationshipId: string }> };
    expect(body.items.map((i) => i.relationshipId)).toEqual([relationshipId]);
  });

  it('returns 405 for a non-GET method on the participant list route', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants`, {
      method: 'POST',
      headers: readerHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 405 for a non-GET method on the organization participants route', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations/org-1/participants`, {
      method: 'DELETE',
      headers: readerHeaders(),
    });
    expect(res.status).toBe(405);
  });

  it('returns 404 for a missing participant', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants/nope`, { headers: readerHeaders() });
    expect(res.status).toBe(404);
  });

  it('returns 401 when no tenant identity is present', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for an authenticated actor lacking participant.read', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants`, {
      headers: {
        'x-house-tenant-id': TENANT_A,
        'x-house-actor-user-id': 'op-1',
        'x-house-actor-role-keys': 'member',
      },
    });
    expect(res.status).toBe(403);
  });

  it('still serves the existing affiliation transition 404 for unknown resources', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/unknown/resource`, { headers: readerHeaders() });
    expect(res.status).toBe(404);
  });

  it('keeps /healthz and /readyz responsive with participant routes present', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
    const ready = await fetch(`${baseUrl}/readyz`);
    expect(ready.status).toBe(200);
  });
});
