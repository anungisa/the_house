/**
 * Time abstraction (scaffold).
 *
 * Injecting a Clock keeps the Governance Kernel and outbox processor deterministic and
 * testable (no direct `Date.now()` / `new Date()` calls in domain logic).
 */

export interface Clock {
  /** Current epoch milliseconds. */
  now(): number;
  /** Current time as an ISO-8601 string (UTC). */
  nowIso(): string;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};

/** Create a fixed clock for tests. */
export function fixedClock(epochMs: number): Clock {
  return {
    now: () => epochMs,
    nowIso: () => new Date(epochMs).toISOString(),
  };
}
