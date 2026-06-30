/**
 * Centralized telemetry core (vendor-neutral observability).
 *
 * This is operational VISIBILITY, not governance state. Telemetry never writes to governed
 * lifecycle tables, never influences authorization/workflow/quarantine decisions, and never
 * contacts an external system by default. It exposes three primitives — counters, durations,
 * and operational events — behind a tiny {@link Telemetry} interface that the rest of the
 * platform depends on. The default runtime exporter is console; tests use in-memory or no-op.
 *
 * Safety guarantees baked in here:
 *  - Attributes are coerced to JSON-safe primitives and passed through {@link redactSecrets}
 *    BEFORE they reach any exporter, so bearer tokens, connection strings, and secret-like
 *    keys never leave the process in cleartext.
 *  - Emission is fail-safe: an exporter that throws is swallowed (optionally logged) and NEVER
 *    propagates into the business operation that emitted the signal.
 *
 * No telemetry vendor SDK, OpenTelemetry Collector, or Prometheus server is wired in this
 * pass — only the seam to add one later.
 */

import { performance } from 'node:perf_hooks';

import { redactSecrets } from '../shared/security/redaction.js';

/** JSON-safe attribute values. `undefined` entries are dropped during sanitization. */
export type TelemetryAttributeValue = string | number | boolean | null | undefined;

/** A flat, JSON-safe, low-cardinality attribute bag attached to a signal. */
export type TelemetryAttributes = Readonly<Record<string, TelemetryAttributeValue>>;

/** The kind of signal emitted. */
export type TelemetrySignalKind = 'counter' | 'duration' | 'event';

/** A single redacted, JSON-safe telemetry signal handed to an exporter. */
export interface TelemetrySignal {
  readonly kind: TelemetrySignalKind;
  readonly name: string;
  /** Counter increment or duration in milliseconds; absent for events. */
  readonly value?: number;
  readonly attributes: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * The three telemetry primitives the platform depends on. Implementations MUST NOT throw into
 * the caller — emission is best-effort and side-effect-only.
 */
export interface Telemetry {
  incrementCounter(name: string, value?: number, attributes?: TelemetryAttributes): void;
  recordDuration(name: string, milliseconds: number, attributes?: TelemetryAttributes): void;
  recordEvent(name: string, attributes?: TelemetryAttributes): void;
}

/** Sink for fully-sanitized signals. Exporters may be swapped (no-op, memory, console). */
export interface TelemetryExporter {
  export(signal: TelemetrySignal): void;
}

/**
 * Coerce an arbitrary attribute bag into a flat, JSON-safe, redacted record. Drops `undefined`
 * values and any non-primitive value (to avoid high-cardinality/unsafe payloads), then runs the
 * shared secret redactor so secret-like keys and URL credentials are scrubbed.
 */
export function sanitizeTelemetryAttributes(
  attributes: TelemetryAttributes | undefined,
): Readonly<Record<string, string | number | boolean | null>> {
  if (attributes === undefined) return {};
  const flat: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      flat[key] = value;
    }
    // Non-primitive values are intentionally dropped (no objects/arrays in metric attributes).
  }
  // Defense-in-depth: redact secret-like keys and embedded URL credentials before export.
  return redactSecrets(flat);
}

/**
 * Base {@link Telemetry} that sanitizes attributes and forwards signals to a {@link TelemetryExporter},
 * swallowing any exporter error so business operations are never affected by telemetry failures.
 */
export class ExportingTelemetry implements Telemetry {
  private readonly exporter: TelemetryExporter;
  private readonly onExportError: ((error: unknown) => void) | undefined;

  constructor(exporter: TelemetryExporter, onExportError?: (error: unknown) => void) {
    this.exporter = exporter;
    this.onExportError = onExportError;
  }

  incrementCounter(name: string, value = 1, attributes?: TelemetryAttributes): void {
    this.safeExport({
      kind: 'counter',
      name,
      value,
      attributes: sanitizeTelemetryAttributes(attributes),
    });
  }

  recordDuration(name: string, milliseconds: number, attributes?: TelemetryAttributes): void {
    this.safeExport({
      kind: 'duration',
      name,
      value: milliseconds,
      attributes: sanitizeTelemetryAttributes(attributes),
    });
  }

  recordEvent(name: string, attributes?: TelemetryAttributes): void {
    this.safeExport({
      kind: 'event',
      name,
      attributes: sanitizeTelemetryAttributes(attributes),
    });
  }

  private safeExport(signal: TelemetrySignal): void {
    try {
      this.exporter.export(signal);
    } catch (error) {
      // Telemetry must never break the operation that emitted it.
      if (this.onExportError !== undefined) {
        try {
          this.onExportError(error);
        } catch {
          // Even the error hook is best-effort.
        }
      }
    }
  }
}

/**
 * A monotonic stopwatch for duration metrics. Returns a function that yields elapsed
 * milliseconds since creation. Uses a monotonic clock (not wall time), safe under clock skew.
 */
export function startStopwatch(): () => number {
  const started = performance.now();
  return () => performance.now() - started;
}
