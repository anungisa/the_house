/**
 * In-memory {@link StandingProjectionStore} — hermetic backing for unit tests.
 *
 * Mirrors the standing_projection table (migration 0015) closely enough to exercise the projection
 * flows without a database: an idempotent UPSERT keyed on (tenantId, affiliationApplicationId), a
 * per-application read, and the unreconciled reconciliation query. Tenant isolation is modeled by
 * filtering every read by tenantId (mirroring RLS).
 */

import type {
  StandingProjectionRecord,
  StandingProjectionStore,
  StandingProjectionUpsert,
} from './StandingProjectionStore.js';

function key(tenantId: string, applicationId: string): string {
  return `${tenantId}:${applicationId}`;
}

export class InMemoryStandingProjectionStore implements StandingProjectionStore {
  private readonly rows = new Map<string, StandingProjectionRecord>();

  record(upsert: StandingProjectionUpsert): Promise<void> {
    const k = key(upsert.tenantId, upsert.affiliationApplicationId);
    const existing = this.rows.get(k);
    // First insert fixes the immutable identity fields; updates preserve them.
    const subjectId = existing?.subjectId ?? upsert.subjectId;
    const season = existing?.season ?? upsert.season;
    const standingId = existing?.standingId ?? upsert.standingId;
    const rec: StandingProjectionRecord = {
      tenantId: upsert.tenantId,
      affiliationApplicationId: upsert.affiliationApplicationId,
      subjectId,
      season,
      standingId,
      status: upsert.status,
      attempts: upsert.attempts,
      nextAttemptAtMs: upsert.nextAttemptAtMs,
      ...(upsert.lastError !== undefined ? { lastError: upsert.lastError } : {}),
      ...(upsert.stateTransitionId !== undefined
        ? { stateTransitionId: upsert.stateTransitionId }
        : {}),
      ...(upsert.correlationId !== undefined ? { correlationId: upsert.correlationId } : {}),
      ...(upsert.causationId !== undefined ? { causationId: upsert.causationId } : {}),
      ...(upsert.projectedAtMs !== undefined ? { projectedAtMs: upsert.projectedAtMs } : {}),
    };
    this.rows.set(k, rec);
    return Promise.resolve();
  }

  getByApplication(
    tenantId: string,
    affiliationApplicationId: string,
  ): Promise<StandingProjectionRecord | undefined> {
    const rec = this.rows.get(key(tenantId, affiliationApplicationId));
    if (rec === undefined || rec.tenantId !== tenantId) return Promise.resolve(undefined);
    return Promise.resolve(rec);
  }

  listUnreconciled(
    tenantId: string,
    limit: number,
  ): Promise<readonly StandingProjectionRecord[]> {
    const out = [...this.rows.values()]
      .filter((r) => r.tenantId === tenantId && r.status !== 'projected')
      .sort((a, b) => a.nextAttemptAtMs - b.nextAttemptAtMs)
      .slice(0, Math.max(0, limit));
    return Promise.resolve(out);
  }
}
