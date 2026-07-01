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
  InMemoryOrganizationRegistryStore,
  OrganizationRegistryService,
} from '../../../../src/domains/organization-registry/index.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

const { fetch } = globalThis;

/**
 * Transport tests for the Organization Registry READ endpoints wired into the native HTTP
 * server. They drive the routes over a short-lived ephemeral loopback listener and confirm the
 * existing transition route still works when the organization routes are present. NO database,
 * NO Docker, NO real Azure are involved — the registry store is in-process.
 */

const CLOCK = fixedClock(1_700_000_000_000);
const TENANT_A = '11111111-1111-1111-1111-111111111111';

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
    'x-house-actor-role-keys': 'organization_reader',
  };
}

async function build(): Promise<{ server: Server; baseUrl: string; orgId: string }> {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryOrganizationRegistryStore(outbox, { clock: CLOCK });
  const service = new OrganizationRegistryService(store, {
    clock: CLOCK,
    ids: { newId: () => 'org-fixed-1' },
  });
  const view = await service.createOrganization({
    tenantId: TENANT_A,
    organizationType: 'regional',
    displayName: 'Region Office',
  });

  const server = createAffiliationHttpServer({
    executor: new FailingExecutor(),
    organizationRead: { readStore: store },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}`, orgId: view.organizationId };
}

let active: Server | undefined;

afterEach(async () => {
  if (active !== undefined) {
    await new Promise<void>((resolve) => active!.close(() => resolve()));
    active = undefined;
  }
});

describe('organization read routes (server transport)', () => {
  it('serves GET /v1/organizations', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations`, { headers: readerHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ organizationId: string }> };
    expect(body.items.map((i) => i.organizationId)).toEqual(['org-fixed-1']);
  });

  it('serves GET /v1/organizations/:id', async () => {
    const { server, baseUrl, orgId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations/${orgId}`, { headers: readerHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { organization: { organizationId: string } };
    expect(body.organization.organizationId).toBe(orgId);
  });

  it('returns 405 for a non-GET method on the list route', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations`, {
      method: 'POST',
      headers: readerHeaders(),
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 405 for a non-GET method on the detail route', async () => {
    const { server, baseUrl, orgId } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations/${orgId}`, {
      method: 'DELETE',
      headers: readerHeaders(),
    });
    expect(res.status).toBe(405);
  });

  it('returns 404 for a missing organization', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations/nope`, { headers: readerHeaders() });
    expect(res.status).toBe(404);
  });

  it('returns 401 when no tenant identity is present', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations`);
    expect(res.status).toBe(401);
  });

  // Authenticated (tenant + actor present) but the actor's role does not grant organization.read:
  // the read gate must fail closed with 403 (not 401, not 200) through the server transport.
  it('returns 403 when the authenticated actor lacks the organization-read role', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/organizations`, {
      headers: {
        'x-house-tenant-id': TENANT_A,
        'x-house-actor-user-id': 'op-1',
        'x-house-actor-role-keys': 'member',
      },
    });
    expect(res.status).toBe(403);
  });

  it('still serves the existing transition route (405 on GET)', async () => {
    const { server, baseUrl } = await build();
    active = server;
    const res = await fetch(`${baseUrl}/v1/affiliation/applications/app-1/transitions/submit`);
    expect(res.status).toBe(405);
  });

  it('404s organization routes when the transport is not wired', async () => {
    const server = createAffiliationHttpServer({ executor: new FailingExecutor() });
    active = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/v1/organizations`, { headers: readerHeaders() });
    expect(res.status).toBe(404);
  });
});
