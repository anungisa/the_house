/**
 * Evidence malware scanning ingestion gate.
 *
 * Runs a payload through an {@link EvidenceMalwareScanner} and applies a fail-closed/
 * fail-open policy BEFORE the payload is handed to evidence storage. This is the single seam
 * that decides whether an upload may proceed based on the scan outcome.
 *
 * Decision matrix (the `required` flag is the master fail-closed switch):
 *  - `infected` -> ALWAYS reject (known malware is never stored), regardless of `required`.
 *  - `clean`    -> proceed; storage may persist the bytes.
 *  - `skipped`  -> reject when `required`; otherwise proceed (best-effort scanning).
 *  - `error`    -> reject when `required`; otherwise proceed (best-effort scanning).
 *
 * On rejection an {@link AppError} with a stable, sanitized code is thrown — never the
 * payload contents. The HTTP adapter maps these codes to status codes and attaches the
 * (clean/skipped) scan metadata to its response.
 */

import { AppError, ErrorCode } from '../../../shared/errors/AppError.js';
import { systemClock, type Clock } from '../../../shared/time/clock.js';
import type {
  EvidenceMalwareScanner,
  EvidenceScanInput,
  EvidenceScanResult,
} from './EvidenceMalwareScanner.js';

export interface EvidenceScanGateOptions {
  readonly scanner: EvidenceMalwareScanner;
  /** When true, a `skipped`/`error` scan fails closed (the upload is rejected). */
  readonly required: boolean;
  /** Clock used only to timestamp a synthesized error result if the scanner throws. */
  readonly clock?: Clock;
}

/**
 * Scan a payload and enforce the ingestion policy. Returns the (clean/skipped) scan result
 * when the upload may proceed; throws an {@link AppError} when it must be rejected.
 */
export async function enforceEvidenceScan(
  options: EvidenceScanGateOptions,
  input: EvidenceScanInput,
): Promise<EvidenceScanResult> {
  const clock = options.clock ?? systemClock;

  let result: EvidenceScanResult;
  try {
    result = await options.scanner.scan(input);
  } catch {
    // Defensive: a scanner should never throw for normal input. Treat a throw as a scan
    // error WITHOUT surfacing the underlying cause (it may reference payload bytes).
    result = {
      status: 'error',
      scanner: options.scanner.name,
      reason: 'Malware scan failed to complete.',
      scannedAt: clock.nowIso(),
    };
  }

  switch (result.status) {
    case 'infected':
      throw new AppError(
        ErrorCode.EVIDENCE_MALWARE_DETECTED,
        'Evidence upload was rejected: malware was detected in the payload.',
        { details: { scanner: result.scanner, threatName: result.threatName } },
      );
    case 'error':
      if (options.required) {
        throw new AppError(
          ErrorCode.EVIDENCE_MALWARE_SCAN_FAILED,
          'Evidence upload was rejected: malware scanning is required but could not complete.',
          { details: { scanner: result.scanner } },
        );
      }
      return result;
    case 'skipped':
      if (options.required) {
        throw new AppError(
          ErrorCode.EVIDENCE_MALWARE_SCAN_REQUIRED,
          'Evidence upload was rejected: malware scanning is required but was not performed.',
          { details: { scanner: result.scanner } },
        );
      }
      return result;
    case 'clean':
      return result;
    default:
      // Exhaustiveness guard: an unknown status fails closed.
      throw new AppError(
        ErrorCode.EVIDENCE_MALWARE_SCAN_FAILED,
        'Evidence upload was rejected: malware scan returned an unknown status.',
        { details: { scanner: result.scanner } },
      );
  }
}
