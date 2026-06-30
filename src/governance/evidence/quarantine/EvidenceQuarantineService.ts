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
import { AppError, ErrorCode } from '../../../shared/errors/AppError.js';
import type { OutboxEnqueueInput } from '../../outbox/OutboxStore.js';
import type { EvidenceQuarantineStore } from './EvidenceQuarantineStore.js';
import {
  EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE,
  QUARANTINE_DISPOSITIONS,
  type EvidenceQuarantineRecord,
  type EvidenceQuarantineRecordedPayload,
  type QuarantineDisposition,
  type QuarantineEventView,
  type QuarantineListFilter,
  type QuarantineListResult,
  type QuarantineScanStatus,
  type QuarantineStatus,
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

/** Input for an operator disposition (reviewed/released/discarded) of a quarantine event. */
export interface RecordQuarantineDispositionInput {
  readonly tenantId: string;
  readonly quarantineEventId: string;
  readonly disposition: QuarantineDisposition;
  /** The security operator recording the disposition (never the uploader). */
  readonly actorUserId: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Result of a successful operator disposition. */
export interface RecordQuarantineDispositionResult {
  readonly quarantineEventId: string;
  readonly previousStatus: QuarantineStatus;
  readonly newStatus: QuarantineStatus;
}

/**
 * The operator REVIEW capability the quarantine HTTP adapter depends on: list/read quarantine
 * events and record a disposition. Read-only except for the disposition, which advances the
 * event's operational status and emits an outbox event — it NEVER stores bytes, creates governed
 * evidence, mutates governed lifecycle state, or calls the kernel.
 */
export interface EvidenceQuarantineReviewer {
  listQuarantineEvents(tenantId: string, filter: QuarantineListFilter): Promise<QuarantineListResult>;
  getQuarantineEvent(
    tenantId: string,
    quarantineEventId: string,
  ): Promise<QuarantineEventView | undefined>;
  recordQuarantineDisposition(
    input: RecordQuarantineDispositionInput,
  ): Promise<RecordQuarantineDispositionResult>;
}

export interface EvidenceQuarantineServiceDeps {
  readonly generateId?: IdGenerator;
  /** Outbox max retries applied to the emitted event (defaults to 10). */
  readonly maxRetries?: number;
}

export class EvidenceQuarantineService
  implements EvidenceQuarantineRecorder, EvidenceQuarantineReviewer
{
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

  /** List quarantine events for a tenant (read-only, filtered + keyset-paginated). */
  listQuarantineEvents(
    tenantId: string,
    filter: QuarantineListFilter,
  ): Promise<QuarantineListResult> {
    return this.store.list(tenantId, filter);
  }

  /** Read a single quarantine event for a tenant; resolves undefined when it does not exist. */
  getQuarantineEvent(
    tenantId: string,
    quarantineEventId: string,
  ): Promise<QuarantineEventView | undefined> {
    return this.store.getById(tenantId, quarantineEventId);
  }

  /**
   * Record an operator disposition (reviewed/released/discarded). Fails CLOSED: an unknown
   * disposition is rejected before any store access; a missing event maps to NOT_FOUND; an
   * illegal status transition (including a terminal released/discarded event) maps to
   * DISPOSITION_CONFLICT. On success the event status advances and a disposition outbox event
   * is emitted atomically. NEVER stores bytes, creates governed evidence, mutates governed
   * lifecycle state, or calls the kernel.
   */
  async recordQuarantineDisposition(
    input: RecordQuarantineDispositionInput,
  ): Promise<RecordQuarantineDispositionResult> {
    if (!QUARANTINE_DISPOSITIONS.includes(input.disposition)) {
      throw new AppError(
        ErrorCode.EVIDENCE_QUARANTINE_INVALID_DISPOSITION,
        `disposition must be one of: ${QUARANTINE_DISPOSITIONS.join(', ')}.`,
      );
    }

    const outcome = await this.store.recordDisposition({
      tenantId: input.tenantId,
      quarantineEventId: input.quarantineEventId,
      disposition: input.disposition,
      actorUserId: input.actorUserId,
      maxRetries: this.maxRetries,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    });

    switch (outcome.outcome) {
      case 'not_found':
        throw new AppError(
          ErrorCode.EVIDENCE_QUARANTINE_NOT_FOUND,
          'Quarantine event not found.',
        );
      case 'illegal_transition':
        throw new AppError(
          ErrorCode.EVIDENCE_QUARANTINE_DISPOSITION_CONFLICT,
          `Quarantine event cannot move from '${outcome.currentStatus}' to '${input.disposition}'.`,
        );
      case 'applied':
        return {
          quarantineEventId: outcome.quarantineEventId,
          previousStatus: outcome.previousStatus,
          newStatus: outcome.newStatus,
        };
    }
  }
}
