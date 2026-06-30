/**
 * Telemetry factory.
 *
 * Selects a concrete {@link Telemetry} from configuration. The factory is the only place that
 * maps the `exporter` enum to an implementation, so the rest of the platform depends solely on
 * the {@link Telemetry} interface. When observability is disabled the factory returns a no-op,
 * making "off" a first-class, allocation-free mode.
 *
 * Allowed exporters in this pass: `noop`, `memory`, `console`. There is no vendor exporter and
 * no network sink — adding one later means a new case here plus a config enum value.
 */

import { ConsoleTelemetryExporter, type TelemetryLogSink } from './ConsoleTelemetryExporter.js';
import { ExportingTelemetry, type Telemetry } from './Telemetry.js';
import { InMemoryTelemetry } from './InMemoryTelemetry.js';
import { NoopTelemetry } from './NoopTelemetry.js';

/** Exporter modes supported this pass. Kept in sync with the config enum (fail-closed). */
export type TelemetryExporterMode = 'noop' | 'memory' | 'console';

/** Structural view of the observability config the factory needs (decoupled from AppConfig). */
export interface TelemetryFactoryOptions {
  readonly enabled: boolean;
  readonly exporter: TelemetryExporterMode;
  /** Reserved for future debug-attribute expansion; accepted now for forward-compat wiring. */
  readonly includeDebugAttributes: boolean;
  /** Optional console sink override (tests inject a buffer; runtime uses stdout). */
  readonly consoleSink?: TelemetryLogSink;
  /** Optional hook invoked when an exporter throws (defaults to swallow-silently). */
  readonly onExportError?: (error: unknown) => void;
}

/**
 * Build a {@link Telemetry} from options. Returns a {@link NoopTelemetry} when disabled or when
 * the exporter is `noop`. The `console` exporter writes structured single-line JSON; the
 * `memory` exporter retains signals for inspection (primarily tests/diagnostics).
 */
export function createTelemetry(options: TelemetryFactoryOptions): Telemetry {
  if (!options.enabled || options.exporter === 'noop') {
    return new NoopTelemetry();
  }
  if (options.exporter === 'memory') {
    return new InMemoryTelemetry();
  }
  // console
  const exporter =
    options.consoleSink !== undefined
      ? new ConsoleTelemetryExporter(options.consoleSink)
      : new ConsoleTelemetryExporter();
  return new ExportingTelemetry(exporter, options.onExportError);
}
