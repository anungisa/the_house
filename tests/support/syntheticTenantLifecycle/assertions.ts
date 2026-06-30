/**
 * Shared assertions for the synthetic tenant-lifecycle suite.
 *
 * These helpers keep the scenario tests focused: they centralize the "no forbidden terminology"
 * and "no secret / raw-byte leakage in telemetry" checks so every scenario applies them
 * consistently. They depend only on the in-memory telemetry snapshot and plain strings — no I/O.
 */

import { expect } from 'vitest';

import { FORBIDDEN_DOMAIN_TERMS } from '../../../src/deployment/validateDeploymentBaseline.js';
import type { InMemoryTelemetry } from '../../../src/observability/index.js';

/**
 * Sport-specific / tenant-specific terminology that MUST NOT appear in synthetic fixtures, test
 * names, or emitted telemetry. Extends the platform's {@link FORBIDDEN_DOMAIN_TERMS} with a few
 * additional banned tokens called out for this suite.
 */
export const SYNTHETIC_FORBIDDEN_TERMS: readonly string[] = [
  ...FORBIDDEN_DOMAIN_TERMS,
  'sheet',
  'curling canada',
];

/** Assert a piece of text contains none of the forbidden domain terms (case-insensitive). */
export function assertNoForbiddenTerms(text: string, context: string): void {
  const lowered = text.toLowerCase();
  for (const term of SYNTHETIC_FORBIDDEN_TERMS) {
    expect(lowered.includes(term), `${context} must not contain forbidden term "${term}"`).toBe(
      false,
    );
  }
}

/**
 * Assert the telemetry snapshot leaks none of the supplied sensitive values (raw evidence bytes,
 * tokens, header secrets, connection strings). The telemetry layer sanitizes attributes before
 * retention, so this proves redaction holds for the signals this suite produced.
 */
export function assertTelemetryHasNoSensitiveValues(
  telemetry: InMemoryTelemetry,
  sensitiveValues: readonly string[],
): void {
  const serialized = JSON.stringify(telemetry.snapshot());
  for (const value of sensitiveValues) {
    if (value.length === 0) continue;
    expect(
      serialized.includes(value),
      `telemetry snapshot must not contain sensitive value (len=${value.length})`,
    ).toBe(false);
  }
  // Defensive: never surface obvious secret markers either.
  for (const marker of ['-----BEGIN', 'AccountKey=', 'SharedAccessKey=', 'Bearer ']) {
    expect(serialized.includes(marker), `telemetry snapshot must not contain "${marker}"`).toBe(
      false,
    );
  }
}
