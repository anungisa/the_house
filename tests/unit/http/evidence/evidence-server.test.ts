import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Buffer } from 'node:buffer';

import { createAffiliationHttpServer } from '../../../../src/http/server.js';
import type { AffiliationCommandExecutor } from '../../../../src/http/AffiliationHttpAdapter.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from '../../../../src/domains/affiliation/AffiliationApplicationDtos.js';
import type { EvidenceHttpDeps } from '../../../../src/http/evidence/EvidenceHttpAdapter.js';
import type { EvidenceQuarantineHttpDeps } from '../../../../src/http/evidence/EvidenceQuarantineHttpAdapter.js';
import { InMemoryEvidenceStorage } from '../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../../src/governance/evidence/GovernanceEvidenceService.js';
import { NoopEvidenceMalwareScanner } from '../../../../src/governance/evidence/scanning/index.js';
import { EvidenceQuarantineService } from '../../../../src/governance/evidence/quarantine/EvidenceQuarantineService.js';
import { InMemoryEvidenceQuarantineStore } from '../../../../src/governance/evidence/quarantine/InMemoryEvidenceQuarantineStore.js';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

const { fetch } = globalThis;

/**
 * Transport tests for the evidence endpoints wired into the native HTTP server. They drive
 * raw-bytes upload and binary download over a short-lived ephemeral loopback listener using
 * a real in-memory evidence storage. NO database, NO Docker, NO real Azure are involved.
 */

class RecordingExecutor implements AffiliationCommandExecutor {
  public readonly calls: { command: string; request: AffiliationApplicationTransitionRequest }[] = [];
  executeCommand(
    command: string,
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    this.calls.push({ command, request });
    return Promise.resolve({
      status: 'executed',
      applicationId: 'app-1',
      fromState: 'draft',
      toState: 'submitted',
      transitionId: 'st-1',
      auditEventId: 'au-1',
    });
  }
}

