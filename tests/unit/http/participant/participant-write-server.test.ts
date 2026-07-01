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
 * Transport tests for the Participant Registry WRITE endpoints (create, update, and the
 * reference-data status transition) wired into the native HTTP server. They drive
 * POST /v1/participants, PATCH /v1/participants/:id, and
 * POST /v1/participants/:id/status-transitions over a short-lived ephemeral loopback listener and
 * confirm method-based dispatch (read GET coexists with write POST/PATCH; the status-transitions
 * sub-resource only accepts POST; unsupported methods 405 with the correct Allow header). NO
 * database, NO Docker, NO real Azure — the registry store is in-process.
 */

const CLOCK = fixedClock(1_700_000_000_000);
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const ORG_A = '33333333-3333-3333-3333-333333333333';

/** Read-only, tenant-scoped organization-existence reader (never creates/mutates an organization). */
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

async function build(): Promise<{ server: Server; baseUrl: string; organizations: StubOrganizationReader }> {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK });
  const organizations = new StubOrganizationReader();
  organizations.seed(TENANT_A, ORG_A);
  const service = new ParticipantRegistryService(store, {
    clock: CLOCK,
    organizationReader: organizations,
  });
  const server = createAffiliationHttpServer({
    executor: new FailingExecutor(),
    participantRead: { readStore: store },
    participantWrite: { service, readStore: store },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}`, organizations };
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

  it('transitions status via POST /v1/participants/:id/status-transitions', async () => {
    const { server, baseUrl } = await build();
    active = server;
    await fetch(`${baseUrl}/v1/participants`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ participantId: 'st-1', displayName: 'Status One' }),
    });
    const res = await fetch(`${baseUrl}/v1/participants/st-1/status-transitions`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ targetStatus: 'active' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { participant: { status: string } };
    expect(body.participant.status).toBe('active');
  });

  it('returns 405 with Allow: POST for an unsupported status-transitions method', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants/st-1/status-transitions`, {
      method: 'GET',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('does not expose a relationship-status write route (unknown participant sub-path → 404)', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants/http-1/status`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ status: 'active' }),
    });
    expect(res.status).toBe(404);
  });

  it('creates an organization link via POST /v1/organizations/:organizationId/participants', async () => {
    const { server, baseUrl } = await build();
    active = server;
    await fetch(`${baseUrl}/v1/participants`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ participantId: 'link-1', displayName: 'Link One', status: 'active' }),
    });
    const res = await fetch(`${baseUrl}/v1/organizations/${ORG_A}/participants`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ participantId: 'link-1', relationshipType: 'member' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      relationship: { organizationId: string; participantId: string; relationshipType: string };
    };
    expect(body.relationship.organizationId).toBe(ORG_A);
    expect(body.relationship.participantId).toBe('link-1');
    expect(body.relationship.relationshipType).toBe('member');
  });

  it('the organization-participants GET read route coexists with the POST write route', async () => {
    const { server, baseUrl } = await build();
    active = server;
    await fetch(`${baseUrl}/v1/participants`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ participantId: 'link-2', displayName: 'Link Two', status: 'active' }),
    });
    await fetch(`${baseUrl}/v1/organizations/${ORG_A}/participants`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ participantId: 'link-2', relationshipType: 'staff' }),
    });
    const get = await fetch(`${baseUrl}/v1/organizations/${ORG_A}/participants`, {
      headers: adminHeaders(),
    });
    expect(get.status).toBe(200);
    const body = (await get.json()) as { items: Array<{ participantId: string }> };
    expect(body.items.some((r) => r.participantId === 'link-2')).toBe(true);
  });

  it('returns 405 with Allow: GET, POST for an unsupported organization-participants method', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations/${ORG_A}/participants`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });
});
