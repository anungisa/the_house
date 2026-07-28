/**
 * StandingActivationOrchestrator — governed cross-aggregate projection proofs (hermetic).
 *
 * These cover the Slice A invariants: an ACTIVATED affiliation is projected into a governed standing
 * ONLY through the kernel; the standing identity is deterministic (one per tenant + subject +
 * season); duplicate/replayed activations converge on ONE standing with no duplicate history; a
 * GOVERNED rejection is terminal and visible (never auto-retried); and a TRANSIENT failure is
 * rescheduled with true full jitter until retries are exhausted. Cross-tenant discovery, RLS, and
 * concurrency are proven against Postgres in the gated integration suite. All data is synthetic.
 */

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildStandingKernelHarness } from '../../../helpers/affiliationStandingKernel.js';
import {
  InMemoryStandingProjectionStore,
  StandingActivationOrchestrator,
  deterministicStandingId,
  type StandingActivationEvent,
  type StandingOpenPort,
} from '../../../../src/domains/affiliation-standing/orchestration/index.js';
import type {
  StandingTransitionRequest,
  StandingTransitionResponse,
} from '../../../../src/domains/affiliation-standing/index.js';

const RETRY = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 1000 } as const;

function makeEvent(overrides: Partial<StandingActivationEvent> = {}): StandingActivationEvent {
  return {
    tenantId: overrides.tenantId ?? '33333333-3333-3333-3333-333333333333',
    affiliationApplicationId: overrides.affiliationApplicationId ?? randomUUID(),
    subjectId: overrides.subjectId ?? randomUUID(),
    season: overrides.season ?? '2025-26',
    attempts: overrides.attempts ?? 0,
    ...(overrides.stateTransitionId !== undefined
      ? { stateTransitionId: overrides.stateTransitionId }
      : { stateTransitionId: randomUUID() }),
    ...(overrides.correlationId !== undefined ? { correlationId: overrides.correlationId } : {}),
    ...(overrides.causationId !== undefined ? { causationId: overrides.causationId } : {}),
  };
}

function countOpenOutbox(
  h: ReturnType<typeof buildStandingKernelHarness>,
  standingId: string,
): number {
  return h.govStore.outboxRecords.filter((r) => r.payload['entityId'] === standingId).length;
}

describe('StandingActivationOrchestrator — projects an activation into a governed standing', () => {
  it('opens the standing through the kernel at the deterministic identity and records projected', async () => {
    const h = buildStandingKernelHarness();
    const projections = new InMemoryStandingProjectionStore();
    const orch = new StandingActivationOrchestrator({
      standing: h.service,
      projections,
      clock: h.clock,
      retry: RETRY,
    });
    const event = makeEvent({ tenantId: h.tenantId });

    const result = await orch.handleActivation(event);

    const standingId = deterministicStandingId(h.tenantId, event.subjectId, event.season);
    expect(result.outcome).toBe('projected');
    expect(result.standingId).toBe(standingId);

    // The standing was opened ONLY through the kernel (head + governed state + one outbox message).
    const head = await h.standingStore.getStanding(h.tenantId, standingId);
    expect(head?.id).toBe(standingId);
    expect(head?.affiliationApplicationId).toBe(event.affiliationApplicationId);
    expect(
      h.govStore.entityStateSnapshots.find(
        (e) => e.entityType === 'AffiliationStanding' && e.entityId === standingId,
      )?.currentState,
    ).toBe('pending');

    const proj = await projections.getByApplication(h.tenantId, event.affiliationApplicationId);
    expect(proj?.status).toBe('projected');
    expect(proj?.attempts).toBe(1);
    expect(proj?.standingId).toBe(standingId);
    expect(proj?.projectedAtMs).toBeDefined();
  });

  it('is idempotent under duplicate/replayed delivery: one standing, one period, one open', async () => {
    const h = buildStandingKernelHarness();
    const projections = new InMemoryStandingProjectionStore();
    const orch = new StandingActivationOrchestrator({
      standing: h.service,
      projections,
      clock: h.clock,
      retry: RETRY,
    });
    const event = makeEvent({ tenantId: h.tenantId });

    const first = await orch.handleActivation(event);
    // Re-deliver the SAME activation (attempts carried forward as it would be from the store).
    const second = await orch.handleActivation({ ...event, attempts: 1 });

    const standingId = deterministicStandingId(h.tenantId, event.subjectId, event.season);
    expect(first.outcome).toBe('projected');
    expect(second.outcome).toBe('projected');
    expect(second.standingId).toBe(standingId);

    // No duplication: exactly one standing head, one period, one governed open enqueued.
    expect(h.standingStore.periodCount(h.tenantId, standingId)).toBe(1);
    expect(countOpenOutbox(h, standingId)).toBe(1);
  });

  it('converges two applications for the same subject+season onto ONE standing (deterministic id)', async () => {
    const h = buildStandingKernelHarness();
    const projections = new InMemoryStandingProjectionStore();
    const orch = new StandingActivationOrchestrator({
      standing: h.service,
      projections,
      clock: h.clock,
      retry: RETRY,
    });
    const subjectId = randomUUID();
    const season = '2025-26';
    const app1 = makeEvent({ tenantId: h.tenantId, subjectId, season });
    const app2 = makeEvent({ tenantId: h.tenantId, subjectId, season });

    const r1 = await orch.handleActivation(app1);
    const r2 = await orch.handleActivation(app2);

    const standingId = deterministicStandingId(h.tenantId, subjectId, season);
    expect(r1.standingId).toBe(standingId);
    expect(r2.standingId).toBe(standingId);
    // Both resolve the same standing; only one standing/period/open exists.
    expect(h.standingStore.periodCount(h.tenantId, standingId)).toBe(1);
    expect(countOpenOutbox(h, standingId)).toBe(1);
  });

  it('derives a distinct standing identity per season for the same subject', async () => {
    const h = buildStandingKernelHarness();
    const subjectId = randomUUID();
    expect(deterministicStandingId(h.tenantId, subjectId, '2024-25')).not.toBe(
      deterministicStandingId(h.tenantId, subjectId, '2025-26'),
    );
  });
});

