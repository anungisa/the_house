import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import {
  handleEvidenceDownload,
  handleEvidenceUpload,
  type EvidenceHttpDeps,
  type EvidenceReadPort,
} from '../../../../src/http/evidence/EvidenceHttpAdapter.js';
import { InMemoryEvidenceStorage } from '../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../../src/governance/evidence/GovernanceEvidenceService.js';
import { NoopEvidenceMalwareScanner } from '../../../../src/governance/evidence/scanning/index.js';
import { buildEvidenceStorageKey } from '../../../../src/governance/evidence/EvidenceStorage.js';
import type { EvidenceStorageRef } from '../../../../src/governance/evidence/EvidenceMetadataBinding.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { TrustedHeadersAuthContextResolver } from '../../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

/**
 * Unit tests for the evidence HTTP adapter (src/http/evidence/EvidenceHttpAdapter.ts).
 *
 * These are protocol-pure: handlers are called directly with parsed request shapes and a
 * real in-memory evidence storage. NO database, NO Docker, and NO real Azure are required.
 * Identity is carried in the shared `x-house-*` trusted-header contract in BOTH auth modes.
 */

const DEMO = new DemoAuthContextResolver();
const TRUSTED = new TrustedHeadersAuthContextResolver();

function buildDeps(maxUploadBytes = 1024): EvidenceHttpDeps {
  const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
  return {
    uploadService: new GovernanceEvidenceService(storage),
    storage,
    maxUploadBytes,
    scanner: new NoopEvidenceMalwareScanner({ clock: fixedClock(0) }),
    scanRequired: false,
  };
}

function authHeaders(
  tenantId: string,
  extra: Record<string, string> = {},
): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': tenantId,
    'x-house-actor-user-id': 'user-1',
    'x-house-actor-role-keys': 'records_officer',
    ...extra,
  };
}

