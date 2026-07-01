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
import {
  InMemoryParticipantRegistryStore,
  ParticipantRegistryService,
  type OrganizationReader as ParticipantOrganizationReader,
} from '../../../../src/domains/participant-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

const { fetch } = globalThis;

/**
 * Transport tests for the Facility Registry READ endpoints wired into the native HTTP server. They
 * drive the routes over a short-lived ephemeral loopback listener and confirm the participant
 * routes are NOT shadowed when facility routes are present. NO database, NO Docker, NO real Azure
 * are involved — the registry stores are in-process.
 */

const CLOCK = fixedClock(1_700_000_000_000);
const TENANT_A = '11111111-1111-1111-1111-111111111111';
const ORG_A = 'org-1';

const ANY_FACILITY_ORG_READER: FacilityOrganizationReader = {
  getById: (_tenantId, organizationId) =>
    Promise.resolve(organizationId.trim() === '' ? undefined : { organizationId }),
};
const ANY_PARTICIPANT_ORG_READER: ParticipantOrganizationReader = {
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

function facilityReaderHeaders(): Record<string, string> {
  return {
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'facility_reader',
  };
}

function participantReaderHeaders(): Record<string, string> {
  return {
    'x-house-tenant-id': TENANT_A,
    'x-house-actor-user-id': 'op-1',
    'x-house-actor-role-keys': 'participant_reader',
  };
}

async function build(): Promise<{
  server: Server;
  baseUrl: string;
  facilityId: string;
  participantId: string;
}> {
  const facilityOutbox = new InMemoryOutboxStore(CLOCK);
  const facilityStore = new InMemoryFacilityRegistryStore(facilityOutbox, { clock: CLOCK });
  let fn = 0;
  const facilityService = new FacilityRegistryService(facilityStore, {
    clock: CLOCK,
    ids: { newId: () => `fac-${++fn}` },
    organizationReader: ANY_FACILITY_ORG_READER,
  });
  const facility = await facilityService.createFacility({
    tenantId: TENANT_A,
    organizationId: ORG_A,
    name: 'Central Venue',
    facilityType: 'venue',
  });

  const participantOutbox = new InMemoryOutboxStore(CLOCK);
  const participantStore = new InMemoryParticipantRegistryStore(participantOutbox, { clock: CLOCK });
  let pn = 0;
  const participantService = new ParticipantRegistryService(participantStore, {
    clock: CLOCK,
    ids: { newId: () => `p-${++pn}` },
    organizationReader: ANY_PARTICIPANT_ORG_READER,
  });
  const participant = await participantService.createParticipant({
    tenantId: TENANT_A,
    displayName: 'Pat Reader',
  });
  await participantService.linkParticipantToOrganization({
    tenantId: TENANT_A,
    organizationId: ORG_A,
    participantId: participant.participantId,
    relationshipType: 'member',
  });

  const server = createAffiliationHttpServer({
    executor: new FailingExecutor(),
    facilityRead: { readStore: facilityStore },
    participantRead: { readStore: participantStore },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    facilityId: facility.facilityId,
    participantId: participant.participantId,
  };
}

let active: Server | undefined;

afterEach(async () => {
  if (active !== undefined) {
    await new Promise<void>((resolve) => active!.close(() => resolve()));
    active = undefined;
  }
});

describe('facility read routes (server transport)', () => {
  it('serves GET /v1/facilities', async () => {
    const { server, baseUrl, facilityId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities`, { headers: facilityReaderHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ facilityId: string }> };
    expect(body.items.map((i) => i.facilityId)).toEqual([facilityId]);
  });

  it('serves GET /v1/facilities/:id', async () => {
    const { server, baseUrl, facilityId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${facilityId}`, {
      headers: facilityReaderHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { facility: { facilityId: string } };
    expect(body.facility.facilityId).toBe(facilityId);
  });

  it('serves GET /v1/organizations/:id/facilities', async () => {
    const { server, baseUrl, facilityId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations/${ORG_A}/facilities`, {
      headers: facilityReaderHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ facilityId: string }> };
    expect(body.items.map((i) => i.facilityId)).toEqual([facilityId]);
  });

  it('returns 405 with Allow: GET for a non-GET on /v1/facilities', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      method: 'POST',
      headers: facilityReaderHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 404 for a deeper unknown facility path', async () => {
    const { server, baseUrl, facilityId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities/${facilityId}/extra`, {
      headers: facilityReaderHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it('does not shadow the participant routes when facility routes are present', async () => {
    const { server, baseUrl, participantId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/participants`, {
      headers: participantReaderHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ participantId: string }> };
    expect(body.items.map((i) => i.participantId)).toEqual([participantId]);
  });

  it('does not shadow the org-participants route with the org-facilities route', async () => {
    const { server, baseUrl, participantId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations/${ORG_A}/participants`, {
      headers: participantReaderHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ participantId: string }> };
    expect(body.items.map((i) => i.participantId)).toEqual([participantId]);
  });

  it('returns 400 for an invalid facility filter', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities?status=bogus`, {
      headers: facilityReaderHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 when no tenant identity is present', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: { 'x-house-actor-role-keys': 'facility_reader' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 when the actor lacks facility.read', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/facilities`, {
      headers: {
        'x-house-tenant-id': TENANT_A,
        'x-house-actor-user-id': 'op-1',
        'x-house-actor-role-keys': 'member',
      },
    });
    expect(res.status).toBe(403);
  });
});
