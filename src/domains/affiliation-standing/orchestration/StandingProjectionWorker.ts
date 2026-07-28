/**
 * Standing projection worker — drains DUE activation events and projects each into a governed
 * standing via the {@link StandingActivationOrchestrator}.
 *
 * This is the operational batch the projection runtime schedules (mirroring the outbox worker). It
 * is deliberately thin: poll the source for due activations, orchestrate each, and tally the
 * outcomes. It holds NO governed authority of its own — every standing is opened through the kernel
 * inside the orchestrator. It is safe under duplicate delivery and concurrent workers: the
 * deterministic standing identity + the kernel's idempotency make repeated projection of the same
 * activation converge on ONE standing.
 */

import type { ActivationEventSource } from './ActivationEventSource.js';
import type { StandingActivationOrchestrator } from './StandingActivationOrchestrator.js';

export interface StandingProjectionBatchSummary {
  /** Activation events discovered as due this batch. */
  readonly claimed: number;
  /** Standings opened (or idempotently replayed). */
  readonly projected: number;
  /** Terminal governed failures (rejection / approval-required). */
  readonly governedFailures: number;
  /** Transient failures rescheduled for a later attempt. */
  readonly retries: number;
  /** Transient failures that exceeded maxRetries (terminal, visible). */
  readonly exhausted: number;
}

export interface StandingProjectionWorkerDeps {
  readonly source: ActivationEventSource;
  readonly orchestrator: StandingActivationOrchestrator;
  /** Maximum activations to process per batch. Must be > 0. */
  readonly batchSize: number;
}

export class StandingProjectionWorker {
  private readonly source: ActivationEventSource;
  private readonly orchestrator: StandingActivationOrchestrator;
  private readonly batchSize: number;

  constructor(deps: StandingProjectionWorkerDeps) {
    this.source = deps.source;
    this.orchestrator = deps.orchestrator;
    this.batchSize = deps.batchSize;
  }

  /** Process one batch of due activations. Never throws for a single-event failure — a transient
   *  fault is captured as a rescheduled retry by the orchestrator. */
  async processBatch(): Promise<StandingProjectionBatchSummary> {
    const events = await this.source.pollDue(this.batchSize);
    let projected = 0;
    let governedFailures = 0;
    let retries = 0;
    let exhausted = 0;

    for (const event of events) {
      const result = await this.orchestrator.handleActivation(event);
      switch (result.outcome) {
        case 'projected':
          projected += 1;
          break;
        case 'governed_failure':
          governedFailures += 1;
          break;
        case 'retry_scheduled':
          retries += 1;
          break;
        case 'exhausted':
          exhausted += 1;
          break;
      }
    }

    return { claimed: events.length, projected, governedFailures, retries, exhausted };
  }
}
