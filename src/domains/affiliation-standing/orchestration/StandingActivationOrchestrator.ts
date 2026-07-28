/**
 * Standing activation orchestrator — the idempotent projection of an ACTIVATED affiliation into a
 * governed AffiliationStanding.
 *
 * Preferred model (V2 cross-aggregate orchestration):
 *   AffiliationApplication activation → transactional outbox event → THIS orchestrator → resolve the
 *   DETERMINISTIC standing identity → request the governed standing `open` through the kernel →
 *   reconcile success / retry / governed failure.
 *
 * Invariants this enforces:
 *  - ONE standing per (tenant, subject, season): the standing id is derived deterministically, so a
 *    duplicate or replayed activation resolves to the SAME id and (with the kernel's idempotency +
 *    exactly-once activation serialization) cannot create a second standing.
 *  - NO direct mutation of governed state: the standing is opened ONLY through the Governance Kernel
 *    (via {@link StandingOpenPort}); this orchestrator only records reconcilable bookkeeping.
 *  - At-least-once, reconcilable: a GOVERNED rejection is terminal and visible (never auto-retried);
 *    a TRANSIENT/infra failure is rescheduled with TRUE FULL JITTER until retries are exhausted.
 *  - Correlation/causation preserved: propagated into the governed `open` request.
 *
 * Intentional v1 stubs (tracked; policy-derived values arrive in a later increment):
 *  - `pathway` defaults to `new_affiliation` (a first standing from an activation). Policy-derived
 *    continuity / renewal-with-remediation pathways are NOT computed here.
 *  - The effective period is derived from the clock: `effectiveFrom = now`,
 *    `effectiveUntil = now + termDays` (default 365). Season-calendar-derived terms are future work.
 */

import { fullJitterDelayMs } from '../../../workers/outbox/backoff.js';
import type { Clock } from '../../../shared/time/clock.js';
import type { StandingTransitionRequest, StandingTransitionResponse } from '../index.js';
import {
  SYSTEM_STANDING_ORCHESTRATOR_USER_ID,
  deterministicStandingId,
  standingOpenIdempotencyKey,
  type StandingActivationEvent,
} from './StandingActivationEvent.js';
import type { StandingProjectionStore, StandingProjectionUpsert } from './StandingProjectionStore.js';

/** The narrow kernel-backed surface the orchestrator needs: request the governed standing `open`. */
export interface StandingOpenPort {
  openStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse>;
}

/** Retry/backoff mechanics for TRANSIENT projection failures (true full jitter). */
export interface ProjectionRetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export interface StandingActivationOrchestratorDeps {
  readonly standing: StandingOpenPort;
  readonly projections: StandingProjectionStore;
  readonly clock: Clock;
  readonly retry: ProjectionRetryConfig;
  /** Injectable RNG for deterministic jitter in tests (defaults to Math.random via backoff). */
  readonly random?: () => number;
  /** Standing term length in days used to derive the effective period (default 365). */
  readonly termDays?: number;
  /** The system principal id used for the governed `open` (defaults to the projection system id). */
  readonly systemActorUserId?: string;
}

/** The reconciled outcome of projecting one activation. */
export type ProjectionOutcome =
  | 'projected' // standing opened (or replayed) — terminal success
  | 'governed_failure' // kernel rejected / approval-required — terminal, visible, not retried
  | 'retry_scheduled' // transient failure — rescheduled with backoff
  | 'exhausted'; // transient failures exceeded maxRetries — terminal, visible

