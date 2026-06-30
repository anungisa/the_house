/**
 * Evidence quarantine service.
 *
 * Turns a blocked malware-scan outcome into an auditable security event: it records sanitized
 * quarantine METADATA and enqueues an `evidence.quarantine.recorded` outbox event, atomically,
 * through the {@link EvidenceQuarantineStore}. It is the single seam the evidence upload path
 * calls when the ingestion gate rejects an upload.
 *
 * STRICT SCOPE — this service does NOT:
 *  - store raw payload bytes (no byte parameter exists);
 *  - write governance.evidence_object (only the Governance Kernel creates governed evidence);
 *  - mutate governance.entity_state;
 *  - approve/reject an application or execute a workflow;
 *  - call GovernanceKernel.transition().
 *
 * The quarantine event id is generated here so the stored row id and the outbox dedupe key are
 * stable and correlated (`evidence.quarantine.recorded:<quarantineEventId>`), giving idempotent
 * enqueue if the same event is recorded twice.
 */

import { uuidGenerator, type IdGenerator } from '../../../shared/uuid/id.js';
import type { OutboxEnqueueInput } from '../../outbox/OutboxStore.js';
import type { EvidenceQuarantineStore } from './EvidenceQuarantineStore.js';
import {
  EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE,
  type EvidenceQuarantineRecord,
  type EvidenceQuarantineRecordedPayload,
  type QuarantineScanStatus,
} from './EvidenceQuarantineTypes.js';

/** Default outbox max retries for a quarantine event (mirrors the governance outbox default). */
const DEFAULT_QUARANTINE_MAX_RETRIES = 10;

/** Input describing a blocked upload to quarantine. NEVER carries the raw payload bytes. */
export interface RecordBlockedUploadInput {
  readonly tenantId: string;
  readonly evidenceObjectId?: string;
  readonly sourceFilename?: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** SHA-256 hex digest of the rejected payload (no bytes are retained). */
  readonly contentHash: string;
  readonly scanStatus: QuarantineScanStatus;
  readonly scanner: string;
  readonly signatureVersion?: string;
  readonly threatName?: string;
  readonly reason?: string;
  readonly uploadActorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Narrow result of recording a blocked upload (the caller only needs the event id). */
export interface RecordBlockedUploadResult {
  readonly quarantineEventId: string;
}

/**
 * The narrow capability the evidence upload path depends on. Keeping this an interface lets
 * the HTTP adapter depend on a minimal port (and be tested with a fake) without importing the
 * whole service/store graph.
 */
export interface EvidenceQuarantineRecorder {
  recordBlockedUpload(input: RecordBlockedUploadInput): Promise<RecordBlockedUploadResult>;
}

export interface EvidenceQuarantineServiceDeps {
  readonly generateId?: IdGenerator;
  /** Outbox max retries applied to the emitted event (defaults to 10). */
  readonly maxRetries?: number;
}

export class EvidenceQuarantineService implements EvidenceQuarantineRecorder {
  private readonly generateId: IdGenerator;
  private readonly maxRetries: number;

  constructor(
    private readonly store: EvidenceQuarantineStore,
    deps: EvidenceQuarantineServiceDeps = {},
  ) {
    this.generateId = deps.generateId ?? uuidGenerator;
    this.maxRetries = deps.maxRetries ?? DEFAULT_QUARANTINE_MAX_RETRIES;
  }

  async recordBlockedUpload(input: RecordBlockedUploadInput): Promise<RecordBlockedUploadResult> {
    const quarantineEventId = this.generateId.newId();

    const record: EvidenceQuarantineRecord = {
      quarantineEventId,
      tenantId: input.tenantId,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      contentHash: input.contentHash,
      scanStatus: input.scanStatus,
      scanner: input.scanner,
      ...(input.evidenceObjectId !== undefined ? { evidenceObjectId: input.evidenceObjectId } : {}),
      ...(input.sourceFilename !== undefined ? { sourceFilename: input.sourceFilename } : {}),
      ...(input.signatureVersion !== undefined ? { signatureVersion: input.signatureVersion } : {}),
      ...(input.threatName !== undefined ? { threatName: input.threatName } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.uploadActorUserId !== undefined
        ? { uploadActorUserId: input.uploadActorUserId }
        : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    };

    const payload = {
      quarantineEventId,
      tenantId: input.tenantId,
      contentHash: input.contentHash,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      scanStatus: input.scanStatus,
      scanner: input.scanner,
      ...(input.evidenceObjectId !== undefined ? { evidenceObjectId: input.evidenceObjectId } : {}),
      ...(input.threatName !== undefined ? { threatName: input.threatName } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    } satisfies EvidenceQuarantineRecordedPayload;

    const outbox: OutboxEnqueueInput = {
      tenantId: input.tenantId,
      messageType: EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE,
      payload,
      dedupeKey: `${EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE}:${quarantineEventId}`,
      maxRetries: this.maxRetries,
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    };

    const result = await this.store.record(record, outbox);
    return { quarantineEventId: result.quarantineEventId };
  }
}
