/**
 * Read-only lifecycle status reader for an affiliation application.
 *
 * Governed lifecycle state lives EXCLUSIVELY in `governance.entity_state` (kernel-owned). Before an
 * application is ever submitted there is NO entity_state row (the kernel bootstraps it at the first
 * governed transition — `submit`, delivered in Slice D), so the pre-submission status is `draft`.
 * This reader NEVER mutates governed state and NEVER invokes the kernel.
 */

import pg from 'pg';
import { getPool, withTenantTransaction } from '../../db/pool.js';
import type { AffiliationLifecycleStatus } from './AffiliationDraftTypes.js';

const ENTITY_TYPE = 'AffiliationApplication';

const KNOWN_STATUSES: ReadonlySet<string> = new Set<AffiliationLifecycleStatus>([
  'draft',
  'submitted',
  'under_review',
  'approved',
  'active',
  'suspended',
  'rejected',
  'revoked',
  'closed',
  'archived',
]);

export interface AffiliationLifecycleReader {
  /** Current governed status, or `draft` when no governed state exists yet. */
  currentStatus(tenantId: string, applicationId: string): Promise<AffiliationLifecycleStatus>;
}

/** In-memory reader; returns `draft` unless a status was explicitly seeded. */
export class InMemoryAffiliationLifecycleReader implements AffiliationLifecycleReader {
  private readonly statuses = new Map<string, AffiliationLifecycleStatus>();

  seed(tenantId: string, applicationId: string, status: AffiliationLifecycleStatus): void {
    this.statuses.set(`${tenantId}|${applicationId}`, status);
  }

  async currentStatus(tenantId: string, applicationId: string): Promise<AffiliationLifecycleStatus> {
    return this.statuses.get(`${tenantId}|${applicationId}`) ?? 'draft';
  }
}

/** PostgreSQL reader over governance.entity_state (RLS-enforced, tenant-scoped, read-only). */
export class PgAffiliationLifecycleReader implements AffiliationLifecycleReader {
  constructor(private readonly pool: pg.Pool = getPool()) {}

  async currentStatus(tenantId: string, applicationId: string): Promise<AffiliationLifecycleStatus> {
    return withTenantTransaction(
      tenantId,
      async (client) => {
        const rows = await client.query<{ current_state: string }>(
          `SELECT current_state FROM governance.entity_state
            WHERE entity_type = $1 AND entity_id = $2`,
          [ENTITY_TYPE, applicationId],
        );
        const state = rows[0]?.current_state;
        if (state !== undefined && KNOWN_STATUSES.has(state)) {
          return state as AffiliationLifecycleStatus;
        }
        return 'draft';
      },
      this.pool,
    );
  }
}
