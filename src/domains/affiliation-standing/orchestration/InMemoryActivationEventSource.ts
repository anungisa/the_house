/**
 * In-memory {@link ActivationEventSource} — a simple queue for unit tests.
 *
 * Tests enqueue {@link StandingActivationEvent}s; `pollDue` returns up to `limit` of them WITHOUT
 * removing them (mirroring the Pg source, which re-discovers the SAME activation until a projection
 * exists). This lets a test call `pollDue` repeatedly to exercise duplicate/replayed delivery.
 */

import type { ActivationEventSource } from './ActivationEventSource.js';
import type { StandingActivationEvent } from './StandingActivationEvent.js';

export class InMemoryActivationEventSource implements ActivationEventSource {
  private readonly events: StandingActivationEvent[] = [];

  constructor(initial: readonly StandingActivationEvent[] = []) {
    this.events.push(...initial);
  }

  /** Enqueue an activation event to be discovered on the next poll. */
  enqueue(event: StandingActivationEvent): void {
    this.events.push(event);
  }

  pollDue(limit: number): Promise<readonly StandingActivationEvent[]> {
    return Promise.resolve(this.events.slice(0, Math.max(0, limit)));
  }
}
