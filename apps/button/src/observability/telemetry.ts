/**
 * Frontend observability for the Button.
 *
 * Emits low-cardinality, representative-safe signals ONLY: a route id, a stable error category, a
 * correlation id, the active locale, and whether an organization context is present. It NEVER
 * records subject identifiers, organization ids, tokens, raw error detail, or cross-tenant data.
 *
 * The default sink forwards to `console.info` (dev) and is fully injectable so tests can assert on
 * emitted events without any network or console noise.
 */

import type { ButtonLocale } from '../api/types';

export type ButtonTelemetryEvent =
  | 'context.load.success'
  | 'context.load.failure'
  | 'route.load.failure'
  | 'route.denied'
  | 'authority.expired'
  | 'locale.switch'
  | 'locale.switch.failure'
  | 'context.selection.failure'
  | 'retry.exhausted';

export interface ButtonTelemetryAttributes {
  readonly routeId?: string;
  readonly errorCategory?: string;
  readonly correlationId?: string;
  readonly locale?: ButtonLocale;
  readonly hasOrgContext?: boolean;
}

export interface ButtonTelemetry {
  record(event: ButtonTelemetryEvent, attributes?: ButtonTelemetryAttributes): void;
}

/** Test/diagnostic sink retaining events in memory. */
export class InMemoryButtonTelemetry implements ButtonTelemetry {
  readonly events: { event: ButtonTelemetryEvent; attributes: ButtonTelemetryAttributes }[] = [];
  record(event: ButtonTelemetryEvent, attributes: ButtonTelemetryAttributes = {}): void {
    this.events.push({ event, attributes });
  }
}

/** Development sink: logs sanitized attributes only. */
export class ConsoleButtonTelemetry implements ButtonTelemetry {
  record(event: ButtonTelemetryEvent, attributes: ButtonTelemetryAttributes = {}): void {
    console.info(`[button] ${event}`, attributes);
  }
}

/** Generate a correlation id for a client-side flow (safe to log). */
export function newCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `btn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
