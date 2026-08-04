/**
 * Renewal application link — read port + in-memory registry.
 *
 * The link (`affiliation_standing.renewal_application_link`, migration 0024) is the immutable
 * governed attribution between a RENEWAL affiliation application and the standing it renews. It is
 * WRITTEN once, inside the same transaction that creates the renewal application (see the draft
 * store), and READ here by the renewal eligibility service (to detect an in-progress renewal) and
 * by the initiation endpoint (to resume idempotently).
 *
 * Reads are tenant-scoped and RLS-enforced (the Pg reader runs inside a tenant transaction). No
 * method here ever writes, mutates, or deletes a link.
 */

import pg from 'pg';

import { getPool, withTenantTransaction, type QueryClient } from '../../db/pool.js';

/** A single immutable renewal attribution (representative-INTERNAL; not a Button projection). */
export interface RenewalApplicationLink {
  readonly renewalApplicationId: string;
  readonly standingId: string;
  readonly sourceStandingVersion: number;
  readonly sourceSeasonId: string;
  readonly targetSeasonId: string;
  readonly initiatedAt: string;
}

/** Read-only port over the renewal attribution link. */
export interface RenewalApplicationLinkReader {
  /** All links for a standing (most recent first). Empty when none. */
  findByStanding(
    tenantId: string,
    standingId: string,
  ): Promise<readonly RenewalApplicationLink[]>;

  /** The link for a standing + target season, or undefined. */
  findByStandingAndTargetSeason(
    tenantId: string,
    standingId: string,
    targetSeasonId: string,
  ): Promise<RenewalApplicationLink | undefined>;

  /** The link previously written under an idempotency key, or undefined (idempotent replay lookup). */
  findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<RenewalApplicationLink | undefined>;
}

type LinkRow = {
  readonly renewal_application_id: string;
  readonly standing_id: string;
  readonly source_standing_version: number;
  readonly source_season_id: string;
  readonly target_season_id: string;
  readonly initiated_at: Date | string;
};

function toLink(row: LinkRow): RenewalApplicationLink {
  return {
    renewalApplicationId: row.renewal_application_id,
    standingId: row.standing_id,
    sourceStandingVersion: row.source_standing_version,
    sourceSeasonId: row.source_season_id,
    targetSeasonId: row.target_season_id,
    initiatedAt:
      row.initiated_at instanceof Date ? row.initiated_at.toISOString() : String(row.initiated_at),
  };
}

const SELECT_COLS = `renewal_application_id, standing_id, source_standing_version,
                     source_season_id, target_season_id, initiated_at`;

/** PostgreSQL reader (RLS-enforced via {@link withTenantTransaction}). */
export class PgRenewalApplicationLinkReader implements RenewalApplicationLinkReader {
  constructor(private readonly pool: pg.Pool = getPool()) {}

  async findByStanding(
    tenantId: string,
    standingId: string,
  ): Promise<readonly RenewalApplicationLink[]> {
    return withTenantTransaction(
      tenantId,
      async (client: QueryClient) => {
        const rows = await client.query<LinkRow>(
          `SELECT ${SELECT_COLS}
             FROM affiliation_standing.renewal_application_link
            WHERE standing_id = $1
            ORDER BY initiated_at DESC`,
          [standingId],
        );
        return rows.map(toLink);
      },
      this.pool,
    );
  }

  async findByStandingAndTargetSeason(
    tenantId: string,
    standingId: string,
    targetSeasonId: string,
  ): Promise<RenewalApplicationLink | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client: QueryClient) => {
        const rows = await client.query<LinkRow>(
          `SELECT ${SELECT_COLS}
             FROM affiliation_standing.renewal_application_link
            WHERE standing_id = $1 AND target_season_id = $2
            LIMIT 1`,
          [standingId, targetSeasonId],
        );
        const row = rows[0];
        return row === undefined ? undefined : toLink(row);
      },
      this.pool,
    );
  }

  async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<RenewalApplicationLink | undefined> {
    return withTenantTransaction(
      tenantId,
      async (client: QueryClient) => {
        const rows = await client.query<LinkRow>(
          `SELECT ${SELECT_COLS}
             FROM affiliation_standing.renewal_application_link
            WHERE idempotency_key = $1
            LIMIT 1`,
          [idempotencyKey],
        );
        const row = rows[0];
        return row === undefined ? undefined : toLink(row);
      },
      this.pool,
    );
  }
}
