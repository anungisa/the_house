import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createAffiliationHttpServer } from '../../../src/http/server.js';
import type { AffiliationCommandExecutor } from '../../../src/http/AffiliationHttpAdapter.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../src/domains/affiliation/AffiliationApplicationDtos.js';

// Bind the global fetch locally (Node >=20) so lint's no-undef is satisfied.
const { fetch } = globalThis;

/**
 * Transport-only unit tests for the native HTTP server (src/http/server.ts).
 *
 * These exercise routing, body parsing/size-cap, status/content-type handling, and the
 * error guard — NOT domain logic. The domain boundary is replaced by an in-memory fake
 * executor, so NO database (or Docker) is required. A short-lived ephemeral listener
 * (port 0, loopback) is used purely to drive the native server; it is not a production
 * listener.
 */

// --- In-memory fakes of the domain command boundary. ---
class RecordingExecutor implements AffiliationCommandExecutor {
  public readonly calls: { command: string; request: AffiliationApplicationTransitionRequest }[] =
    [];
  constructor(
    private readonly response: AffiliationApplicationTransitionResponse = {
      status: 'executed',
      applicationId: 'app-1',
      fromState: 'draft',
      toState: 'submitted',
      transitionId: 'st-1',
      auditEventId: 'au-1',
    },
  ) {}
  executeCommand(
    command: string,
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    this.calls.push({ command, request });
    return Promise.resolve(this.response);
  }
}

class ThrowingExecutor implements AffiliationCommandExecutor {
  executeCommand(): Promise<AffiliationApplicationTransitionResponse> {
    // Simulates a raw internal/SQL failure leaking out of the domain layer.
    return Promise.reject(new Error('SELECT secret_column FROM users WHERE password = $1'));
  }
}

// --- Ephemeral listener lifecycle (closed after each test). ---
const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        }),
    ),
  );
});

async function start(
  executor: AffiliationCommandExecutor,
  maxBodyBytes?: number,
): Promise<string> {
  const server = createAffiliationHttpServer(
    maxBodyBytes !== undefined ? { executor, maxBodyBytes } : { executor },
  );
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const VALID_BODY = {
  tenantId: 'tenant-1',
  actor: { userId: 'user-1', roleKeys: ['reviewer'] },
  context: { seasonId: '2025-26' },
  idempotencyKey: 'k1',
  reason: 'because',
};

describe('AffiliationApplication HTTP server (transport)', () => {
  // (13) Constructing the server does NOT start a listener.
  it('can be constructed without starting a listener', () => {
    const server = createAffiliationHttpServer({ executor: new RecordingExecutor() });
    try {
      expect(server.listening).toBe(false);
    } finally {
      server.close();
    }
  });

  // (1) GET /healthz → 200 JSON.
  it('GET /healthz returns 200 with a JSON health body', async () => {
    const base = await start(new RecordingExecutor());
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['status']).toBe('ok');
  });

  // (2) GET /readyz → 200 JSON.
  it('GET /readyz returns 200 with a JSON readiness body', async () => {
    const base = await start(new RecordingExecutor());
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['status']).toBe('ok');
  });

  // (3)(5)(6) POST transition route → routes to the handler with parsed body + mapped command.
  it('routes a POST transition to the handler with the mapped command and parsed body', async () => {
    const executor = new RecordingExecutor();
    const base = await start(executor);
    const res = await fetch(`${base}/v1/affiliation/applications/app-1/transitions/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls[0]!.command).toBe('submitAffiliationApplication');
    expect(executor.calls[0]!.request.tenantId).toBe('tenant-1');
  });

  // (4) applicationId is extracted (and percent-decoded) from the URL.
  it('extracts and decodes applicationId from the URL path', async () => {
    const executor = new RecordingExecutor();
    const base = await start(executor);
    await fetch(`${base}/v1/affiliation/applications/app%20x/transitions/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(executor.calls[0]!.request.applicationId).toBe('app x');
  });

  // (5) action segment maps to the corresponding domain command.
  it('maps the action segment to the domain command', async () => {
    const executor = new RecordingExecutor();
    const base = await start(executor);
    await fetch(`${base}/v1/affiliation/applications/app-1/transitions/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(executor.calls[0]!.command).toBe('approveAffiliationApplication');
  });

  // (7) Invalid JSON → 400, handler not invoked.
  it('returns 400 for an invalid JSON body', async () => {
    const executor = new RecordingExecutor();
    const base = await start(executor);
    const res = await fetch(`${base}/v1/affiliation/applications/app-1/transitions/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not valid json',
    });
    expect(res.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  // (8) Body over the size cap → 400 (documented equivalent), handler not invoked.
  it('rejects a body over the size cap with 400', async () => {
    const executor = new RecordingExecutor();
    const base = await start(executor, 50);
    const res = await fetch(`${base}/v1/affiliation/applications/app-1/transitions/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantId: 'x'.repeat(200) }),
    });
    expect(res.status).toBe(400);
    expect(executor.calls).toHaveLength(0);
  });

  // (9) Unknown route → 404 JSON.
  it('returns 404 for an unknown route', async () => {
    const base = await start(new RecordingExecutor());
    const res = await fetch(`${base}/v1/affiliation/not-a-route`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['code']).toBe('NOT_FOUND');
  });

  // (10) Unsupported method on a transition route → 405 with an Allow header.
  it('returns 405 with an Allow header for an unsupported method', async () => {
    const base = await start(new RecordingExecutor());
    const res = await fetch(`${base}/v1/affiliation/applications/app-1/transitions/submit`, {
      method: 'PUT',
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  // (11)(12) Internal handler error → opaque 500 JSON, no internal/SQL leakage.
  it('catches handler errors and returns an opaque 500 without leaking internals', async () => {
    const base = await start(new ThrowingExecutor());
    const res = await fetch(`${base}/v1/affiliation/applications/app-1/transitions/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const text = await res.text();
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain('secret_column');
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body['code']).toBe('INTERNAL');
    expect(body['message']).toBe('Internal server error.');
  });
});
