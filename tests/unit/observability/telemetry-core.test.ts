import { describe, expect, it } from 'vitest';

import {
  ExportingTelemetry,
  InMemoryTelemetry,
  NoopTelemetry,
  createTelemetry,
  sanitizeTelemetryAttributes,
  ALL_TELEMETRY_NAMES,
  type TelemetryExporter,
  type TelemetrySignal,
} from '../../../src/observability/index.js';

/**
 * Core telemetry tests — fully hermetic. They exercise the vendor-neutral primitives
 * (counters/durations/events), the redaction guarantee, exporter fail-safety, and the
 * no-domain-terminology rule. No DB, Azure, Entra, AV, or network.
 */

describe('observability telemetry core', () => {
  // (1) the no-op accepts every primitive and does nothing observable.
  it('(1) NoopTelemetry accepts counters, durations, and events without throwing', () => {
    const t = new NoopTelemetry();
    expect(() => {
      t.incrementCounter('http.request.count', 1, { route: 'GET /healthz' });
      t.recordDuration('http.request.duration_ms', 12, { route: 'GET /healthz' });
      t.recordEvent('authz.denied', { action: 'workflow.read' });
    }).not.toThrow();
  });

  // (2) the in-memory exporter records counter increments (and sums them).
  it('(2) InMemoryTelemetry records counter increments', () => {
    const t = new InMemoryTelemetry();
    t.incrementCounter('http.request.count', 1, { route: 'GET /x' });
    t.incrementCounter('http.request.count', 2, { route: 'GET /x' });
    expect(t.counterTotal('http.request.count')).toBe(3);
    expect(t.signalsNamed('http.request.count')).toHaveLength(2);
  });

  // (3) the in-memory exporter records durations.
  it('(3) InMemoryTelemetry records durations', () => {
    const t = new InMemoryTelemetry();
    t.recordDuration('http.request.duration_ms', 42, { route: 'GET /x' });
    expect(t.durations('http.request.duration_ms')).toEqual([42]);
  });

  // (4) the in-memory exporter records events.
  it('(4) InMemoryTelemetry records events', () => {
    const t = new InMemoryTelemetry();
    t.recordEvent('workflow.decision.recorded', { status: 'approved' });
    expect(t.hasEvent('workflow.decision.recorded')).toBe(true);
  });

  // (5) attributes are sanitized/redacted BEFORE they are retained or exported.
  it('(5) attributes are redacted before storage/export', () => {
    const t = new InMemoryTelemetry();
    t.incrementCounter('authz.denied.count', 1, {
      action: 'workflow.read',
      secret: 'hunter2',
    });
    const signal = t.signalsNamed('authz.denied.count')[0]!;
    expect(signal.attributes['action']).toBe('workflow.read');
    expect(signal.attributes['secret']).toBe('[REDACTED]');
  });

  // (6) a bearer-token-like attribute is redacted.
  it('(6) a bearer token attribute is redacted', () => {
    const t = new InMemoryTelemetry();
    t.recordEvent('authz.denied', { authorization: 'Bearer eyJabc.def.ghi' });
    const signal = t.signalsNamed('authz.denied')[0]!;
    expect(signal.attributes['authorization']).toBe('[REDACTED]');
    expect(JSON.stringify(signal)).not.toContain('eyJabc');
  });

  // (7) a connection-string-like attribute is redacted.
  it('(7) a connection string attribute is redacted', () => {
    const t = new InMemoryTelemetry();
    t.incrementCounter('outbox.batch.count', 1, {
      connectionString: 'Endpoint=sb://x.servicebus.windows.net/;SharedAccessKey=abc==',
    });
    const signal = t.signalsNamed('outbox.batch.count')[0]!;
    expect(signal.attributes['connectionString']).toBe('[REDACTED]');
    expect(JSON.stringify(signal)).not.toContain('SharedAccessKey');
  });

  // (22) an exporter that throws never breaks the emitting (business) operation.
  it('(22) a telemetry exporter failure does not break the caller', () => {
    const throwingExporter: TelemetryExporter = {
      export(_signal: TelemetrySignal): void {
        throw new Error('exporter exploded');
      },
    };
    const t = new ExportingTelemetry(throwingExporter);
    expect(() => t.incrementCounter('http.request.count', 1)).not.toThrow();
    expect(() => t.recordDuration('http.request.duration_ms', 1)).not.toThrow();
    expect(() => t.recordEvent('authz.denied')).not.toThrow();
  });

  // (23) no telemetry name encodes sport/domain-specific terminology.
  it('(23) no telemetry name uses sport/domain-specific terminology', () => {
    const FORBIDDEN = [
      'ptso',
      'club',
      'curl',
      'curler',
      'bonspiel',
      'rink',
      'sheet',
      'skip',
      'hockey',
      'soccer',
      'athlete',
    ];
    for (const name of ALL_TELEMETRY_NAMES) {
      for (const term of FORBIDDEN) {
        expect(name.toLowerCase()).not.toContain(term);
      }
    }
  });

  // sanitize helper drops non-primitive + undefined values.
  it('sanitizeTelemetryAttributes drops undefined and non-primitive values', () => {
    const out = sanitizeTelemetryAttributes({
      a: 'x',
      b: 1,
      c: true,
      d: null,
      e: undefined,
      f: { nested: 'no' } as unknown as string,
    });
    expect(out).toEqual({ a: 'x', b: 1, c: true, d: null });
  });

  // factory honors the exporter selection (noop/memory/console) and the disabled switch.
  it('createTelemetry returns a no-op when disabled or exporter=noop', () => {
    const disabled = createTelemetry({ enabled: false, exporter: 'console', includeDebugAttributes: false });
    expect(disabled).toBeInstanceOf(NoopTelemetry);
    const noop = createTelemetry({ enabled: true, exporter: 'noop', includeDebugAttributes: false });
    expect(noop).toBeInstanceOf(NoopTelemetry);
    const memory = createTelemetry({ enabled: true, exporter: 'memory', includeDebugAttributes: false });
    expect(memory).toBeInstanceOf(InMemoryTelemetry);
  });

  it('createTelemetry console exporter writes a sanitized single-line record to the sink', () => {
    const lines: string[] = [];
    const t = createTelemetry({
      enabled: true,
      exporter: 'console',
      includeDebugAttributes: false,
      consoleSink: (line) => lines.push(line),
    });
    t.incrementCounter('http.request.count', 1, { route: 'GET /x', authorization: 'Bearer zzz' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('http.request.count');
    expect(lines[0]).not.toContain('Bearer zzz');
    expect(lines[0]).toContain('[REDACTED]');
  });
});
