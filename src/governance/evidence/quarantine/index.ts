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
  toQuarantineScanStatus,
  type EvidenceQuarantineRecord,
  type EvidenceQuarantineRecordedPayload,
  type QuarantineScanStatus,
  type QuarantineStatus,
  type RecordedQuarantineEvent,
} from './EvidenceQuarantineTypes.js';
export { type EvidenceQuarantineStore } from './EvidenceQuarantineStore.js';
export {
  InMemoryEvidenceQuarantineStore,
  type InMemoryEvidenceQuarantineStoreDeps,
  type StoredQuarantineEvent,
} from './InMemoryEvidenceQuarantineStore.js';
export { PgEvidenceQuarantineStore } from './PgEvidenceQuarantineStore.js';
export {
  EvidenceQuarantineService,
  type EvidenceQuarantineRecorder,
  type EvidenceQuarantineServiceDeps,
  type RecordBlockedUploadInput,
  type RecordBlockedUploadResult,
} from './EvidenceQuarantineService.js';
