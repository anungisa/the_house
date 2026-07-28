/**
 * Standing activation projection — public boundary.
 *
 * The cross-aggregate orchestration that projects an ACTIVATED AffiliationApplication into a
 * governed AffiliationStanding under idempotent, reconcilable, at-least-once delivery. See
 * {@link StandingActivationOrchestrator} for the model and invariants.
 */

export {
  deterministicStandingId,
  standingOpenIdempotencyKey,
  STANDING_IDENTITY_NAMESPACE,
  SYSTEM_STANDING_ORCHESTRATOR_USER_ID,
  type StandingActivationEvent,
} from './StandingActivationEvent.js';

export type { ActivationEventSource } from './ActivationEventSource.js';
export { InMemoryActivationEventSource } from './InMemoryActivationEventSource.js';
export { PgActivationEventSource } from './PgActivationEventSource.js';

export type {
  StandingProjectionRecord,
  StandingProjectionStatus,
  StandingProjectionStore,
  StandingProjectionUpsert,
} from './StandingProjectionStore.js';
export { InMemoryStandingProjectionStore } from './InMemoryStandingProjectionStore.js';
export { PgStandingProjectionStore } from './PgStandingProjectionStore.js';

export {
  StandingActivationOrchestrator,
  type ProjectionOutcome,
  type ProjectionResult,
  type ProjectionRetryConfig,
  type StandingActivationOrchestratorDeps,
  type StandingOpenPort,
} from './StandingActivationOrchestrator.js';

export {
  StandingProjectionWorker,
  type StandingProjectionBatchSummary,
  type StandingProjectionWorkerDeps,
} from './StandingProjectionWorker.js';
