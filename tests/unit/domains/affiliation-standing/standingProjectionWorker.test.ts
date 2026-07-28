/**
 * StandingProjectionWorker — batch drain proofs (hermetic).
 *
 * The worker polls the activation source and projects each due event through the orchestrator,
 * tallying outcomes. These proofs confirm the summary accounting and that duplicate delivery within
 * a batch converges on ONE standing (deterministic identity + kernel idempotency). All synthetic.
 */

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildStandingKernelHarness } from '../../../helpers/affiliationStandingKernel.js';
import {
  InMemoryActivationEventSource,
  InMemoryStandingProjectionStore,
  StandingActivationOrchestrator,
  StandingProjectionWorker,
  deterministicStandingId,
  type StandingActivationEvent,
} from '../../../../src/domains/affiliation-standing/orchestration/index.js';

const RETRY = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 } as const;

function event(
  tenantId: string,
  overrides: Partial<StandingActivationEvent> = {},
): StandingActivationEvent {
  return {
    tenantId,
    affiliationApplicationId: overrides.affiliationApplicationId ?? randomUUID(),
    subjectId: overrides.subjectId ?? randomUUID(),
    season: overrides.season ?? '2025-26',
    attempts: overrides.attempts ?? 0,
  };
}

describe('StandingProjectionWorker.processBatch', () => {
  it('projects every due activation and tallies the summary', async () => {
    const h = buildStandingKernelHarness();
    const source = new InMemoryActivationEventSource([
      event(h.tenantId),
      event(h.tenantId),
      event(h.tenantId),
    ]);
    const orchestrator = new StandingActivationOrchestrator({
      standing: h.service,
      projections: new InMemoryStandingProjectionStore(),
      clock: h.clock,
      retry: RETRY,
    });
    const worker = new StandingProjectionWorker({ source, orchestrator, batchSize: 10 });

    const summary = await worker.processBatch();

    expect(summary).toEqual({
      claimed: 3,
      projected: 3,
      governedFailures: 0,
      retries: 0,
      exhausted: 0,
    });
  });

  it('respects the batch size', async () => {
    const h = buildStandingKernelHarness();
    const source = new InMemoryActivationEventSource([
      event(h.tenantId),
      event(h.tenantId),
      event(h.tenantId),
    ]);
    const orchestrator = new StandingActivationOrchestrator({
      standing: h.service,
      projections: new InMemoryStandingProjectionStore(),
      clock: h.clock,
      retry: RETRY,
    });
    const worker = new StandingProjectionWorker({ source, orchestrator, batchSize: 2 });

    const summary = await worker.processBatch();
    expect(summary.claimed).toBe(2);
    expect(summary.projected).toBe(2);
  });

  it('a re-poll of the same activation converges on one standing (idempotent duplicate delivery)', async () => {
    const h = buildStandingKernelHarness();
    const e = event(h.tenantId);
    // The in-memory source re-yields the same event on every poll (mirrors the Pg source until a
    // projection exists), so two batches simulate at-least-once duplicate delivery.
    const source = new InMemoryActivationEventSource([e]);
    const orchestrator = new StandingActivationOrchestrator({
      standing: h.service,
      projections: new InMemoryStandingProjectionStore(),
      clock: h.clock,
      retry: RETRY,
    });
    const worker = new StandingProjectionWorker({ source, orchestrator, batchSize: 10 });

    await worker.processBatch();
    await worker.processBatch();

    const standingId = deterministicStandingId(h.tenantId, e.subjectId, e.season);
    expect(h.standingStore.periodCount(h.tenantId, standingId)).toBe(1);
    expect(
      h.govStore.outboxRecords.filter((r) => r.payload['entityId'] === standingId),
    ).toHaveLength(1);
  });
});
