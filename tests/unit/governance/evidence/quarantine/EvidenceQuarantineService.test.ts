import { describe, expect, it } from 'vitest';
import { InMemoryOutboxStore } from '../../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryEvidenceQuarantineStore } from '../../../../../src/governance/evidence/quarantine/InMemoryEvidenceQuarantineStore.js';
import { EvidenceQuarantineService } from '../../../../../src/governance/evidence/quarantine/EvidenceQuarantineService.js';
import { EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE } from '../../../../../src/governance/evidence/quarantine/EvidenceQuarantineTypes.js';
import type { IdGenerator } from '../../../../../src/shared/uuid/id.js';

/**
 * Unit tests for {@link EvidenceQuarantineService}. Fully hermetic: an in-memory outbox + an
 * in-memory quarantine store, a deterministic id generator. No DB, Azure, AV, or Entra.
 *
 * The service turns a blocked malware-scan outcome into a sanitized security event + an outbox
 * event. It NEVER receives raw bytes (there is no byte parameter), never writes governed state,
 * and never executes a transition.
 */

const TENANT = '11111111-1111-1111-1111-111111111111';

function fixedIds(...ids: readonly string[]): IdGenerator {
  let i = 0;
  return { newId: () => ids[i++] ?? `extra-${i}` };
}

function buildService(idGen: IdGenerator): {
  service: EvidenceQuarantineService;
  outbox: InMemoryOutboxStore;
  store: InMemoryEvidenceQuarantineStore;
} {
  const outbox = new InMemoryOutboxStore();
  const store = new InMemoryEvidenceQuarantineStore(outbox);
  const service = new EvidenceQuarantineService(store, { generateId: idGen, maxRetries: 7 });
  return { service, outbox, store };
}

describe('EvidenceQuarantineService', () => {
  it('records sanitized metadata and emits a single outbox event for an infected upload', async () => {
    const { service, outbox, store } = buildService(fixedIds('q-1'));

    const result = await service.recordBlockedUpload({
      tenantId: TENANT,
      contentType: 'application/pdf',
      sizeBytes: 1234,
      contentHash: 'abc123',
      scanStatus: 'infected',
      scanner: 'signature',
      threatName: 'EICAR-Test-File',
      reason: 'matched test signature',
      uploadActorUserId: 'user-9',
      requestId: 'req-1',
      correlationId: 'corr-1',
    });

    expect(result.quarantineEventId).toBe('q-1');

    const events = store.list();
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.tenantId).toBe(TENANT);
    expect(event.contentHash).toBe('abc123');
    expect(event.contentType).toBe('application/pdf');
    expect(event.sizeBytes).toBe(1234);
    expect(event.scanner).toBe('signature');
    expect(event.scanStatus).toBe('infected');
    expect(event.threatName).toBe('EICAR-Test-File');
    expect(event.quarantineStatus).toBe('recorded');

    expect(outbox.records).toHaveLength(1);
    const msg = outbox.records[0]!;
    expect(msg.messageType).toBe(EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE);
    expect(msg.dedupeKey).toBe(`${EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE}:q-1`);
    expect(msg.maxRetries).toBe(7);
    expect(msg.correlationId).toBe('corr-1');
  });

  it('never stores raw bytes: the record + payload carry only a hash and sanitized metadata', async () => {
    const { service, outbox, store } = buildService(fixedIds('q-2'));

    await service.recordBlockedUpload({
      tenantId: TENANT,
      contentType: 'application/octet-stream',
      sizeBytes: 42,
      contentHash: 'deadbeef',
      scanStatus: 'infected',
      scanner: 'signature',
    });

    const serializedEvent = JSON.stringify(store.list()[0]);
    const serializedPayload = JSON.stringify(outbox.records[0]!.payload);
    // No byte-bearing fields anywhere.
    for (const blob of [serializedEvent, serializedPayload]) {
      expect(blob).not.toContain('content"');
      expect(blob).not.toContain('bytes"');
      expect(blob).not.toContain('payloadBytes');
      expect(blob).not.toContain('data"');
    }
    // The hash IS present (proves we keep a digest, not the bytes).
    expect(serializedEvent).toContain('deadbeef');
    expect(serializedPayload).toContain('deadbeef');
  });

  it('outbox payload excludes the actor user id and upload headers (defence-in-depth)', async () => {
    const { service, outbox } = buildService(fixedIds('q-3'));

    await service.recordBlockedUpload({
      tenantId: TENANT,
      contentType: 'application/pdf',
      sizeBytes: 10,
      contentHash: 'hh',
      scanStatus: 'infected',
      scanner: 'signature',
      uploadActorUserId: 'secret-user',
      sourceFilename: 'malware.pdf',
    });

    const payload = JSON.stringify(outbox.records[0]!.payload);
    expect(payload).not.toContain('secret-user');
    expect(payload).not.toContain('uploadActorUserId');
    expect(payload).not.toContain('malware.pdf');
    expect(payload).not.toContain('sourceFilename');
  });

  it('records error/skipped statuses (required-scan rejections) the same sanitized way', async () => {
    const { service, store } = buildService(fixedIds('q-4', 'q-5'));

    await service.recordBlockedUpload({
      tenantId: TENANT,
      contentType: 'application/pdf',
      sizeBytes: 1,
      contentHash: 'h1',
      scanStatus: 'error',
      scanner: 'signature',
    });
    await service.recordBlockedUpload({
      tenantId: TENANT,
      contentType: 'application/pdf',
      sizeBytes: 1,
      contentHash: 'h2',
      scanStatus: 'skipped',
      scanner: 'noop',
    });

    expect(store.list().map((e) => e.scanStatus)).toEqual(['error', 'skipped']);
  });
});
