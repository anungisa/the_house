/**
 * Standing activation projection — event contract + deterministic identity.
 *
 * When an AffiliationApplication is ACTIVATED, the Governance Kernel enqueues a transactional
 * outbox event (`AffiliationApplication.activate`). This module defines the SHAPE the standing
 * projection consumes and the DETERMINISTIC standing identity it derives.
 *
 * A {@link StandingActivationEvent} is intentionally SELF-CONTAINED: the event SOURCE resolves the
 * affiliation subject + season (the same subject definition the affiliation guards/serialization
 * use) so the orchestrator never has to re-read application facts. Duplicate or replayed events for
 * the same activation therefore carry identical subject/season and derive the SAME standing id.
 */

import { uuidV5 } from '../../../shared/uuid/deterministic.js';

/**
 * A single activation ready to be projected into a governed standing. `attempts` is the number of
 * projection attempts already recorded for this activation (0 when never attempted), used for
 * retry accounting.
 */
export interface StandingActivationEvent {
  readonly tenantId: string;
  readonly affiliationApplicationId: string;
  /** The affiliation subject: COALESCE(scope_id, local_organization_id, organization_id). */
  readonly subjectId: string;
  readonly season: string;
  /** The activation's state_transition id (kernel causation), when present on the event. */
  readonly stateTransitionId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  /** Prior projection attempts for this activation (0 when never attempted). */
  readonly attempts: number;
}

/**
 * Fixed namespace for standing identity derivation. Changing this value would re-map EVERY derived
 * standing id, so it is a stable constant of the projection contract.
 */
export const STANDING_IDENTITY_NAMESPACE = 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b';

/**
 * The SYSTEM principal under which the projection requests the governed standing `open`. It carries
 * the registrar function required by the standing authority model. Standing establishment from an
 * activated affiliation is a SYSTEM-initiated governed action (not an end-user command), but it
 * still flows entirely through the Governance Kernel.
 */
export const SYSTEM_STANDING_ORCHESTRATOR_USER_ID = '00000000-0000-4000-8000-000000000015';

/**
 * Derive the DETERMINISTIC standing identity for a governed scope: exactly ONE standing id per
 * (tenant, subject, season). Pure and reproducible — a replayed or duplicated activation resolves
 * to the SAME id, which (with the kernel's idempotency + exactly-once activation serialization)
 * guarantees no duplicate standing.
 */
export function deterministicStandingId(
  tenantId: string,
  subjectId: string,
  season: string,
): string {
  return uuidV5(STANDING_IDENTITY_NAMESPACE, `${tenantId}:${subjectId}:${season}`);
}

/**
 * Stable idempotency key for the governed standing `open` derived from an activation. Deterministic
 * so every retry/replay presents the SAME key and the kernel returns the previous result instead of
 * opening a second standing.
 */
export function standingOpenIdempotencyKey(standingId: string): string {
  return `standing-open:${standingId}`;
}
