/**
 * No-op telemetry.
 *
 * The safe default everywhere a telemetry dependency is optional. It accepts every primitive
 * and does nothing — no allocation beyond the call, no I/O, no retention. Used in tests that
 * do not assert on telemetry and as the fallback when observability is disabled.
 */

import type { Telemetry, TelemetryAttributes } from './Telemetry.js';

export class NoopTelemetry implements Telemetry {
  incrementCounter(_name: string, _value?: number, _attributes?: TelemetryAttributes): void {
    // intentionally empty
  }

  recordDuration(_name: string, _milliseconds: number, _attributes?: TelemetryAttributes): void {
    // intentionally empty
  }

  recordEvent(_name: string, _attributes?: TelemetryAttributes): void {
    // intentionally empty
  }
}

/** Shared singleton — the no-op carries no state, so one instance is enough. */
export const NOOP_TELEMETRY: Telemetry = new NoopTelemetry();
