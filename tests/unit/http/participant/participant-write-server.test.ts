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
} from '../../../../src/domains/participant-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

const { fetch } = globalThis;

/**
 * Transport tests for the Participant Registry WRITE endpoints (phase 1 — create + update) wired
 * into the native HTTP server. They drive POST /v1/participants and PATCH /v1/participants/:id over
 * a short-lived ephemeral loopback listener and confirm method-based dispatch (read GET coexists
 * with write POST/PATCH; unsupported methods 405 with the correct Allow header). NO database, NO
 * Docker, NO real Azure — the registry store is in-process.
 */

const CLOCK = fixedClock(1_700_000_000_000);
const TENANT_A = '11111111-1111-1111-1111-111111111111';

class FailingExecutor implements AffiliationCommandExecutor {
  executeCommand(
    _command: string,
    _request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return Promise.reject(new Error('participant routes must never call the command executor'));
  }
}

function adminHeaders(): Record<string, string> {
  return {
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'admin-1',
    'x-house-actor-role-keys': 'participant_admin',
    'idempotency-key': 'idem-http-1',
    'content-type': 'application/json',
  };
}

async function build(): Promise<{ server: Server; baseUrl: string }> {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK });
  const service = new ParticipantRegistryService(store, { clock: CLOCK });
  const server = createAffiliationHttpServer({
    executor: new FailingExecutor(),
    participantRead: { readStore: store },
    participantWrite: { service, readStore: store },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

let active: Server | undefined;

afterEach(async () => {
  if (active !== undefined) {
    await new Promise<void>((resolve) => active!.close(() => resolve()));
    active = undefined;
  }
});

describe('participant write routes (server transport)', () => {
  it('creates via POST /v1/participants then reads it back with GET', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const created = await fetch(`${baseUrl}/v1/participants`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ participantId: 'http-1', displayName: 'HTTP One' }),
    });
    expect(created.status).toBe(201);
    const get = await fetch(`${baseUrl}/v1/participants/http-1`, { headers: adminHeaders() });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { participant: { participantId: string } };
    expect(body.participant.participantId).toBe('http-1');
  });

  it('updates via PATCH /v1/participants/:id', async () => {
    const { server, baseUrl } = await build();
    active = server;
    await fetch(`${baseUrl}/v1/participants`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ participantId: 'http-2', displayName: 'Before' }),
    });
    const patched = await fetch(`${baseUrl}/v1/participants/http-2`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ displayName: 'After' }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as { participant: { displayName: string } };
    expect(body.participant.displayName).toBe('After');
  });

  it('returns 409 for a duplicate POST', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const make = () =>
      fetch(`${baseUrl}/v1/participants`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ participantId: 'dup', displayName: 'Dup' }),
      });
    expect((await make()).status).toBe(201);
    expect((await make()).status).toBe(409);
  });

  it('returns 405 with Allow: GET, POST for an unsupported collection method', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });

  it('returns 405 with Allow: GET, PATCH for an unsupported item method', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants/whatever`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, PATCH');
  });

  it('does not expose a status-transition route (two-segment path → 404)', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants/http-1/status`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(404);
  });
});
