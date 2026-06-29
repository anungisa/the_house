import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';

/**
 * Validation tests for the outbox worker runtime-host settings (src/config/index.ts).
 *
 * Env is isolated per test; no secrets and no live resources are required. These cover the
 * fail-closed rules: positive-integer interval/batch/lock and a non-empty worker id.
 */

const KEYS = [
  'OUTBOX_WORKER_ENABLED',
  'OUTBOX_WORKER_INTERVAL_MS',
  'OUTBOX_WORKER_BATCH_SIZE',
  'OUTBOX_WORKER_ID',
  'OUTBOX_WORKER_LOCK_SECONDS',
  'OUTBOX_WORKER_RUN_ONCE',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    const original = saved[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
});

describe('outbox worker config', () => {
  // (8) Defaults load correctly.
  it('loads defaults when unset', () => {
    expect(loadConfig().outboxWorker).toEqual({
      enabled: true,
      intervalMs: 5000,
      batchSize: 25,
      workerId: 'local-outbox-worker',
      lockSeconds: 60,
      runOnce: false,
    });
  });

  it('reads overrides from the environment', () => {
    process.env['OUTBOX_WORKER_ENABLED'] = 'false';
    process.env['OUTBOX_WORKER_INTERVAL_MS'] = '1000';
    process.env['OUTBOX_WORKER_BATCH_SIZE'] = '10';
    process.env['OUTBOX_WORKER_ID'] = 'worker-7';
    process.env['OUTBOX_WORKER_LOCK_SECONDS'] = '30';
    process.env['OUTBOX_WORKER_RUN_ONCE'] = 'true';
    expect(loadConfig().outboxWorker).toEqual({
      enabled: false,
      intervalMs: 1000,
      batchSize: 10,
      workerId: 'worker-7',
      lockSeconds: 30,
      runOnce: true,
    });
  });

  // (9) Invalid interval rejects.
  it('rejects a non-positive interval', () => {
    process.env['OUTBOX_WORKER_INTERVAL_MS'] = '0';
    expect(() => loadConfig()).toThrow(/OUTBOX_WORKER_INTERVAL_MS must be a positive integer/);
  });

  it('rejects a non-numeric interval', () => {
    process.env['OUTBOX_WORKER_INTERVAL_MS'] = 'soon';
    expect(() => loadConfig()).toThrow(/Invalid integer/);
  });

  // (10) Invalid batch size rejects.
  it('rejects a non-positive batch size', () => {
    process.env['OUTBOX_WORKER_BATCH_SIZE'] = '-5';
    expect(() => loadConfig()).toThrow(/OUTBOX_WORKER_BATCH_SIZE must be a positive integer/);
  });

  // (11) Invalid lock seconds rejects.
  it('rejects a non-positive lock seconds', () => {
    process.env['OUTBOX_WORKER_LOCK_SECONDS'] = '0';
    expect(() => loadConfig()).toThrow(/OUTBOX_WORKER_LOCK_SECONDS must be a positive integer/);
  });

  // (12) Missing (present-but-empty) worker id rejects.
  it('rejects a blank worker id', () => {
    process.env['OUTBOX_WORKER_ID'] = '   ';
    expect(() => loadConfig()).toThrow(/OUTBOX_WORKER_ID must be non-empty/);
  });

  it('rejects a non-boolean run-once flag', () => {
    process.env['OUTBOX_WORKER_RUN_ONCE'] = 'sometimes';
    expect(() => loadConfig()).toThrow(/Invalid boolean/);
  });
});
