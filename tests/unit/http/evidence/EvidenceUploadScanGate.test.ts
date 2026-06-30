import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  handleEvidenceDownload,
  handleEvidenceUpload,
  type EvidenceHttpDeps,
  type EvidenceUploadService,
} from '../../../../src/http/evidence/EvidenceHttpAdapter.js';
import { InMemoryEvidenceStorage } from '../../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../../src/governance/evidence/GovernanceEvidenceService.js';
import {
  createEvidenceMalwareScanner,
  EICAR_TEST_SIGNATURE,
  type EvidenceMalwareScanner,
} from '../../../../src/governance/evidence/scanning/index.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

/**
 * Upload-enforcement tests for the malware scanning gate wired into the evidence HTTP adapter.
 *
 * The gate runs BEFORE the payload reaches evidence storage. These tests use the deterministic
 * local signature scanner (with the harmless EICAR test signature) and synthetic scanner
 * stubs — NO real antivirus engine, NO external process, NO network, NO database, NO Azure.
 */

const DEMO = new DemoAuthContextResolver();

function authHeaders(extra: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    'x-house-tenant-id': 'tenant-a',
    'x-house-actor-user-id': 'user-1',
    'x-house-actor-role-keys': 'records_officer',
    'content-type': 'text/plain',
    ...extra,
  };
}

/** Build adapter deps with a chosen scanner and required flag, tracking storage calls. */
function buildDeps(scanner: EvidenceMalwareScanner, scanRequired: boolean) {
  const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
  const inner = new GovernanceEvidenceService(storage);
  let storeCalls = 0;
  const uploadService: EvidenceUploadService = {
    storeEvidencePayload: (i) => {
      storeCalls += 1;
      return inner.storeEvidencePayload(i);
    },
  };
  const deps: EvidenceHttpDeps = { uploadService, storage, maxUploadBytes: 1024, scanner, scanRequired };
  return { deps, storage, storeCalls: () => storeCalls };
}

const signatureScanner = (testSignaturesEnabled: boolean): EvidenceMalwareScanner =>
  createEvidenceMalwareScanner(
    { mode: 'signature', required: false, testSignaturesEnabled },
    { clock: fixedClock(0) },
  );

const fixedScanner = (status: 'error' | 'skipped'): EvidenceMalwareScanner => ({
  name: status === 'skipped' ? 'noop' : 'signature',
  scan: () => Promise.resolve({ status, scanner: status === 'skipped' ? 'noop' : 'signature', scannedAt: new Date(0).toISOString() }),
});

describe('evidence upload — malware scanning gate', () => {
  // (7) A clean scan stores the bytes and returns 201.
  it('stores the payload when the scan is clean', async () => {
    const { deps, storeCalls } = buildDeps(signatureScanner(true), true);
    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('ordinary affidavit') },
      'req-clean',
      DEMO,
    );
    expect(result.kind).toBe('json');
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(201);
    expect(result.body['status']).toBe('stored');
    expect(storeCalls()).toBe(1);
  });

  // (13) The upload response includes sanitized malwareScan metadata.
  it('attaches malwareScan metadata to a stored upload response', async () => {
    const { deps } = buildDeps(signatureScanner(true), false);
    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('ordinary affidavit') },
      'req-meta',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    const scan = result.body['malwareScan'] as Record<string, unknown>;
    expect(scan).toMatchObject({ status: 'clean', scanner: 'signature' });
    expect(typeof scan['scannedAt']).toBe('string');
    // Sanitized metadata only — never a threat name or reason on a success response.
    expect(scan['threatName']).toBeUndefined();
    expect(scan['reason']).toBeUndefined();
  });

  // (8)(9) An infected payload is rejected (422) and never reaches storage.
  it('rejects an infected payload and does not call the storage service', async () => {
    const { deps, storeCalls } = buildDeps(signatureScanner(true), false);
    const payload = Buffer.concat([Buffer.from('doc '), Buffer.from(EICAR_TEST_SIGNATURE.pattern)]);
    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: payload },
      'req-virus',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(422);
    expect(result.body['code']).toBe('EVIDENCE_MALWARE_DETECTED');
    expect(storeCalls()).toBe(0);
  });

  // (15) A rejected infected upload never echoes payload bytes or the threat name.
  it('does not leak payload bytes or the threat name in the rejection body', async () => {
    const { deps } = buildDeps(signatureScanner(true), false);
    const payload = Buffer.concat([Buffer.from('TOPSECRET '), Buffer.from(EICAR_TEST_SIGNATURE.pattern)]);
    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: payload },
      'req-leak',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    const serialized = JSON.stringify(result.body);
    expect(serialized).not.toContain('TOPSECRET');
    expect(serialized).not.toContain('EICAR');
  });

  // (10) Scan error + required rejects (503) and does not store.
  it('rejects on scan error when scanning is required (503) and does not store', async () => {
    const { deps, storeCalls } = buildDeps(fixedScanner('error'), true);
    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('doc') },
      'req-err',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(503);
    expect(result.body['code']).toBe('EVIDENCE_MALWARE_SCAN_FAILED');
    expect(storeCalls()).toBe(0);
  });

  // (11) Skipped + required rejects (503) and does not store.
  it('rejects a skipped scan when scanning is required (503) and does not store', async () => {
    const { deps, storeCalls } = buildDeps(fixedScanner('skipped'), true);
    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('doc') },
      'req-skip-req',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(503);
    expect(result.body['code']).toBe('EVIDENCE_MALWARE_SCAN_REQUIRED');
    expect(storeCalls()).toBe(0);
  });

  // (12) Skipped + not required stores and surfaces the skipped status.
  it('stores and surfaces skipped status when scanning is not required', async () => {
    const { deps, storeCalls } = buildDeps(fixedScanner('skipped'), false);
    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('doc') },
      'req-skip-ok',
      DEMO,
    );
    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(201);
    expect((result.body['malwareScan'] as Record<string, unknown>)['status']).toBe('skipped');
    expect(storeCalls()).toBe(1);
  });

  // (14) Download behavior is unchanged by the scanning gate (downloads are never scanned).
  it('downloads a previously stored clean payload unchanged', async () => {
    const { deps } = buildDeps(signatureScanner(true), true);
    const upload = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('downloadable evidence') },
      'req-up',
      DEMO,
    );
    if (upload.kind !== 'json') throw new Error('expected json');
    const storageRef = upload.body['storageRef'];
    const download = await handleEvidenceDownload(
      deps,
      {
        headers: authHeaders(),
        body: { evidenceObjectId: upload.body['evidenceObjectId'], storageRef },
      },
      'req-down',
      DEMO,
    );
    expect(download.kind).toBe('bytes');
    if (download.kind !== 'bytes') throw new Error('expected bytes');
    expect(Buffer.from(download.body).toString('utf8')).toBe('downloadable evidence');
  });
});
