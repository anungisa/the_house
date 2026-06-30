import { describe, it, expect } from 'vitest';
import {
  REDACTED,
  isSensitiveKey,
  redactSecrets,
  redactUrlCredentials,
} from '../../../../src/shared/security/redaction.js';

/**
 * Unit tests for the secret redaction utility. Pure functions — no Docker/DB/Azure.
 */

describe('redaction', () => {
  // (1) DATABASE_URL credentials are redacted.
  it('redacts DATABASE_URL credentials', () => {
    const input = { DATABASE_URL: 'postgres://admin:s3cr3t@db.internal:5432/house' };
    const out = redactSecrets(input);
    expect(out.DATABASE_URL).toBe(REDACTED);
  });

  // (2) Service Bus connection string is redacted.
  it('redacts a Service Bus connection string', () => {
    const input = {
      SERVICE_BUS_CONNECTION_STRING:
        'Endpoint=sb://x.servicebus.windows.net/;SharedAccessKey=abc123==',
    };
    const out = redactSecrets(input);
    expect(out.SERVICE_BUS_CONNECTION_STRING).toBe(REDACTED);
  });

  // (3) Evidence Blob connection string is redacted.
  it('redacts an Evidence Blob connection string', () => {
    const input = {
      EVIDENCE_BLOB_CONNECTION_STRING:
        'DefaultEndpointsProtocol=https;AccountName=a;AccountKey=zzz==;',
    };
    const out = redactSecrets(input);
    expect(out.EVIDENCE_BLOB_CONNECTION_STRING).toBe(REDACTED);
  });

  // (4) Nested secret keys are redacted at any depth.
  it('redacts nested secret keys', () => {
    const input = {
      api: { host: '127.0.0.1', port: 3000 },
      serviceBus: { enabled: true, connectionString: 'Endpoint=sb://...;SharedAccessKey=k' },
      nested: { deep: { password: 'hunter2', label: 'ok' } },
    };
    const out = redactSecrets(input);
    expect(out.serviceBus.connectionString).toBe(REDACTED);
    expect(out.nested.deep.password).toBe(REDACTED);
    expect(out.nested.deep.label).toBe('ok');
    expect(out.api.host).toBe('127.0.0.1');
    expect(out.api.port).toBe(3000);
  });

  // (5) The input is not mutated.
  it('does not mutate the input', () => {
    const input = { token: 'abc', nested: { secret: 'xyz' }, list: [{ key: 'k' }] };
    const snapshot = JSON.stringify(input);
    redactSecrets(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('redacts secret keys inside arrays', () => {
    const input = { items: [{ password: 'p1' }, { name: 'safe' }] };
    const out = redactSecrets(input);
    expect(out.items[0]!.password).toBe(REDACTED);
    expect(out.items[1]!.name).toBe('safe');
  });

  it('preserves empty strings, null, and undefined for secret keys', () => {
    const input = { token: '', secret: null, key: undefined };
    const out = redactSecrets(input);
    expect(out.token).toBe('');
    expect(out.secret).toBeNull();
    expect(out.key).toBeUndefined();
  });

  it('scrubs URL credentials even under a non-sensitive key', () => {
    expect(redactUrlCredentials('postgres://u:p@host:5432/db')).toBe(
      `postgres://u:${REDACTED}@host:5432/db`,
    );
    const out = redactSecrets({ note: 'see postgres://u:p@host/db for details' });
    expect(out.note).toContain(`postgres://u:${REDACTED}@host/db`);
  });

  it('handles null and undefined inputs safely', () => {
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets(undefined)).toBeUndefined();
  });

  it('recognizes sensitive keys case-insensitively and substring-aware', () => {
    expect(isSensitiveKey('Password')).toBe(true);
    expect(isSensitiveKey('AUTH_TOKEN')).toBe(true);
    expect(isSensitiveKey('connectionString')).toBe(true);
    expect(isSensitiveKey('accountKey')).toBe(true);
    expect(isSensitiveKey('host')).toBe(false);
    expect(isSensitiveKey('port')).toBe(false);
  });

  // (22) Authorization / Bearer token metadata is treated as sensitive and redacted.
  it('redacts Authorization headers and bearer token fields', () => {
    expect(isSensitiveKey('Authorization')).toBe(true);
    expect(isSensitiveKey('authorization')).toBe(true);
    expect(isSensitiveKey('bearerToken')).toBe(true);
    const input = {
      headers: {
        authorization: 'Bearer eyJabc.def.ghi',
        'content-type': 'application/json',
      },
      accessToken: 'eyJsomeaccesstoken',
    };
    const out = redactSecrets(input);
    expect(out.headers.authorization).toBe(REDACTED);
    expect(out.accessToken).toBe(REDACTED);
    expect(out.headers['content-type']).toBe('application/json');
    expect(JSON.stringify(out)).not.toContain('eyJabc');
  });
});
