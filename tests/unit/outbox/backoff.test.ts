import { describe, it, expect } from 'vitest';
import { backoffCap, fullJitterDelayMs } from '../../../src/workers/outbox/backoff.js';

/**
 * True full jitter:
 *   cap   = min(maxDelayMs, baseDelayMs * 2^attempt)
 *   delay = random integer in [0, cap]
 */
describe('outbox backoff — true full jitter', () => {
  const baseDelayMs = 1000;
  const maxDelayMs = 300_000;

  it('cap grows exponentially and is bounded by maxDelayMs', () => {
    expect(backoffCap(0, baseDelayMs, maxDelayMs)).toBe(1000);
    expect(backoffCap(1, baseDelayMs, maxDelayMs)).toBe(2000);
    expect(backoffCap(2, baseDelayMs, maxDelayMs)).toBe(4000);
    // Large attempt saturates at the max.
    expect(backoffCap(50, baseDelayMs, maxDelayMs)).toBe(maxDelayMs);
  });

  it('delay is always within [0, cap]', () => {
    for (let attempt = 0; attempt <= 12; attempt++) {
      const cap = backoffCap(attempt, baseDelayMs, maxDelayMs);
      for (let i = 0; i < 200; i++) {
        const delay = fullJitterDelayMs({ attempt, baseDelayMs, maxDelayMs });
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('returns 0 when the injected RNG is 0', () => {
    const delay = fullJitterDelayMs({ attempt: 5, baseDelayMs, maxDelayMs, random: () => 0 });
    expect(delay).toBe(0);
  });

  it('returns the cap when the injected RNG approaches 1', () => {
    const cap = backoffCap(3, baseDelayMs, maxDelayMs);
    const delay = fullJitterDelayMs({
      attempt: 3,
      baseDelayMs,
      maxDelayMs,
      random: () => 0.999999999,
    });
    expect(delay).toBe(cap);
  });
});
