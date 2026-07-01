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
  FacilityRegistryService,
  InMemoryFacilityRegistryStore,
  type OrganizationReader as FacilityOrganizationReader,
} from '../../../../src/domains/facility-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

const { fetch } = globalThis;

/**
 * Transport tests for the Facility Registry WRITE endpoints (create + update + status transition)
 * wired into the native HTTP server alongside the read surface. They drive the routes over a
 * short-lived ephemeral loopback listener. NO database, NO Docker, NO real Azure are involved — the
 * registry store is in-process. A facility STATUS transition is a distinct reference-data route
 * (`POST /v1/facilities/:facilityId/status-transitions`) gated by `facility.status.write`.
 */

const CLOCK = fixedClock(1_700_000_000_000);
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const ORG_A = 'org-1';

const ANY_FACILITY_ORG_READER: FacilityOrganizationReader = {
  getById: (_tenantId, organizationId) =>
    Promise.resolve(organizationId.trim() === '' ? undefined : { organizationId }),
};

class FailingExecutor implements AffiliationCommandExecutor {
  executeCommand(
    _command: string,
    _request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return Promise.reject(new Error('facility routes must never call the command executor'));
  }
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'admin-1',
    'x-house-actor-role-keys': 'facility_admin',
    'idempotency-key': 'idem-001',
    ...extra,
  };
}

function readerHeaders(): Record<string, string> {
  return {
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'facility_reader',
  };
}

function memberHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'member',
    'idempotency-key': 'idem-001',
  };
}

async function build(): Promise<{ server: Server; baseUrl: string; seededId: string }> {
  const facilityOutbox = new InMemoryOutboxStore(CLOCK);
  const facilityStore = new InMemoryFacilityRegistryStore(facilityOutbox, { clock: CLOCK });
  const facilityService = new FacilityRegistryService(facilityStore, {
    clock: CLOCK,
    organizationReader: ANY_FACILITY_ORG_READER,
  });
  const seeded = await facilityService.createFacility({
    tenantId: TENANT_A,
    facilityId: 'seed-fac',
    organizationId: ORG_A,
    name: 'Seed Venue',
    facilityType: 'venue',
  });

  const server = createAffiliationHttpServer({
    executor: new FailingExecutor(),
    facilityRead: { readStore: facilityStore },
    facilityWrite: { service: facilityService, readStore: facilityStore },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}`, seededId: seeded.facilityId };
}

let active: Server | undefined;

afterEach(async () => {
  if (active !== undefined) {
    await new Promise<void>((resolve) => active!.close(() => resolve()));
    active = undefined;
  }
});

describe('facility write routes (server transport)', () => {
  it('(1) POST /v1/facilities creates a facility (201)', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        facilityId: 'fac-new',
        organizationId: ORG_A,
        name: 'New Venue',
        facilityType: 'venue',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { facility: { facilityId: string } };
    expect(body.facility.facilityId).toBe('fac-new');
  });

  it('(2) PATCH /v1/facilities/:id updates a facility (200)', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${seededId}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ name: 'Renamed Venue' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { facility: { name: string } };
    expect(body.facility.name).toBe('Renamed Venue');
  });

  it('(3) POST /v1/facilities/:id/status-transitions transitions status (200)', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${seededId}/status-transitions`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ targetStatus: 'active' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { facility: { status: string } };
    expect(body.facility.status).toBe('active');
  });

  it('(3b) GET on the status-transitions route returns 405 with Allow: POST', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${seededId}/status-transitions`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('(3c) the status route does not shadow GET/PATCH on the detail route', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const getRes = await fetch(`${baseUrl}/v1/facilities/${seededId}`, {
      headers: readerHeaders(),
    });
    expect(getRes.status).toBe(200);
    const patchRes = await fetch(`${baseUrl}/v1/facilities/${seededId}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ name: 'Renamed Venue' }),
    });
    expect(patchRes.status).toBe(200);
  });

  it('(3d) malformed JSON on the status route returns 400', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${seededId}/status-transitions`, {
      method: 'POST',
      headers: adminHeaders(),
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('(3e) an actor lacking facility.status.write is denied with 403 on the status route', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${seededId}/status-transitions`, {
      method: 'POST',
      headers: memberHeaders(),
      body: JSON.stringify({ targetStatus: 'active' }),
    });
    expect(res.status).toBe(403);
  });

  it('(4) DELETE /v1/facilities returns 405 with Allow: GET, POST', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, POST');
  });

  it('(5) DELETE /v1/facilities/:id returns 405 with Allow: GET, PATCH', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${seededId}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, PATCH');
  });

  it('(6) existing GET reads still work when write is wired', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${seededId}`, { headers: readerHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { facility: { facilityId: string } };
    expect(body.facility.facilityId).toBe(seededId);
  });

  it('(7) a deeper unknown facility path returns 404', async () => {
    const { server, baseUrl, seededId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${seededId}/extra/path`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it('(8) malformed JSON on POST returns 400', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      method: 'POST',
      headers: adminHeaders(),
      body: '{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('(9) an actor lacking facility.write is denied with 403 on POST', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      method: 'POST',
      headers: memberHeaders(),
      body: JSON.stringify({
        facilityId: 'fac-x',
        organizationId: ORG_A,
        name: 'X',
        facilityType: 'venue',
      }),
    });
    expect(res.status).toBe(403);
  });
});
