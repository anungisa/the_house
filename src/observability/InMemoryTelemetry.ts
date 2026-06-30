/**
 * In-memory telemetry (test/diagnostic exporter).
 *
 * Retains every emitted signal in process memory so tests can assert on counters, durations,
 * and events without any I/O. Attributes are sanitized + redacted by {@link ExportingTelemetry}
 * BEFORE they are retained here, so the snapshot is guaranteed secret-free — exactly what the
 * redaction tests inspect. This exporter is hermetic: no console, no network, no disk.
 */

import {
  ExportingTelemetry,
  type TelemetryExporter,
  type TelemetrySignal,
} from './Telemetry.js';

/** A retained, already-sanitized signal plus the order it arrived in. */
export interface CapturedSignal extends TelemetrySignal {
  readonly sequence: number;
}

class InMemoryExporter implements TelemetryExporter {
  readonly signals: CapturedSignal[] = [];
  private sequence = 0;

  export(signal: TelemetrySignal): void {
    this.signals.push({ ...signal, sequence: this.sequence++ });
  }
}

/**
 * Telemetry that records into memory. Exposes typed read accessors so tests can make precise
 * assertions (counter totals, recorded durations, events by name) without reaching into the
 * exporter directly.
 */
export class InMemoryTelemetry extends ExportingTelemetry {
  private readonly memory: InMemoryExporter;

  constructor() {
    const exporter = new InMemoryExporter();
    super(exporter);
    this.memory = exporter;
  }

  /** All captured signals in arrival order (sanitized). */
  snapshot(): readonly CapturedSignal[] {
    return [...this.memory.signals];
  }

  /** Captured signals of one kind. */
  signalsOfKind(kind: TelemetrySignal['kind']): readonly CapturedSignal[] {
    return this.memory.signals.filter((s) => s.kind === kind);
  }

  /** Captured signals matching a metric/event name. */
  signalsNamed(name: string): readonly CapturedSignal[] {
    return this.memory.signals.filter((s) => s.name === name);
  }

  /** Summed counter value for a given counter name (0 when never emitted). */
  counterTotal(name: string): number {
    return this.memory.signals
      .filter((s) => s.kind === 'counter' && s.name === name)
      .reduce((total, s) => total + (s.value ?? 0), 0);
  }

  /** All recorded duration values (ms) for a given duration name. */
  durations(name: string): readonly number[] {
    return this.memory.signals
      .filter((s) => s.kind === 'duration' && s.name === name)
      .map((s) => s.value ?? 0);
  }

  /** Whether at least one event with the given name was recorded. */
  hasEvent(name: string): boolean {
    return this.memory.signals.some((s) => s.kind === 'event' && s.name === name);
  }

  /** Drop all retained signals (useful between assertions in a long test). */
  clear(): void {
    this.memory.signals.length = 0;
  }
}
