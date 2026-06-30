/**
 * Console telemetry exporter.
 *
 * Writes sanitized signals to a log sink (stdout by default) as single-line JSON. Signals are
 * already attribute-sanitized and secret-redacted by {@link ExportingTelemetry}; this exporter
 * re-applies {@link redactSecrets} to the serialized record as defense-in-depth so nothing
 * secret can reach the log even if a future caller bypasses the base. It performs NO network
 * I/O and contacts NO telemetry vendor — it is a local, deterministic sink.
 */

import { redactSecrets } from '../shared/security/redaction.js';
import type { TelemetryExporter, TelemetrySignal } from './Telemetry.js';

/** Minimal log sink so the exporter stays decoupled from any concrete logger. */
export type TelemetryLogSink = (line: string) => void;

const DEFAULT_SINK: TelemetryLogSink = (line: string): void => {
  // A single-line, structured record. No secrets: attributes are pre-redacted.
  console.log(line);
};

export class ConsoleTelemetryExporter implements TelemetryExporter {
  private readonly sink: TelemetryLogSink;

  constructor(sink: TelemetryLogSink = DEFAULT_SINK) {
    this.sink = sink;
  }

  export(signal: TelemetrySignal): void {
    const record = redactSecrets({
      telemetry: signal.kind,
      name: signal.name,
      ...(signal.value !== undefined ? { value: signal.value } : {}),
      attributes: signal.attributes,
    });
    this.sink(JSON.stringify(record));
  }
}
