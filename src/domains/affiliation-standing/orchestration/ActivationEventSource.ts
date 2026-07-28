/**
 * Activation event source — the projection's inbound feed of activation events that still need a
 * standing.
 *
 * The projection worker runs CROSS-TENANT and at-least-once: it polls for activation events whose
 * standing has not yet been established (or whose retry is now due). The source is a port so the
 * runtime (PostgreSQL, cross-tenant discovery) and tests (in-memory queue) are interchangeable.
 */

import type { StandingActivationEvent } from './StandingActivationEvent.js';

export interface ActivationEventSource {
  /**
   * Return up to `limit` activation events that are DUE for projection: never-projected activations
   * plus 'pending' projections whose next attempt time has arrived. Read-only; discovery must not
   * mutate governed state or the outbox.
   */
  pollDue(limit: number): Promise<readonly StandingActivationEvent[]>;
}
