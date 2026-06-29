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
  'SERVICE_BUS_ENABLED',
  'SERVICE_BUS_CONNECTION_STRING',
  'SERVICE_BUS_QUEUE_NAME',
  'SERVICE_BUS_TOPIC_NAME',
  'SERVICE_BUS_PUBLISH_TARGET',
  'OUTBOX_BATCH_SIZE',
  'OUTBOX_LOCK_SECONDS',
  'OUTBOX_BASE_DELAY_MS',
  'OUTBOX_MAX_DELAY_MS',
  'OUTBOX_MAX_RETRIES',
  'OUTBOX_WORKER_ENABLED',
  'OUTBOX_WORKER_INTERVAL_MS',
  'OUTBOX_WORKER_BATCH_SIZE',
  'OUTBOX_WORKER_ID',
  'OUTBOX_WORKER_LOCK_SECONDS',
  'OUTBOX_WORKER_RUN_ONCE',
  'API_HOST',
  'API_PORT',
  'AUTH_MODE',
  'EVIDENCE_STORAGE_PROVIDER',
  'EVIDENCE_BLOB_CONNECTION_STRING',
  'EVIDENCE_BLOB_CONTAINER_NAME',
  'EVIDENCE_STORAGE_REQUIRE_HASH',
  'EVIDENCE_UPLOAD_MAX_BYTES',
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
    expect(cfg.serviceBus.enabled).toBe(false);
    expect(cfg.serviceBus.connectionString).toBe('');
    expect(cfg.serviceBus.publishTarget).toBe('queue');
    expect(cfg.serviceBus.queueName).toBe('');
    expect(cfg.serviceBus.topicName).toBe('');
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

  // Outbox worker runtime-host settings default sensibly when unset.
  it('loads outbox worker runtime defaults when unset', () => {
    const { outboxWorker } = loadConfig();
    expect(outboxWorker).toEqual({
      enabled: true,
      intervalMs: 5000,
      batchSize: 25,
      workerId: 'local-outbox-worker',
      lockSeconds: 60,
      runOnce: false,
    });
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

  // (16) Edge identity defaults to demo mode (local/demo only).
  it('defaults the auth mode to demo when AUTH_MODE is unset', () => {
    expect(loadConfig().auth.mode).toBe('demo');
  });

  // Edge identity reads trusted_headers when explicitly selected.
  it('reads AUTH_MODE=trusted_headers from the environment', () => {
    process.env['AUTH_MODE'] = 'trusted_headers';
    expect(loadConfig().auth.mode).toBe('trusted_headers');
  });

  // (15) An unknown AUTH_MODE fails closed at config load.
  it('rejects an unknown AUTH_MODE', () => {
    process.env['AUTH_MODE'] = 'bogus';
    expect(() => loadConfig()).toThrow(/Invalid AUTH_MODE/);
  });

  // Evidence storage defaults to the in-memory provider (no Azure config required).
  it('defaults evidence storage to the memory provider', () => {
    const cfg = loadConfig().evidenceStorage;
    expect(cfg.provider).toBe('memory');
    expect(cfg.requireHash).toBe(true);
    expect(cfg.connectionString).toBe('');
    expect(cfg.containerName).toBe('');
    expect(cfg.uploadMaxBytes).toBe(10_485_760);
  });

  // (15) Evidence upload size cap can be overridden and must be a positive integer.
  it('reads EVIDENCE_UPLOAD_MAX_BYTES override', () => {
    process.env['EVIDENCE_UPLOAD_MAX_BYTES'] = '2048';
    expect(loadConfig().evidenceStorage.uploadMaxBytes).toBe(2048);
  });

  it('rejects a non-positive EVIDENCE_UPLOAD_MAX_BYTES', () => {
    process.env['EVIDENCE_UPLOAD_MAX_BYTES'] = '0';
    expect(() => loadConfig()).toThrow(/EVIDENCE_UPLOAD_MAX_BYTES must be a positive integer/);
  });

  // Evidence storage can require hashing be disabled explicitly.
  it('reads EVIDENCE_STORAGE_REQUIRE_HASH=false', () => {
    process.env['EVIDENCE_STORAGE_REQUIRE_HASH'] = 'false';
    expect(loadConfig().evidenceStorage.requireHash).toBe(false);
  });

  // An unknown evidence storage provider fails closed.
  it('rejects an unknown EVIDENCE_STORAGE_PROVIDER', () => {
    process.env['EVIDENCE_STORAGE_PROVIDER'] = 'gcs';
    expect(() => loadConfig()).toThrow(/Invalid EVIDENCE_STORAGE_PROVIDER/);
  });

  // azure_blob without a connection string fails closed.
  it('rejects azure_blob without a connection string', () => {
    process.env['EVIDENCE_STORAGE_PROVIDER'] = 'azure_blob';
    process.env['EVIDENCE_BLOB_CONTAINER_NAME'] = 'evidence';
    expect(() => loadConfig()).toThrow(/EVIDENCE_BLOB_CONNECTION_STRING is required/);
  });

  // azure_blob without a container name fails closed.
  it('rejects azure_blob without a container name', () => {
    process.env['EVIDENCE_STORAGE_PROVIDER'] = 'azure_blob';
    process.env['EVIDENCE_BLOB_CONNECTION_STRING'] = 'UseDevelopmentStorage=true';
    expect(() => loadConfig()).toThrow(/EVIDENCE_BLOB_CONTAINER_NAME is required/);
  });

  // azure_blob with full config loads.
  it('reads a complete azure_blob evidence storage config', () => {
    process.env['EVIDENCE_STORAGE_PROVIDER'] = 'azure_blob';
    process.env['EVIDENCE_BLOB_CONNECTION_STRING'] = 'UseDevelopmentStorage=true';
    process.env['EVIDENCE_BLOB_CONTAINER_NAME'] = 'evidence';
    const cfg = loadConfig().evidenceStorage;
    expect(cfg.provider).toBe('azure_blob');
    expect(cfg.connectionString).toBe('UseDevelopmentStorage=true');
    expect(cfg.containerName).toBe('evidence');
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
