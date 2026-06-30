/**
 * Public surface of the evidence malware scanning module.
 *
 * Malware scanning is an evidence-INGESTION gate that inspects uploaded payload bytes before
 * they are stored. It is NSO-generic platform infrastructure: it never approves/rejects a
 * governed lifecycle transition, mutates governed state, or bypasses the evidence storage
 * layer.
 */

export {
  type EvidenceMalwareScanner,
  type EvidenceScanInput,
  type EvidenceScanResult,
  type EvidenceScanStatus,
} from './EvidenceMalwareScanner.js';
export {
  NoopEvidenceMalwareScanner,
  type NoopEvidenceMalwareScannerOptions,
} from './NoopEvidenceMalwareScanner.js';
export {
  EICAR_TEST_SIGNATURE,
  SignatureEvidenceMalwareScanner,
  type MalwareSignature,
  type SignatureEvidenceMalwareScannerOptions,
} from './SignatureEvidenceMalwareScanner.js';
export {
  createEvidenceMalwareScanner,
  type CreateEvidenceMalwareScannerDeps,
} from './EvidenceMalwareScannerFactory.js';
export {
  enforceEvidenceScan,
  evaluateEvidenceScan,
  type EvidenceScanDecision,
  type EvidenceScanGateOptions,
} from './EvidenceScanGate.js';
