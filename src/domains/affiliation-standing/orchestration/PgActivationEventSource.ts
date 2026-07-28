/**
 * PostgreSQL {@link ActivationEventSource} — CROSS-TENANT discovery of activation events needing a
 * standing projection.
 *
 * Mirrors the outbox worker's cross-tenant pattern (migration 0004): the projection worker runs for
 * ALL tenants with NO tenant context, so it discovers events through the narrow, read-only
 * SECURITY DEFINER function `affiliation_standing.list_pending_standing_activations` (migration
 * 0015) rather than reading tenant-owned tables directly. The function resolves the affiliation
 * subject + season and returns only activations that have no projection yet OR a 'pending'
 * projection now due. It never mutates the outbox or governed state.
 */

import { queryRaw } from '../../../db/pool.js';
import type { ActivationEventSource } from './ActivationEventSource.js';
import type { StandingActivationEvent } from './StandingActivationEvent.js';

interface ActivationRow extends Record<string, unknown> {
  tenant_id: string;
  affiliation_application_id: string;
  subject_id: string;
  season: string;
  state_transition_id: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  attempts: number;
}

function toEvent(row: ActivationRow): StandingActivationEvent {
  return {
    tenantId: row.tenant_id,
    affiliationApplicationId: row.affiliation_application_id,
    subjectId: row.subject_id,
    season: row.season,
    attempts: row.attempts,
    ...(row.state_transition_id !== null ? { stateTransitionId: row.state_transition_id } : {}),
    ...(row.correlation_id !== null ? { correlationId: row.correlation_id } : {}),
    ...(row.causation_id !== null ? { causationId: row.causation_id } : {}),
  };
}

export class PgActivationEventSource implements ActivationEventSource {
  async pollDue(limit: number): Promise<readonly StandingActivationEvent[]> {
    // Cross-tenant: no app.tenant_id set; the SECURITY DEFINER function scopes access.
    const rows = await queryRaw<ActivationRow>(
      `SELECT tenant_id, affiliation_application_id, subject_id, season, state_transition_id,
              correlation_id, causation_id, attempts
         FROM affiliation_standing.list_pending_standing_activations($1)`,
      [limit],
    );
    return rows.map(toEvent);
  }
}
