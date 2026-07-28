/**
 * AffiliationStanding domain effects — the kernel {@link TransitionDomainEffect} implementations
 * that persist STANDING FACTS atomically with the governed transition.
 *
 * The kernel invokes the registered effect INSIDE the governed transaction, only on the executed
 * (state-mutating) branch, after the immutable state_transition journal row is appended. So a
 * standing write (head, effective-period version, lifecycle event) commits or rolls back atomically
 * with the kernel-owned state, journal, audit, evidence, and outbox. The effect NEVER mutates
 * governed state and NEVER performs external side effects (those flow through the outbox after
 * commit).
 *
 * Two backends:
 *  - {@link PgAffiliationStandingEffect} writes through the governed transaction's OWN connection
 *    (`tx.raw()`), so `app.tenant_id` is already set (RLS enforced) and the writes are atomic.
 *  - {@link InMemoryAffiliationStandingEffect} writes into an injected in-memory store, for
 *    hermetic unit/domain tests.
 *
 * Both read command inputs from `ctx.payload` (the mapper-built payload) and the actor from
 * `ctx.actor`. Effective-period shape was validated at the service boundary and is re-checked by
 * DB CHECK constraints; the renewal version is derived from the persisted head (never trusted from
 * the payload) so the recorded period sequence is authoritative.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  DomainEffectContext,
  DomainEffectQueryClient,
  DomainEffectResult,
  GovernanceTx,
  TransitionDomainEffect,
} from '../../governance/kernel/ports.js';
import type { InMemoryAffiliationStandingStore } from './InMemoryAffiliationStandingStore.js';

type StandingEventKind = 'renewal' | 'expiry' | 'suspension' | 'reinstatement' | 'termination';

/** Read a string field from the opaque payload, or undefined when absent/non-string. */
function str(payload: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const v = payload[key];
  return typeof v === 'string' ? v : undefined;
}

/** Read a required string field or fail closed (defensive; the boundary already validated). */
function requireStr(payload: Readonly<Record<string, unknown>>, key: string): string {
  const v = str(payload, key);
  if (v === undefined) {
    throw new AppError(ErrorCode.INVALID_INPUT, `Missing required payload field '${key}'.`, {
      details: { key },
    });
  }
  return v;
}

// -----------------------------------------------------------------------------------------------
// PostgreSQL effect (production) — writes via the governed transaction's own connection.
// -----------------------------------------------------------------------------------------------

export class PgAffiliationStandingEffect implements TransitionDomainEffect {
  async apply(tx: GovernanceTx, ctx: DomainEffectContext): Promise<DomainEffectResult | void> {
    const raw = tx.raw?.();
    if (raw === undefined) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        'PgAffiliationStandingEffect requires a raw transaction client.',
      );
    }
    const p = ctx.payload;
    const actorId = ctx.actor.actorId;

    switch (ctx.trigger) {
      case 'open':
        return this.open(raw, ctx, p, actorId);
      case 'renew':
      case 'renew_active':
        return this.renew(raw, ctx, p, actorId);
      case 'expire':
        return this.event(raw, ctx, p, actorId, 'expiry');
      case 'suspend':
        return this.event(raw, ctx, p, actorId, 'suspension');
      case 'reinstate':
        return this.event(raw, ctx, p, actorId, 'reinstatement');
      case 'terminate':
        return this.event(raw, ctx, p, actorId, 'termination');
      case 'activate':
      default:
        // `activate` marks an already-recorded period in force: governed state only, no facts.
        return undefined;
    }
  }

  private async open(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
  ): Promise<DomainEffectResult | void> {
    const affiliationApplicationId = requireStr(p, 'affiliationApplicationId');
    const subjectId = requireStr(p, 'subjectId');
    const season = requireStr(p, 'season');
    const pathway = requireStr(p, 'pathway');
    const effectiveFrom = requireStr(p, 'effectiveFrom');
    const effectiveUntil = requireStr(p, 'effectiveUntil');
    await raw.query(
      `INSERT INTO affiliation_standing.affiliation_standing
         (id, tenant_id, affiliation_application_id, subject_id, season, standing_version,
          effective_from, effective_until, pathway, established_by)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9)`,
      [
        ctx.entityId,
        ctx.tenantId,
        affiliationApplicationId,
        subjectId,
        season,
        effectiveFrom,
        effectiveUntil,
        pathway,
        actorId,
      ],
    );
    await raw.query(
      `INSERT INTO affiliation_standing.standing_period
         (tenant_id, standing_id, version, effective_from, effective_until, pathway, recorded_by)
       VALUES ($1, $2, 1, $3, $4, $5, $6)`,
      [ctx.tenantId, ctx.entityId, effectiveFrom, effectiveUntil, pathway, actorId],
    );
    // `open` is low-risk (no evidence object); nothing to contribute to a manifest.
    return undefined;
  }

  private async renew(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
  ): Promise<DomainEffectResult> {
    const pathway = requireStr(p, 'pathway');
    const effectiveFrom = requireStr(p, 'effectiveFrom');
    const effectiveUntil = requireStr(p, 'effectiveUntil');
    const reason = str(p, 'renewalReason') ?? str(p, 'reason');
    const rows = await raw.query<{ next_version: number }>(
      `UPDATE affiliation_standing.affiliation_standing
          SET standing_version = standing_version + 1,
              effective_from = $3, effective_until = $4, pathway = $5, updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING standing_version AS next_version`,
      [ctx.tenantId, ctx.entityId, effectiveFrom, effectiveUntil, pathway],
    );
    const nextVersion = rows[0]?.next_version;
    if (nextVersion === undefined) {
      throw new AppError(
        ErrorCode.AFFILIATION_STANDING_NOT_FOUND,
        'Standing head not found for renewal.',
        { details: { standingId: ctx.entityId } },
      );
    }
    await raw.query(
      `INSERT INTO affiliation_standing.standing_period
         (tenant_id, standing_id, version, effective_from, effective_until, pathway, reason, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ctx.tenantId, ctx.entityId, nextVersion, effectiveFrom, effectiveUntil, pathway, reason ?? null, actorId],
    );
    await raw.query(
      `INSERT INTO affiliation_standing.standing_event
         (tenant_id, standing_id, event_kind, reason, recorded_by)
       VALUES ($1, $2, 'renewal', $3, $4)`,
      [ctx.tenantId, ctx.entityId, reason ?? null, actorId],
    );
    return {
      evidenceManifest: {
        eventKind: 'renewal',
        standingVersion: nextVersion,
        pathway,
        effectiveFrom,
        effectiveUntil,
        ...(reason !== undefined ? { reason } : {}),
      },
    };
  }

  private async event(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
    eventKind: StandingEventKind,
  ): Promise<DomainEffectResult> {
    const reason = str(p, 'reason');
    await raw.query(
      `INSERT INTO affiliation_standing.standing_event
         (tenant_id, standing_id, event_kind, reason, recorded_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [ctx.tenantId, ctx.entityId, eventKind, reason ?? null, actorId],
    );
    return { evidenceManifest: { eventKind, ...(reason !== undefined ? { reason } : {}) } };
  }
}