export interface ProjectionResult {
  readonly outcome: ProjectionOutcome;
  readonly standingId: string;
  readonly error?: string;
  readonly nextAttemptAtMs?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class StandingActivationOrchestrator {
  private readonly standing: StandingOpenPort;
  private readonly projections: StandingProjectionStore;
  private readonly clock: Clock;
  private readonly retry: ProjectionRetryConfig;
  private readonly random: (() => number) | undefined;
  private readonly termDays: number;
  private readonly systemActorUserId: string;

  constructor(deps: StandingActivationOrchestratorDeps) {
    this.standing = deps.standing;
    this.projections = deps.projections;
    this.clock = deps.clock;
    this.retry = deps.retry;
    this.random = deps.random;
    this.termDays = deps.termDays ?? 365;
    this.systemActorUserId = deps.systemActorUserId ?? SYSTEM_STANDING_ORCHESTRATOR_USER_ID;
  }

  /**
   * Project ONE activation into a governed standing, idempotently. Safe to call for a duplicate or
   * replayed activation: it resolves the SAME deterministic standing id and presents the SAME
   * idempotency key, so the kernel returns the previous result instead of opening a second standing.
   */
  async handleActivation(event: StandingActivationEvent): Promise<ProjectionResult> {
    const standingId = deterministicStandingId(event.tenantId, event.subjectId, event.season);
    const nextAttempts = event.attempts + 1;

    let response: StandingTransitionResponse;
    try {
      response = await this.standing.openStanding(this.buildOpenRequest(event, standingId));
    } catch (error) {
      // TRANSIENT/infra failure (e.g. lost DB connection). Reschedule with backoff, or exhaust.
      return this.scheduleRetryOrExhaust(event, standingId, nextAttempts, describeError(error));
    }

    if (response.status === 'executed') {
      const now = this.clock.now();
      await this.upsert(event, standingId, {
        status: 'projected',
        attempts: nextAttempts,
        nextAttemptAtMs: now,
        projectedAtMs: now,
      });
      return { outcome: 'projected', standingId };
    }

    // A GOVERNED decision (rejection or — unexpected for a low-risk open — approval-required) is
    // terminal and human-visible. It is NOT an infra fault, so it is never auto-retried.
    const error =
      response.status === 'rejected'
        ? `${response.code}: ${response.message}`
        : 'unexpected approval_required for standing open';
    await this.upsert(event, standingId, {
      status: 'failed',
      attempts: nextAttempts,
      nextAttemptAtMs: this.clock.now(),
      lastError: error,
    });
    return { outcome: 'governed_failure', standingId, error };
  }

  private buildOpenRequest(
    event: StandingActivationEvent,
    standingId: string,
  ): StandingTransitionRequest {
    const now = this.clock.now();
    const effectiveFrom = new Date(now).toISOString();
    const effectiveUntil = new Date(now + this.termDays * DAY_MS).toISOString();
    const causationId = event.stateTransitionId ?? event.causationId;
    return {
      tenantId: event.tenantId,
      standingId,
      actor: { userId: this.systemActorUserId, roleKeys: ['standing_registrar'] },
      idempotencyKey: standingOpenIdempotencyKey(standingId),
      reason: 'system.projection: establish standing from activated affiliation',
      details: {
        affiliationApplicationId: event.affiliationApplicationId,
        subjectId: event.subjectId,
        season: event.season,
        pathway: 'new_affiliation',
        effectiveFrom,
        effectiveUntil,
      },
      ...(event.correlationId !== undefined ? { correlationId: event.correlationId } : {}),
      ...(causationId !== undefined ? { causationId } : {}),
    };
  }

  private scheduleRetryOrExhaust(
    event: StandingActivationEvent,
    standingId: string,
    attempts: number,
    error: string,
  ): Promise<ProjectionResult> {
    if (attempts > this.retry.maxRetries) {
      return this.upsert(event, standingId, {
        status: 'failed',
        attempts,
        nextAttemptAtMs: this.clock.now(),
        lastError: `retries exhausted after ${attempts - 1}: ${error}`,
      }).then(() => ({ outcome: 'exhausted', standingId, error }));
    }
    const delay = fullJitterDelayMs({
      attempt: attempts,
      baseDelayMs: this.retry.baseDelayMs,
      maxDelayMs: this.retry.maxDelayMs,
      ...(this.random !== undefined ? { random: this.random } : {}),
    });
    const nextAttemptAtMs = this.clock.now() + delay;
    return this.upsert(event, standingId, {
      status: 'pending',
      attempts,
      nextAttemptAtMs,
      lastError: error,
    }).then(() => ({ outcome: 'retry_scheduled', standingId, nextAttemptAtMs }));
  }

  private upsert(
    event: StandingActivationEvent,
    standingId: string,
    fields: Pick<
      StandingProjectionUpsert,
      'status' | 'attempts' | 'nextAttemptAtMs' | 'lastError' | 'projectedAtMs'
    >,
  ): Promise<void> {
    return this.projections.record({
      tenantId: event.tenantId,
      affiliationApplicationId: event.affiliationApplicationId,
      subjectId: event.subjectId,
      season: event.season,
      standingId,
      ...fields,
      ...(event.stateTransitionId !== undefined
        ? { stateTransitionId: event.stateTransitionId }
        : {}),
      ...(event.correlationId !== undefined ? { correlationId: event.correlationId } : {}),
      ...(event.causationId !== undefined ? { causationId: event.causationId } : {}),
    });
  }
}

/** Extract a safe, human-readable message from an unknown thrown value (never leaks stacks). */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
