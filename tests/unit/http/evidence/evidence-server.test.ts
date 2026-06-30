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
import { InMemoryEvidenceStorage } from '../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../../src/governance/evidence/GovernanceEvidenceService.js';
import { NoopEvidenceMalwareScanner } from '../../../../src/governance/evidence/scanning/index.js';
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

async function start(evidence?: EvidenceHttpDeps): Promise<string> {
  const server = createAffiliationHttpServer({
    executor: new RecordingExecutor(),
    ...(evidence !== undefined ? { evidence } : {}),
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

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