describe('evidence HTTP adapter — upload', () => {
  // (1) Demo mode resolves tenant identity from the trusted headers (binary body has none).
  it('resolves the tenant from demo auth headers and stores the payload', async () => {
    const deps = buildDeps();
    const result = await handleEvidenceUpload(
      deps,
      {
        headers: authHeaders('tenant-a', { 'content-type': 'text/plain' }),
        content: Buffer.from('hello evidence'),
      },
      'req-1',
      DEMO,
    );
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(201);
    expect(result.body['status']).toBe('stored');
    expect(String(result.body['storageKey'])).toContain('tenants/tenant-a/evidence/');
  });

  // (2) Trusted-headers mode resolves the tenant from verified headers.
  it('resolves the tenant from trusted headers', async () => {
    const deps = buildDeps();
    const result = await handleEvidenceUpload(
      deps,
      {
        headers: authHeaders('tenant-b', { 'content-type': 'application/pdf' }),
        content: Buffer.from('%PDF-1.4'),
      },
      'req-2',
      TRUSTED,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(201);
    expect(String(result.body['storageKey'])).toContain('tenants/tenant-b/evidence/');
    expect(result.body['contentType']).toBe('application/pdf');
  });

  // (3) Missing content-type → 400.
  it('rejects an upload with no content-type header', async () => {
    const deps = buildDeps();
    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders('tenant-a'), content: Buffer.from('x') },
      'req-3',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(400);
    expect(result.body['code']).toBe('INVALID_INPUT');
  });

  // (4) Empty body → 400.
  it('rejects an empty upload body', async () => {
    const deps = buildDeps();
    const result = await handleEvidenceUpload(
      deps,
      {
        headers: authHeaders('tenant-a', { 'content-type': 'text/plain' }),
        content: new Uint8Array(0),
      },
      'req-4',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(400);
  });

  // (5) Body over the configured cap → 400.
  it('rejects an upload over the maximum size', async () => {
    const deps = buildDeps(4);
    const result = await handleEvidenceUpload(
      deps,
      {
        headers: authHeaders('tenant-a', { 'content-type': 'text/plain' }),
        content: Buffer.from('too-large-body'),
      },
      'req-5',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(400);
  });

  // (1)/missing identity → 401.
  it('rejects an upload with no tenant identity', async () => {
    const deps = buildDeps();
    const result = await handleEvidenceUpload(
      deps,
      { headers: { 'content-type': 'text/plain' }, content: Buffer.from('x') },
      'req-6',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(401);
  });

  // (7) Response includes contentHash + storageRef. (8) and never the raw bytes.
  it('returns the content hash and storage reference but never the raw bytes', async () => {
    const deps = buildDeps();
    const payload = 'secret-payload-bytes';
    const result = await handleEvidenceUpload(
      deps,
      {
        headers: authHeaders('tenant-a', { 'content-type': 'text/plain' }),
        content: Buffer.from(payload),
      },
      'req-7',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    const expectedHash = createHash('sha256').update(Buffer.from(payload)).digest('hex');
    expect(result.body['contentHash']).toBe(expectedHash);
    expect(typeof result.body['storageRef']).toBe('string');
    // The payload bytes must not appear anywhere in the JSON metadata response.
    expect(JSON.stringify(result.body)).not.toContain(payload);
    expect(result.body['content']).toBeUndefined();
    expect(result.body['bytes']).toBeUndefined();
  });

  // (16) Only NSO-generic identity is required — no sport-specific fields.
  it('stores a payload using only generic tenant/actor identity', async () => {
    const deps = buildDeps();
    const result = await handleEvidenceUpload(
      deps,
      {
        headers: {
          'x-house-tenant-id': 'tenant-a',
          'x-house-actor-user-id': 'user-1',
          'content-type': 'text/plain',
        },
        content: Buffer.from('generic'),
      },
      'req-8',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(201);
  });
});

describe('evidence HTTP adapter — download', () => {
  async function upload(deps: EvidenceHttpDeps, tenantId: string, payload: string) {
    const result = await handleEvidenceUpload(
      deps,
      {
        headers: authHeaders(tenantId, { 'content-type': 'text/plain' }),
        content: Buffer.from(payload),
      },
      'up',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    return {
      evidenceObjectId: String(result.body['evidenceObjectId']),
      storageRef: String(result.body['storageRef']),
    };
  }

  // (6)(9)(11) Round-trip: download parses the storageRef and returns the stored bytes + type.
  it('returns the stored bytes and content-type for a valid storageRef', async () => {
    const deps = buildDeps();
    const { evidenceObjectId, storageRef } = await upload(deps, 'tenant-a', 'round-trip-bytes');
    const result = await handleEvidenceDownload(
      deps,
      { headers: authHeaders('tenant-a'), body: { evidenceObjectId, storageRef } },
      'dl-1',
      DEMO,
    );
    expect(result.kind).toBe('bytes');
    if (result.kind !== 'bytes') throw new Error('expected bytes');
    expect(result.status).toBe(200);
    expect(result.contentType).toBe('text/plain');
    expect(Buffer.from(result.body).toString('utf8')).toBe('round-trip-bytes');
  });

  // (10) A storageRef from another tenant is rejected with 403.
  it('rejects a download whose storageRef belongs to a different tenant', async () => {
    const deps = buildDeps();
    const { evidenceObjectId, storageRef } = await upload(deps, 'tenant-a', 'cross-tenant');
    const result = await handleEvidenceDownload(
      deps,
      { headers: authHeaders('tenant-b'), body: { evidenceObjectId, storageRef } },
      'dl-2',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(403);
    expect(result.body['code']).toBe('FORBIDDEN');
  });

  // Missing fields → 400.
  it('rejects a download missing evidenceObjectId or storageRef', async () => {
    const deps = buildDeps();
    const result = await handleEvidenceDownload(
      deps,
      { headers: authHeaders('tenant-a'), body: { storageRef: 'x' } },
      'dl-3',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(400);
  });

  // (12) A well-formed ref for an object that was never stored → 404.
  it('returns 404 for a storage reference with no stored object', async () => {
    const deps = buildDeps();
    const sha = createHash('sha256').update(Buffer.from('never-stored')).digest('hex');
    const evidenceObjectId = 'obj-missing';
    const ref: EvidenceStorageRef = {
      provider: 'memory',
      container: 'memory',
      key: buildEvidenceStorageKey('tenant-a', evidenceObjectId, sha),
      contentType: 'text/plain',
      sizeBytes: 11,
      sha256: sha,
    };
    const result = await handleEvidenceDownload(
      deps,
      { headers: authHeaders('tenant-a'), body: { evidenceObjectId, storageRef: JSON.stringify(ref) } },
      'dl-4',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(404);
    expect(result.body['code']).toBe('EVIDENCE_NOT_FOUND');
  });

  // (13) A raw internal storage failure is never exposed across the boundary.
  it('does not expose internal storage errors on download', async () => {
    const sha = createHash('sha256').update(Buffer.from('boom')).digest('hex');
    const evidenceObjectId = 'obj-boom';
    const throwingStorage: EvidenceReadPort = {
      provider: 'memory',
      getEvidenceObject: () =>
        Promise.reject(new Error('SELECT secret_column FROM users WHERE token = $1')),
    };
    const deps: EvidenceHttpDeps = {
      uploadService: new GovernanceEvidenceService(new InMemoryEvidenceStorage({ clock: fixedClock(0) })),
      storage: throwingStorage,
      maxUploadBytes: 1024,
      scanner: new NoopEvidenceMalwareScanner({ clock: fixedClock(0) }),
      scanRequired: false,
    };
    const ref: EvidenceStorageRef = {
      provider: 'memory',
      container: 'memory',
      key: buildEvidenceStorageKey('tenant-a', evidenceObjectId, sha),
      contentType: 'text/plain',
      sizeBytes: 4,
      sha256: sha,
    };
    const result = await handleEvidenceDownload(
      deps,
      { headers: authHeaders('tenant-a'), body: { evidenceObjectId, storageRef: JSON.stringify(ref) } },
      'dl-5',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(500);
    expect(result.body['code']).toBe('INTERNAL');
    expect(result.body['message']).toBe('Internal server error.');
    expect(JSON.stringify(result.body)).not.toContain('secret_column');
  });
});
