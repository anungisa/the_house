import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';

import {
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
import type {
  EvidenceQuarantineRecorder,
  RecordBlockedUploadInput,
  RecordBlockedUploadResult,
} from '../../../../src/governance/evidence/quarantine/index.js';
import { DemoAuthContextResolver } from '../../../../src/http/auth/DemoAuthContextResolver.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';

/**
 * Upload-path tests for the asynchronous EVIDENCE QUARANTINE workflow.
 *
 * When the malware-scan gate BLOCKS an upload, the adapter records a sanitized quarantine
 * security event (metadata + content hash only — never the bytes) and the quarantine service
 * emits an outbox event. These tests use the deterministic local signature scanner and
 * synthetic scanner/quarantine stubs — NO antivirus engine, process, network, DB, or Azure.
 *
 * Quarantine never approves/rejects a lifecycle transition or mutates governed state: the
 * upload is still rejected with its original status code.
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

/** Capturing fake quarantine recorder (records inputs; never receives bytes). */
class CapturingQuarantine implements EvidenceQuarantineRecorder {
  readonly inputs: RecordBlockedUploadInput[] = [];
  constructor(private readonly eventId = 'quar-1') {}
  recordBlockedUpload(input: RecordBlockedUploadInput): Promise<RecordBlockedUploadResult> {
    this.inputs.push(input);
    return Promise.resolve({ quarantineEventId: this.eventId });
  }
}

/** A recorder that always fails — proves a quarantine failure never accepts the upload. */
class FailingQuarantine implements EvidenceQuarantineRecorder {
  recordBlockedUpload(): Promise<RecordBlockedUploadResult> {
    return Promise.reject(new Error('quarantine store unavailable'));
  }
}

function buildDeps(
  scanner: EvidenceMalwareScanner,
  scanRequired: boolean,
  quarantine?: EvidenceQuarantineRecorder,
  includeQuarantineEventIdInResponse = true,
) {
  const storage = new InMemoryEvidenceStorage({ clock: fixedClock(0) });
  const inner = new GovernanceEvidenceService(storage);
  let storeCalls = 0;
  const uploadService: EvidenceUploadService = {
    storeEvidencePayload: (i) => {
      storeCalls += 1;
      return inner.storeEvidencePayload(i);
    },
  };
  const deps: EvidenceHttpDeps = {
    uploadService,
    storage,
    maxUploadBytes: 1024,
    scanner,
    scanRequired,
    ...(quarantine !== undefined ? { quarantine, includeQuarantineEventIdInResponse } : {}),
  };
  return { deps, storage, storeCalls: () => storeCalls };
}

const signatureScanner = (): EvidenceMalwareScanner =>
  createEvidenceMalwareScanner(
    { mode: 'signature', required: false, testSignaturesEnabled: true },
    { clock: fixedClock(0) },
  );

const fixedScanner = (status: 'error' | 'skipped'): EvidenceMalwareScanner => ({
  name: status === 'skipped' ? 'noop' : 'signature',
  scan: () =>
    Promise.resolve({
      status,
      scanner: status === 'skipped' ? 'noop' : 'signature',
      scannedAt: new Date(0).toISOString(),
    }),
});

const infectedPayload = (prefix = 'doc '): Buffer =>
  Buffer.concat([Buffer.from(prefix), Buffer.from(EICAR_TEST_SIGNATURE.pattern)]);

describe('evidence upload — quarantine workflow', () => {
  it('quarantines an infected upload: records sanitized metadata, rejects 422, never stores', async () => {
    const quarantine = new CapturingQuarantine();
    const { deps, storeCalls } = buildDeps(signatureScanner(), false, quarantine);

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: infectedPayload() },
      'req-infected',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(422);
    expect(storeCalls()).toBe(0);

    expect(quarantine.inputs).toHaveLength(1);
    const captured = quarantine.inputs[0]!;
    expect(captured.tenantId).toBe('tenant-a');
    expect(captured.scanStatus).toBe('infected');
    expect(captured.scanner).toBe('signature');
    expect(captured.contentType).toBe('text/plain');
    expect(captured.sizeBytes).toBeGreaterThan(0);
    expect(captured.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(captured.uploadActorUserId).toBe('user-1');
    expect(captured.requestId).toBe('req-infected');
  });

  it('quarantine input never carries raw bytes (no byte-bearing fields)', async () => {
    const quarantine = new CapturingQuarantine();
    const { deps } = buildDeps(signatureScanner(), false, quarantine);

    await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: infectedPayload('TOPSECRET ') },
      'req-bytes',
      DEMO,
    );

    const captured = quarantine.inputs[0]!;
    const serialized = JSON.stringify(captured);
    // The unique payload-byte marker must never appear (the bytes are not carried).
    expect(serialized).not.toContain('TOPSECRET');
    // No byte-bearing field is present on the recorder input — only sanitized metadata.
    const record = captured as unknown as Record<string, unknown>;
    expect(record['content']).toBeUndefined();
    expect(record['bytes']).toBeUndefined();
    expect(record['data']).toBeUndefined();
    expect(record['payload']).toBeUndefined();
    // The content hash IS present (a digest, not the bytes).
    expect(captured.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('quarantines a scan-error rejection when scanning is required (503)', async () => {
    const quarantine = new CapturingQuarantine();
    const { deps, storeCalls } = buildDeps(fixedScanner('error'), true, quarantine);

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('doc') },
      'req-err',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(503);
    expect(storeCalls()).toBe(0);
    expect(quarantine.inputs).toHaveLength(1);
    expect(quarantine.inputs[0]!.scanStatus).toBe('error');
  });

  it('quarantines a skipped+required rejection (503)', async () => {
    const quarantine = new CapturingQuarantine();
    const { deps } = buildDeps(fixedScanner('skipped'), true, quarantine);

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('doc') },
      'req-skip-req',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(503);
    expect(quarantine.inputs).toHaveLength(1);
    expect(quarantine.inputs[0]!.scanStatus).toBe('skipped');
  });

  it('does NOT quarantine a skipped scan that is not required (accepted upload)', async () => {
    const quarantine = new CapturingQuarantine();
    const { deps, storeCalls } = buildDeps(fixedScanner('skipped'), false, quarantine);

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('doc') },
      'req-skip-ok',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(201);
    expect(storeCalls()).toBe(1);
    expect(quarantine.inputs).toHaveLength(0);
  });

  it('does NOT quarantine a clean upload (and still stores it)', async () => {
    const quarantine = new CapturingQuarantine();
    const { deps, storeCalls } = buildDeps(signatureScanner(), true, quarantine);

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: Buffer.from('ordinary affidavit') },
      'req-clean',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(201);
    expect(storeCalls()).toBe(1);
    expect(quarantine.inputs).toHaveLength(0);
  });

  it('includes the quarantineEventId in the rejection response when enabled', async () => {
    const quarantine = new CapturingQuarantine('quar-xyz');
    const { deps } = buildDeps(signatureScanner(), false, quarantine, true);

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: infectedPayload() },
      'req-resp-id',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(422);
    expect(result.body['quarantineEventId']).toBe('quar-xyz');
  });

  it('omits the quarantineEventId from the response when disabled', async () => {
    const quarantine = new CapturingQuarantine('quar-hidden');
    const { deps } = buildDeps(signatureScanner(), false, quarantine, false);

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: infectedPayload() },
      'req-resp-noid',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(422);
    expect(result.body['quarantineEventId']).toBeUndefined();
  });

  it('still rejects (and never accepts) when quarantine is not wired', async () => {
    const { deps, storeCalls } = buildDeps(signatureScanner(), false);

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: infectedPayload() },
      'req-no-quar',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(422);
    expect(storeCalls()).toBe(0);
    expect(result.body['quarantineEventId']).toBeUndefined();
  });

  it('a quarantine-store failure never turns a rejection into an acceptance', async () => {
    const { deps, storeCalls } = buildDeps(signatureScanner(), false, new FailingQuarantine());

    const result = await handleEvidenceUpload(
      deps,
      { headers: authHeaders(), content: infectedPayload() },
      'req-quar-fail',
      DEMO,
    );

    if (result.kind !== 'json') throw new Error('expected json');
    expect(result.status).toBe(422);
    expect(result.body['code']).toBe('EVIDENCE_MALWARE_DETECTED');
    expect(storeCalls()).toBe(0);
    // No event id surfaced because recording failed.
    expect(result.body['quarantineEventId']).toBeUndefined();
  });
});
