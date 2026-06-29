/**
 * Retry backoff helpers for the outbox processor.
 *
 * Implements TRUE FULL JITTER (AWS Architecture Blog definition):
 *
 *   cap   = min(maxDelayMs, baseDelayMs * 2^attempt)
 *   delay = random integer in [0, cap]
 *
 * This is NOT bounded plus/minus jitter around a target. The delay is uniformly random
 * across the entire [0, cap] window.
 */

export interface FullJitterParams {
  readonly attempt: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Injectable RNG returning a float in [0, 1). Defaults to Math.random for production. */
  readonly random?: () => number;
}

/**
 * Compute the exponential backoff cap (no jitter): min(maxDelayMs, baseDelayMs * 2^attempt).
 * `attempt` is clamped at 0 and capped to avoid overflow on large attempt counts.
 */
export function backoffCap(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 1023));
  const exponential = baseDelayMs * 2 ** safeAttempt;
  // Guard against Infinity/overflow from 2**big.
  const bounded = Number.isFinite(exponential) ? exponential : maxDelayMs;
  return Math.min(maxDelayMs, bounded);
}

/**
 * Compute a true full-jitter delay in milliseconds: a random integer in [0, cap].
 */
export function fullJitterDelayMs(params: FullJitterParams): number {
  const { attempt, baseDelayMs, maxDelayMs } = params;
  const random = params.random ?? Math.random;
  const cap = backoffCap(attempt, baseDelayMs, maxDelayMs);
  // random() in [0,1) -> scale to [0, cap]; floor and clamp keeps it an integer in [0, cap].
  const delay = Math.floor(random() * (cap + 1));
  return Math.min(cap, Math.max(0, delay));
}