// -----------------------------------------------------------------------------------------------
// In-memory effect (tests) — writes into an injected in-memory store.
// -----------------------------------------------------------------------------------------------

export class InMemoryAffiliationStandingEffect implements TransitionDomainEffect {
  constructor(private readonly store: InMemoryAffiliationStandingStore) {}

  apply(_tx: GovernanceTx, ctx: DomainEffectContext): Promise<DomainEffectResult | void> {
    const p = ctx.payload;
    const actorId = ctx.actor.actorId;

    switch (ctx.trigger) {
      case 'open': {
        this.store.insertStandingWithInitialPeriod({
          id: ctx.entityId,
          tenantId: ctx.tenantId,
          affiliationApplicationId: requireStr(p, 'affiliationApplicationId'),
          subjectId: requireStr(p, 'subjectId'),
          season: requireStr(p, 'season'),
          pathway: requireStr(p, 'pathway'),
          effectiveFrom: requireStr(p, 'effectiveFrom'),
          effectiveUntil: requireStr(p, 'effectiveUntil'),
          establishedBy: actorId,
        });
        return Promise.resolve(undefined);
      }
      case 'renew':
      case 'renew_active': {
        const reason = str(p, 'renewalReason') ?? str(p, 'reason');
        const version = this.store.appendRenewalPeriod({
          tenantId: ctx.tenantId,
          standingId: ctx.entityId,
          pathway: requireStr(p, 'pathway'),
          effectiveFrom: requireStr(p, 'effectiveFrom'),
          effectiveUntil: requireStr(p, 'effectiveUntil'),
          recordedBy: actorId,
          ...(reason !== undefined ? { reason } : {}),
        });
        this.store.insertEvent({
          tenantId: ctx.tenantId,
          standingId: ctx.entityId,
          eventKind: 'renewal',
          recordedBy: actorId,
          ...(reason !== undefined ? { reason } : {}),
        });
        return Promise.resolve({
          evidenceManifest: {
            eventKind: 'renewal',
            standingVersion: version,
            pathway: requireStr(p, 'pathway'),
            effectiveFrom: requireStr(p, 'effectiveFrom'),
            effectiveUntil: requireStr(p, 'effectiveUntil'),
            ...(reason !== undefined ? { reason } : {}),
          },
        });
      }
      case 'expire':
        return Promise.resolve(this.event(ctx, p, actorId, 'expiry'));
      case 'suspend':
        return Promise.resolve(this.event(ctx, p, actorId, 'suspension'));
      case 'reinstate':
        return Promise.resolve(this.event(ctx, p, actorId, 'reinstatement'));
      case 'terminate':
        return Promise.resolve(this.event(ctx, p, actorId, 'termination'));
      case 'activate':
      default:
        return Promise.resolve(undefined);
    }
  }

  private event(
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
    eventKind: StandingEventKind,
  ): DomainEffectResult {
    const reason = str(p, 'reason');
    this.store.insertEvent({
      tenantId: ctx.tenantId,
      standingId: ctx.entityId,
      eventKind,
      recordedBy: actorId,
      ...(reason !== undefined ? { reason } : {}),
    });
    return { evidenceManifest: { eventKind, ...(reason !== undefined ? { reason } : {}) } };
  }
}
