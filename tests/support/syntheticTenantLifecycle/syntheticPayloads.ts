/**
 * Synthetic payloads for the tenant-lifecycle confidence suite.
 *
 * Holds the deterministic, NSO-generic inputs the suite feeds through the platform: the
 * all-pass guard facts for an application that should satisfy every affiliation guard, a benign
 * "clean" evidence payload, and the industry-standard EICAR anti-malware TEST string used to
 * exercise the malware-scan/quarantine gate WITHOUT any real malware.
 *
 * None of these bytes are secrets and none carry sport-specific terminology. The EICAR string is
 * a harmless, well-known test vector; it only matches the signature scanner when the EICAR test
 * signature is explicitly loaded.
 */

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

/** Guard facts that make every AffiliationApplication guard pass (mirrors ALL_PASS_FACTS). */
export const SYNTHETIC_ALL_PASS_FACTS = {
  requiredFieldsComplete: true,
  requiredDocsPresent: true,
  openComplianceFlags: false,
  feesPaid: true,
  seasonIsCurrent: true,
} as const;

/** Content type used for synthetic evidence uploads. */
export const SYNTHETIC_EVIDENCE_CONTENT_TYPE = 'application/octet-stream';

/** A benign evidence payload that scans clean and may be stored. */
export const CLEAN_EVIDENCE_BYTES: Uint8Array = Buffer.from(
  'synthetic-clean-evidence-payload',
  'utf8',
);

/**
 * The EICAR anti-malware TEST file body. Harmless by design; exists solely to drive the
 * malware-scan/quarantine path. Matches the signature scanner only when the EICAR test
 * signature is loaded.
 */
export const EICAR_EVIDENCE_BYTES: Uint8Array = Buffer.from(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
  'latin1',
);

/** Compute the lowercase SHA-256 hex digest of a payload (used for quarantine metadata only). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
