/**
 * Public surface of the evidence quarantine module.
 *
 * Quarantine is an OPERATIONAL SECURITY workflow: when the malware-scan ingestion gate blocks
 * an upload, it records sanitized metadata and emits an `evidence.quarantine.recorded` outbox
 * event. It is NSO-generic platform infrastructure that NEVER stores raw payload bytes, creates
 * governed evidence, mutates governed state, executes a workflow, or calls the kernel.
 */

export {
  EVIDENCE_QUARANTINE_RECORDED_MESSAGE_TYPE,
  EVIDENCE_QUARANTINE_REVIEWED_MESSAGE_TYPE,
  EVIDENCE_QUARANTINE_RELEASED_MESSAGE_TYPE,
  EVIDENCE_QUARANTINE_DISCARDED_MESSAGE_TYPE,
  QUARANTINE_DISPOSITIONS,
  QUARANTINE_LIST_DEFAULT_LIMIT,
  QUARANTINE_LIST_MAX_LIMIT,
  TERMINAL_QUARANTINE_STATUSES,
  dispositionMessageType,
  dispositionTargetStatus,
  isAllowedQuarantineTransition,
  toQuarantineScanStatus,
  type EvidenceQuarantineDispositionPayload,
  type EvidenceQuarantineRecord,
  type EvidenceQuarantineRecordedPayload,
  type QuarantineDisposition,
  type QuarantineEventView,
  type QuarantineListCursor,
  type QuarantineListFilter,
  type QuarantineListResult,
  type QuarantineScanStatus,
  type QuarantineStatus,
  type RecordedQuarantineEvent,
} from './EvidenceQuarantineTypes.js';
export {
  buildQuarantineDispositionOutbox,
  type EvidenceQuarantineStore,
  type QuarantineOutboxRowContext,
  type RecordQuarantineDispositionOutcome,
  type RecordQuarantineDispositionStoreInput,
} from './EvidenceQuarantineStore.js';
export {
  InMemoryEvidenceQuarantineStore,
  type InMemoryEvidenceQuarantineStoreDeps,
  type StoredQuarantineEvent,
} from './InMemoryEvidenceQuarantineStore.js';
export { PgEvidenceQuarantineStore } from './PgEvidenceQuarantineStore.js';
export {
  EvidenceQuarantineService,
  type EvidenceQuarantineRecorder,
  type EvidenceQuarantineReviewer,
  type EvidenceQuarantineServiceDeps,
  type RecordBlockedUploadInput,
  type RecordBlockedUploadResult,
  type RecordQuarantineDispositionInput,
  type RecordQuarantineDispositionResult,
} from './EvidenceQuarantineService.js';
