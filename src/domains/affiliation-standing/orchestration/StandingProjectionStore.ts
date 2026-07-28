/**
 * Standing projection store — reconcilable bookkeeping for the activation → standing projection.
 *
 * This store records, per activated application, the deterministic standing identity and the
 * projection status (pending / projected / failed), plus retry accounting and the last error. It is
 * NOT a source of governed truth — the standing itself lives in governance.entity_state and is
 * written exclusively by the Governance Kernel. This store exists so support/reconciliation can see
 * every activation that has not yet produced a standing and why.
 *
 * Writes are an idempotent UPSERT keyed on (tenantId, affiliationApplicationId): a replayed or
 * duplicated activation updates the SAME row and never creates a second.
 */

/** Projection status. `failed` is a terminal, human-visible state (governed rejection or retries
 *  exhausted) — it is never auto-retried. */
export type StandingProjectionStatus = 'pending' | 'projected' | 'failed';

/** A persisted projection record (reconciliation read shape). */
export interface StandingProjectionRecord {
  readonly tenantId: string;
  readonly affiliationApplicationId: string;
  readonly subjectId: string;
  readonly season: string;
  readonly standingId: string;
  readonly status: StandingProjectionStatus;
  readonly attempts: number;
  /** Epoch ms when this projection is next due (retry scheduling). */
  readonly nextAttemptAtMs: number;
  readonly lastError?: string;
  readonly stateTransitionId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  /** Epoch ms when the standing was successfully opened (only when status = 'projected'). */
  readonly projectedAtMs?: number;
}

/** The target state to UPSERT for one activation projection. */
export interface StandingProjectionUpsert {
  readonly tenantId: string;
  readonly affiliationApplicationId: string;
  readonly subjectId: string;
  readonly season: string;
  readonly standingId: string;
  readonly status: StandingProjectionStatus;
  readonly attempts: number;
  readonly nextAttemptAtMs: number;
  readonly lastError?: string;
  readonly stateTransitionId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly projectedAtMs?: number;
}

export interface StandingProjectionStore {
  /**
   * Idempotently UPSERT the projection record for (tenantId, affiliationApplicationId). Immutable
   * identity fields (subject/season/standing_id) are set on first insert and preserved on update.
   */
  record(upsert: StandingProjectionUpsert): Promise<void>;

  /** Fetch the projection record for one activation (reconciliation), or undefined when absent. */
  getByApplication(
    tenantId: string,
    affiliationApplicationId: string,
  ): Promise<StandingProjectionRecord | undefined>;

  /**
   * List UNRECONCILED projections for a tenant (status <> 'projected'), oldest-due first. This is
   * the reconciliation query support uses to see activations whose standing is not yet established
   * (pending/retrying) or has failed and needs attention.
   */
  listUnreconciled(tenantId: string, limit: number): Promise<readonly StandingProjectionRecord[]>;
}
