import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../src/config/index.js';

/**
 * Unit tests for the typed config loader (src/config/index.ts).
 *
 * Env is isolated per test: every config-relevant key is snapshotted and cleared before
 * each test, then restored afterward, so tests neither depend on nor pollute the ambient
 * environment. No secrets and no live resources are required.
 *
 * API_HOST / API_PORT ARE covered here now that the local/demo runtime exists and the
 * config loader defines them (defaults 127.0.0.1:3000).
 */

const CONFIG_KEYS = [
  'APP_ENV',
  'APP_REGION',
  'LOG_LEVEL',
  'DATABASE_URL',
  'AZURE_SERVICE_BUS_CONNECTION_STRING',
  'AZURE_SERVICE_BUS_OUTBOX_TOPIC',
  'AZURE_SERVICE_BUS_OUTBOX_QUEUE',
  'OUTBOX_BATCH_SIZE',
  'OUTBOX_LOCK_SECONDS',
  'OUTBOX_BASE_DELAY_MS',
  'OUTBOX_MAX_DELAY_MS',
  'OUTBOX_MAX_RETRIES',
  'API_HOST',
  'API_PORT',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of CONFIG_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of CONFIG_KEYS) {
    const original = saved[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
});

describe('loadConfig', () => {
  // (1)(8) Local mode uses safe defaults and requires no secrets.
  it('uses local/test-safe defaults with no required secrets', () => {
    // APP_ENV unset → defaults to 'local'.
    const cfg = loadConfig();
    expect(cfg.appEnv).toBe('local');
    expect(cfg.appRegion).toBe('canada');
    expect(cfg.logLevel).toBe('info');
    expect(cfg.databaseUrl).toBe('');
    expect(cfg.serviceBus.connectionString).toBe('');
    expect(cfg.serviceBus.outboxTopic).toBe('');
    expect(cfg.serviceBus.outboxQueue).toBe('');
  });

  // (2) Production-like env fails closed when DATABASE_URL is missing.
  it('fails closed in a production-like env when DATABASE_URL is missing', () => {
    process.env['APP_ENV'] = 'production';
    expect(() => loadConfig()).toThrow(/DATABASE_URL is required/);
  });

  // (3) DATABASE_URL is accepted when provided.
  it('accepts DATABASE_URL when provided in a production-like env', () => {
    process.env['APP_ENV'] = 'production';
    process.env['DATABASE_URL'] = 'postgres://user:pw@host:5432/db';
    const cfg = loadConfig();
    expect(cfg.appEnv).toBe('production');
    expect(cfg.databaseUrl).toBe('postgres://user:pw@host:5432/db');
  });

  // (7) Outbox defaults are loaded when env is unset.
  it('loads outbox defaults when unset', () => {
    const { outbox } = loadConfig();
    expect(outbox).toEqual({
      batchSize: 25,
      lockSeconds: 120,
      baseDelayMs: 1000,
      maxDelayMs: 300_000,
      maxRetries: 10,
    });
  });

  // (7) Outbox values can be overridden from the environment.
  it('reads outbox overrides from the environment', () => {
    process.env['OUTBOX_BATCH_SIZE'] = '5';
    process.env['OUTBOX_MAX_RETRIES'] = '3';
    const { outbox } = loadConfig();
    expect(outbox.batchSize).toBe(5);
    expect(outbox.maxRetries).toBe(3);
  });

  // (6) Non-numeric integer config is rejected.
  it('rejects a non-numeric integer env value', () => {
    process.env['OUTBOX_BATCH_SIZE'] = 'not-a-number';
    expect(() => loadConfig()).toThrow(/Invalid integer/);
  });

  // (10) API runtime config defaults to loopback:3000 when unset.
  it('loads API host/port defaults when unset', () => {
    const { api } = loadConfig();
    expect(api).toEqual({ host: '127.0.0.1', port: 3000 });
  });

  // (10) API host/port can be overridden from the environment.
  it('reads API host/port overrides from the environment', () => {
    process.env['API_HOST'] = '0.0.0.0';
    process.env['API_PORT'] = '8080';
    const { api } = loadConfig();
    expect(api.host).toBe('0.0.0.0');
    expect(api.port).toBe(8080);
  });

  // (10) A non-numeric API_PORT fails closed.
  it('rejects a non-numeric API_PORT', () => {
    process.env['API_PORT'] = 'abc';
    expect(() => loadConfig()).toThrow(/Invalid integer/);
  });

  // Invalid enum values fail closed.
  it('rejects an invalid APP_ENV', () => {
    process.env['APP_ENV'] = 'banana';
    expect(() => loadConfig()).toThrow(/Invalid APP_ENV/);
  });

  it('rejects an invalid LOG_LEVEL', () => {
    process.env['LOG_LEVEL'] = 'verbose';
    expect(() => loadConfig()).toThrow(/Invalid LOG_LEVEL/);
  });

  // Whitespace-only values are treated as absent (trimmed to undefined → default).
  it('treats whitespace-only values as unset', () => {
    process.env['APP_REGION'] = '   ';
    expect(loadConfig().appRegion).toBe('canada');
  });

  // (9) loadConfig does not mutate process.env.
  it('does not mutate process.env', () => {
    process.env['APP_ENV'] = 'local';
    process.env['DATABASE_URL'] = 'postgres://x';
    const before = CONFIG_KEYS.map((k) => `${k}=${process.env[k] ?? ''}`).join('\n');
    loadConfig();
    const after = CONFIG_KEYS.map((k) => `${k}=${process.env[k] ?? ''}`).join('\n');
    expect(after).toBe(before);
  });
});
