/**
 * Observability barrel.
 *
 * Re-exports the vendor-neutral telemetry layer: the {@link Telemetry} interface and its
 * primitives, the no-op/in-memory/console exporters, the factory, and the stable name
 * constants. Consumers import from here so internal file layout can evolve freely.
 */

export {
  type Telemetry,
  type TelemetryAttributes,
  type TelemetryAttributeValue,
  type TelemetryExporter,
  type TelemetrySignal,
  type TelemetrySignalKind,
  ExportingTelemetry,
  sanitizeTelemetryAttributes,
  startStopwatch,
} from './Telemetry.js';
export { NoopTelemetry, NOOP_TELEMETRY } from './NoopTelemetry.js';
export { InMemoryTelemetry, type CapturedSignal } from './InMemoryTelemetry.js';
export {
  ConsoleTelemetryExporter,
  type TelemetryLogSink,
} from './ConsoleTelemetryExporter.js';
export {
  createTelemetry,
  type TelemetryExporterMode,
  type TelemetryFactoryOptions,
} from './TelemetryFactory.js';
export {
  TelemetryCounters,
  TelemetryDurations,
  TelemetryEvents,
  TelemetryAttributeKeys,
  TelemetryResult,
  ALL_TELEMETRY_NAMES,
} from './TelemetryEvents.js';