function buildEvidence(maxUploadBytes = 1024): EvidenceHttpDeps {
  const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
  return {
    uploadService: new GovernanceEvidenceService(storage),
    storage,
    maxUploadBytes,
    scanner: new NoopEvidenceMalwareScanner({ clock: fixedClock(0) }),
    scanRequired: false,
  };
}

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
  evidence?: EvidenceHttpDeps,
  evidenceQuarantine?: EvidenceQuarantineHttpDeps,
): Promise<string> {
  const server = createAffiliationHttpServer({
    executor: new RecordingExecutor(),
    ...(evidence !== undefined ? { evidence } : {}),
    ...(evidenceQuarantine !== undefined ? { evidenceQuarantine } : {}),
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

/** Build an in-memory quarantine transport plus its backing service (for seeding events). */
function buildQuarantine(): {
  deps: EvidenceQuarantineHttpDeps;
  service: EvidenceQuarantineService;
} {
  let n = 0;
  const store = new InMemoryEvidenceQuarantineStore(new InMemoryOutboxStore());
  const service = new EvidenceQuarantineService(store, {
    generateId: { newId: () => `q-${++n}` },
    maxRetries: 5,
  });
  return { deps: { reviewer: service }, service };
}

/** Seed one blocked-upload quarantine event (status `recorded`) and return its id. */
async function seedQuarantine(service: EvidenceQuarantineService): Promise<string> {
  const result = await service.recordBlockedUpload({
    tenantId: 'tenant-a',
    sourceFilename: 'evil.pdf',
    contentType: 'application/pdf',
    sizeBytes: 4242,
    contentHash: 'deadbeef',
    scanStatus: 'infected',
    scanner: 'signature',
    threatName: 'EICAR-Test-File',
    reason: 'matched test signature',
    uploadActorUserId: 'member-42',
    requestId: 'req-seed',
  });
  return result.quarantineEventId;
}

/** Security-operator identity: read + disposition permissions, tenant-a. */
const SECURITY_HEADERS: Record<string, string> = {
  'x-house-tenant-id': 'tenant-a',
  'x-house-actor-user-id': 'sec-op-1',
  'x-house-actor-permission-keys': 'evidence.quarantine.read,evidence.quarantine.disposition',
};

const ID_HEADERS = {
  'x-house-tenant-id': 'tenant-a',
  'x-house-actor-user-id': 'user-1',
};

describe('evidence HTTP server transport', () => {
  // Upload raw bytes then download them back through the server (round-trip).
  it('uploads raw bytes and downloads them back unchanged', async () => {
    const base = await start(buildEvidence());
    const payload = 'document-bytes-1234';

    const up = await fetch(`${base}/v1/evidence/objects`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'text/plain' },
      body: payload,
    });
    expect(up.status).toBe(201);
    const upBody = (await up.json()) as Record<string, unknown>;
    expect(upBody['status']).toBe('stored');
    const evidenceObjectId = String(upBody['evidenceObjectId']);
    const storageRef = String(upBody['storageRef']);

    const down = await fetch(`${base}/v1/evidence/objects/read`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ evidenceObjectId, storageRef }),
    });
    expect(down.status).toBe(200);
    expect(down.headers.get('content-type')).toBe('text/plain');
    const bytes = Buffer.from(await down.arrayBuffer());
    expect(bytes.toString('utf8')).toBe(payload);
  });

  // The server enforces the upload size cap for raw bodies.
  it('rejects an upload larger than the configured cap', async () => {
    const base = await start(buildEvidence(4));
    const res = await fetch(`${base}/v1/evidence/objects`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'text/plain' },
      body: 'way-too-large',
    });
    expect(res.status).toBe(400);
  });

  // (14) Affiliation routes still work when evidence is wired alongside them.
  it('still serves affiliation transitions when evidence is wired', async () => {
    const base = await start(buildEvidence());
    const res = await fetch(`${base}/v1/affiliation/applications/app-1/transitions/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'tenant-1',
        actor: { userId: 'user-1', roleKeys: ['reviewer'] },
        idempotencyKey: 'k1',
      }),
    });
    expect(res.status).toBe(200);
  });

  // Evidence routes 404 when evidence transport is not wired.
  it('returns 404 for evidence routes when evidence is not configured', async () => {
    const base = await start();
    const res = await fetch(`${base}/v1/evidence/objects`, {
      method: 'POST',
      headers: { ...ID_HEADERS, 'content-type': 'text/plain' },
      body: 'x',
    });
    expect(res.status).toBe(404);
  });

  // Non-POST on an evidence route → 405.
  it('returns 405 for a non-POST evidence request', async () => {
    const base = await start(buildEvidence());
    const res = await fetch(`${base}/v1/evidence/objects`, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});

/**
 * Server-transport negative-path coverage for the evidence QUARANTINE review routes (list, detail,
 * disposition). These drive the `handleEvidenceQuarantineRoute` dispatcher — previously exercised
 * only at the adapter level — through the real HTTP server to lock in method gating, malformed-body
 * handling, and the not-wired 404 fall-through. Quarantine is operational-security metadata: no
 * bytes, no governed evidence, no kernel.
 */
describe('evidence quarantine HTTP server transport (negative paths)', () => {
  it('serves GET /v1/evidence/quarantine (list) when wired', async () => {
    const { deps, service } = buildQuarantine();
    await seedQuarantine(service);
    const base = await start(undefined, deps);
    const res = await fetch(`${base}/v1/evidence/quarantine`, { headers: SECURITY_HEADERS });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items.length).toBe(1);
  });

  it('serves GET /v1/evidence/quarantine/:id (detail) when wired', async () => {
    const { deps, service } = buildQuarantine();
    const id = await seedQuarantine(service);
    const base = await start(undefined, deps);
    const res = await fetch(`${base}/v1/evidence/quarantine/${id}`, { headers: SECURITY_HEADERS });
    expect(res.status).toBe(200);
  });

  it('records a disposition via POST /v1/evidence/quarantine/:id/disposition', async () => {
    const { deps, service } = buildQuarantine();
    const id = await seedQuarantine(service);
    const base = await start(undefined, deps);
    const res = await fetch(`${base}/v1/evidence/quarantine/${id}/disposition`, {
      method: 'POST',
      headers: { ...SECURITY_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ disposition: 'reviewed' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 405 with Allow: GET for a non-GET method on the quarantine list route', async () => {
    const { deps } = buildQuarantine();
    const base = await start(undefined, deps);
    const res = await fetch(`${base}/v1/evidence/quarantine`, {
      method: 'DELETE',
      headers: SECURITY_HEADERS,
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 405 with Allow: GET for a non-GET method on the quarantine detail route', async () => {
    const { deps, service } = buildQuarantine();
    const id = await seedQuarantine(service);
    const base = await start(undefined, deps);
    const res = await fetch(`${base}/v1/evidence/quarantine/${id}`, {
      method: 'DELETE',
      headers: SECURITY_HEADERS,
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('returns 405 with Allow: POST for a non-POST method on the disposition route', async () => {
    const { deps, service } = buildQuarantine();
    const id = await seedQuarantine(service);
    const base = await start(undefined, deps);
    const res = await fetch(`${base}/v1/evidence/quarantine/${id}/disposition`, {
      method: 'GET',
      headers: SECURITY_HEADERS,
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('returns 400 for a malformed JSON body on the disposition route', async () => {
    const { deps, service } = buildQuarantine();
    const id = await seedQuarantine(service);
    const base = await start(undefined, deps);
    const res = await fetch(`${base}/v1/evidence/quarantine/${id}/disposition`, {
      method: 'POST',
      headers: { ...SECURITY_HEADERS, 'content-type': 'application/json' },
      body: '{not valid json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('error');
  });

  it('returns 404 for quarantine routes when the quarantine transport is not wired', async () => {
    const base = await start(buildEvidence());
    const res = await fetch(`${base}/v1/evidence/quarantine`, { headers: SECURITY_HEADERS });
    expect(res.status).toBe(404);
  });
});
