import { describe, it, expect } from 'vitest';
import { createDatabaseReadinessCheck } from '../../../src/http/readiness.js';

/**
 * Unit tests for the database readiness check. Uses fake probes — no DB/Docker.
 */

describe('database readiness check', () => {
  it('resolves when the probe succeeds', async () => {
    const check = createDatabaseReadinessCheck({ probe: () => Promise.resolve([{ '?column?': 1 }]) });
    await expect(check.checkDatabase()).resolves.toBeUndefined();
  });

  it('rejects when the probe fails', async () => {
    const check = createDatabaseReadinessCheck({ probe: () => Promise.reject(new Error('no conn')) });
    await expect(check.checkDatabase()).rejects.toThrow('no conn');
  });

  it('rejects when the probe exceeds the bounded timeout', async () => {
    const check = createDatabaseReadinessCheck({
      probe: () => new Promise(() => {}), // never settles
      timeoutMs: 10,
    });
    await expect(check.checkDatabase()).rejects.toThrow(/timed out/);
  });
});
