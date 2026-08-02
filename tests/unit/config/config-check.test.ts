import { describe, it, expect, vi } from 'vitest';
import { runConfigCheck } from '../../../src/config/configCheck.js';
import type { AppConfig } from '../../../src/config/index.js';
import type { Logger, LogFields } from '../../../src/shared/logging/logger.js';

/**
 * Unit tests for the config check runner. Dependency-injected — no process/console/DB.
 */

function makeConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    appEnv: 'local',
    appRegion: 'canada',
    logLevel: 'info',
    databaseUrl: 'postgres://admin:topsecret@db.internal:5432/house',
    serviceBus: {
      enabled: false,
      connectionString: 'Endpoint=sb://x;SharedAccessKey=abc==',
      publishTarget: 'queue',
      queueName: '',
      topicName: '',
    },
    outbox: { batchSize: 25, lockSeconds: 120, baseDelayMs: 1000, maxDelayMs: 300_000, maxRetries: 10 },
    api: { host: '127.0.0.1', port: 3000 },
    outboxWorker: {
      enabled: true,
      intervalMs: 5000,
      batchSize: 25,
      workerId: 'local-outbox-worker',
      lockSeconds: 60,
      runOnce: false,
    },
    standingProjectionWorker: {
      enabled: true,
      intervalMs: 5000,
      batchSize: 25,
      workerId: 'local-standing-projection-worker',
      runOnce: false,
    },
    auth: { mode: 'demo' },
    evidenceStorage: {
      provider: 'memory',
      connectionString: '',
      containerName: '',
      requireHash: true,
      uploadMaxBytes: 10_485_760,
    },
    evidenceMalwareScanning: { mode: 'disabled', required: false, testSignaturesEnabled: false },
    evidenceQuarantine: { enabled: true, includeEventIdInResponse: true },
    observability: { enabled: true, exporter: 'console', includeDebugAttributes: false },
    secrets: { provider: 'env', keyVaultUri: '', keyVaultSecretPrefix: '' },
    ...over,
  };
}

function captureLogger(): { logger: Logger; entries: Array<{ message: string; fields?: LogFields }> } {
  const entries: Array<{ message: string; fields?: LogFields }> = [];
  const record = (message: string, fields?: LogFields): void => {
    entries.push(fields !== undefined ? { message, fields } : { message });
  };
  return {
    entries,
    logger: { debug: record, info: record, warn: record, error: record },
  };
}

describe('config check runner', () => {
  // (14) Config check prints redacted diagnostics and exits 0.
  it('prints redacted diagnostics and exits 0 on a valid config', () => {
    const { logger, entries } = captureLogger();
    const exit = vi.fn();
    runConfigCheck({ loadConfig: () => makeConfig(), logger, exit });

    expect(exit).toHaveBeenCalledWith(0);
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain('topsecret');
    expect(serialized).not.toContain('SharedAccessKey=abc');
    expect(entries.some((e) => e.message === 'config diagnostics')).toBe(true);
  });

  it('exits 1 (fail-closed) when config cannot be loaded', () => {
    const { logger, entries } = captureLogger();
    const exit = vi.fn();
    runConfigCheck({
      loadConfig: () => {
        throw new Error('API_PORT is required');
      },
      logger,
      exit,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(entries.some((e) => e.message.includes('config check failed'))).toBe(true);
  });
});
