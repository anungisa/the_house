/**
 * Evidence HTTP endpoint surface — public exports.
 *
 * A narrow transport over the existing evidence storage services. It moves payload bytes in
 * and out of {@link EvidenceStorage} and never bypasses or invokes the Governance Kernel.
 */

export {
  handleEvidenceUpload,
  handleEvidenceDownload,
  evidenceErrorToHttpResult,
  type EvidenceHttpDeps,
  type EvidenceHttpResult,
  type EvidenceReadPort,
  type EvidenceUploadService,
} from './EvidenceHttpAdapter.js';

export {
  EVIDENCE_HEADER_NAMES,
  type EvidenceDownloadRequest,
  type EvidenceUploadRequest,
  type EvidenceUploadResponseBody,
} from './EvidenceHttpDtos.js';