describe('StandingActivationOrchestrator — reconcilable failure posture', () => {
  it('records a GOVERNED rejection as terminal failure and does NOT retry', async () => {
    const projections = new InMemoryStandingProjectionStore();
    const rejecting: StandingOpenPort = {
      openStanding: (_req: StandingTransitionRequest): Promise<StandingTransitionResponse> =>
        Promise.resolve({
          status: 'rejected',
          standingId: 'x',
          code: 'PERMISSION_DENIED',
          message: 'actor lacks standing_registrar',
        }),
    };
    const clock = { now: () => 1000, nowIso: () => new Date(1000).toISOString() };
    const orch = new StandingActivationOrchestrator({
      standing: rejecting,
      projections,
      clock,
      retry: RETRY,
    });
    const event = makeEvent();

    const result = await orch.handleActivation(event);

    expect(result.outcome).toBe('governed_failure');
    expect(result.error).toContain('PERMISSION_DENIED');
    const proj = await projections.getByApplication(event.tenantId, event.affiliationApplicationId);
    expect(proj?.status).toBe('failed');
    expect(proj?.attempts).toBe(1);
    // Visible to reconciliation.
    const unreconciled = await projections.listUnreconciled(event.tenantId, 10);
    expect(unreconciled).toHaveLength(1);
  });

  it('reschedules a TRANSIENT failure with backoff (pending, future next attempt)', async () => {
    const projections = new InMemoryStandingProjectionStore();
    const throwing: StandingOpenPort = {
      openStanding: (): Promise<StandingTransitionResponse> => {
        throw new Error('connection reset');
      },
    };
    const clock = { now: () => 5000, nowIso: () => new Date(5000).toISOString() };
    const orch = new StandingActivationOrchestrator({
      standing: throwing,
      projections,
      clock,
      retry: RETRY,
      random: () => 0.5, // deterministic jitter
    });
    const event = makeEvent({ attempts: 0 });

    const result = await orch.handleActivation(event);

    expect(result.outcome).toBe('retry_scheduled');
    expect(result.nextAttemptAtMs).toBeGreaterThan(5000);
    const proj = await projections.getByApplication(event.tenantId, event.affiliationApplicationId);
    expect(proj?.status).toBe('pending');
    expect(proj?.attempts).toBe(1);
    expect(proj?.lastError).toContain('connection reset');
  });

  it('marks a TRANSIENT failure as exhausted once maxRetries is exceeded', async () => {
    const projections = new InMemoryStandingProjectionStore();
    const throwing: StandingOpenPort = {
      openStanding: (): Promise<StandingTransitionResponse> => {
        throw new Error('still failing');
      },
    };
    const clock = { now: () => 9000, nowIso: () => new Date(9000).toISOString() };
    const orch = new StandingActivationOrchestrator({
      standing: throwing,
      projections,
      clock,
      retry: RETRY,
    });
    // Already at maxRetries; the next attempt (maxRetries + 1) exhausts.
    const event = makeEvent({ attempts: RETRY.maxRetries });

    const result = await orch.handleActivation(event);

    expect(result.outcome).toBe('exhausted');
    const proj = await projections.getByApplication(event.tenantId, event.affiliationApplicationId);
    expect(proj?.status).toBe('failed');
    expect(proj?.lastError).toContain('retries exhausted');
  });
});
