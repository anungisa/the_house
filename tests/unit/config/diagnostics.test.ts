import { describe, it, expect } from 'vitest';
import { buildConfigDiagnostics } from '../../../src/config/diagnostics.js';
import type { AppConfig } from '../../../src/config/index.js';

/**
 * Unit tests for operational config diagnostics. Pure — no Docker/DB/Azure.
 */

function makeConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    appEnv: 'local',
    appRegion: 'canada',
    logLevel: 'info',
    databaseUrl: 'postgres://u:p@localhost:5432/db',
    serviceBus: {
      enabled: false,
      connectionString: '',
      publishTarget: 'queue',
      queueName: '',
      topicName: '',
    },
    outbox: {
      batchSize: 25,
      lockSeconds: 120,
      baseDelayMs: 1000,
      maxDelayMs: 300_000,
      maxRetries: 10,
    },
    api: { host: '127.0.0.1', port: 3000 },
    outboxWorker: {
      enabled: true,
      intervalMs: 5000,
      batchSize: 25,
      workerId: 'local-outbox-worker',
      lockSeconds: 60,
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
    ...over,
  };
}

describe('config diagnostics', () => {
  // (6) Diagnostics omits raw secrets.
  it('omits raw connection strings and database credentials from the summary', () => {
    const diag = buildConfigDiagnostics(
      makeConfig({
        databaseUrl: 'postgres://admin:topsecret@db.internal:5432/house',
        serviceBus: {
          enabled: true,
          connectionString: 'Endpoint=sb://x.servicebus.windows.net/;SharedAccessKey=abc==',
          publishTarget: 'queue',
          queueName: 'q',
          topicName: '',
        },
        evidenceStorage: {
          provider: 'azure_blob',
          connectionString: 'DefaultEndpointsProtocol=https;AccountKey=zzz==;',
          containerName: 'evidence',
          requireHash: true,
          uploadMaxBytes: 10_485_760,
        },
      }),
    );
    const serialized = JSON.stringify(diag.summary);
    expect(serialized).not.toContain('topsecret');
    expect(serialized).not.toContain('SharedAccessKey=abc');
    expect(serialized).not.toContain('AccountKey=zzz');
  });

  // (7) Reports the auth mode.
  it('reports the configured auth mode', () => {
    const diag = buildConfigDiagnostics(makeConfig({ auth: { mode: 'trusted_headers' } }));
    expect((diag.summary['auth'] as { mode: string }).mode).toBe('trusted_headers');
  });

  it('reports database/service-bus/evidence configured status as booleans', () => {
    const diag = buildConfigDiagnostics(makeConfig());
    expect((diag.summary['database'] as { configured: boolean }).configured).toBe(true);
    expect((diag.summary['serviceBus'] as { connectionConfigured: boolean }).connectionConfigured).toBe(
      false,
    );
  });

  // (8) Warns on demo auth in a production-like environment.
  it('warns when AUTH_MODE=demo in a production-like environment', () => {
    const diag = buildConfigDiagnostics(makeConfig({ appEnv: 'production', auth: { mode: 'demo' } }));
    expect(diag.warnings.some((w) => w.includes('AUTH_MODE=demo'))).toBe(true);
  });

  // (9) Warns on memory evidence storage in a production-like environment.
  it('warns when evidence storage is memory in a production-like environment', () => {
    const diag = buildConfigDiagnostics(
      makeConfig({
        appEnv: 'staging',
        evidenceStorage: {
          provider: 'memory',
          connectionString: '',
          containerName: '',
          requireHash: true,
          uploadMaxBytes: 10_485_760,
        },
      }),
    );
    expect(diag.warnings.some((w) => w.includes('EVIDENCE_STORAGE_PROVIDER=memory'))).toBe(true);
  });

  // (10) Warns on disabled malware scanning with azure_blob storage.
  it('warns when malware scanning is disabled with azure_blob storage', () => {
    const diag = buildConfigDiagnostics(
      makeConfig({
        evidenceStorage: {
          provider: 'azure_blob',
          connectionString: 'DefaultEndpointsProtocol=https;AccountKey=zzz==;',
          containerName: 'evidence',
          requireHash: true,
          uploadMaxBytes: 10_485_760,
        },
        evidenceMalwareScanning: { mode: 'disabled', required: false, testSignaturesEnabled: false },
      }),
    );
    expect(
      diag.warnings.some((w) => w.includes('EVIDENCE_MALWARE_SCANNING_MODE=disabled')),
    ).toBe(true);
  });

  it('produces no production warnings for a healthy local config', () => {
    const diag = buildConfigDiagnostics(makeConfig());
    // local/demo is acceptable; the only advisory is the trusted_headers reminder, which is
    // not emitted for demo mode.
    expect(diag.warnings).toEqual([]);
  });

  // (15) The startup-log payload (the diagnostics summary scripts log) excludes connection
  // strings and DB credentials.
  it('startup diagnostics summary excludes connection strings and DB credentials', () => {
    const { summary } = buildConfigDiagnostics(
      makeConfig({
        databaseUrl: 'postgres://admin:topsecret@db.internal:5432/house',
        serviceBus: {
          enabled: true,
          connectionString: 'Endpoint=sb://x.servicebus.windows.net/;SharedAccessKey=abc==',
          publishTarget: 'topic',
          queueName: '',
          topicName: 'events',
        },
      }),
    );
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('topsecret');
    expect(serialized).not.toContain('servicebus.windows.net');
    expect(serialized).not.toContain('SharedAccessKey');
  });
});
