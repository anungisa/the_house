/**
 * AffiliationFinancialObligation domain effects — the kernel {@link TransitionDomainEffect}
 * implementations that persist FINANCIAL FACTS atomically with the governed transition.
 *
 * The kernel invokes the registered effect INSIDE the governed transaction, only on the executed
 * (state-mutating) branch, after the immutable state_transition journal row is appended. So a
 * financial write (obligation head, assessment version, external event, reconciliation outcome,
 * clearance) commits or rolls back atomically with the kernel-owned state, journal, audit,
 * evidence, and outbox. The effect NEVER mutates governed state and NEVER performs external side
 * effects (those flow through the outbox after commit).
 *
 * Two backends:
 *  - {@link PgFinancialObligationEffect} writes through the governed transaction's OWN connection
 *    (`tx.raw()`), so `app.tenant_id` is already set (RLS enforced) and the writes are atomic.
 *  - {@link InMemoryFinancialObligationEffect} writes into an injected in-memory store, for
 *    hermetic unit/domain tests.
 *
 * Both read command inputs from `ctx.payload` (the mapper-built payload) and the actor from
 * `ctx.actor`. Amounts were shape-validated at the service boundary and are re-checked by DB
 * CHECK constraints; the persisted reconciliation amounts are read back from stored facts (never
 * trusted from the payload) so the recorded outcome is authoritative.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  DomainEffectContext,
  DomainEffectQueryClient,
  DomainEffectResult,
  GovernanceTx,
  TransitionDomainEffect,
} from '../../governance/kernel/ports.js';
import { discrepancy, normalizeAmount } from './Money.js';
import type { InMemoryFinancialObligationStore } from './InMemoryFinancialObligationStore.js';

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

function readBool(payload: Readonly<Record<string, unknown>>, key: string, fallback: boolean): boolean {
  const v = payload[key];
  return typeof v === 'boolean' ? v : fallback;
}

// -----------------------------------------------------------------------------------------------
// PostgreSQL effect (production) — writes via the governed transaction's own connection.
// -----------------------------------------------------------------------------------------------

export class PgFinancialObligationEffect implements TransitionDomainEffect {
  async apply(tx: GovernanceTx, ctx: DomainEffectContext): Promise<DomainEffectResult | void> {
    const raw = tx.raw?.();
    if (raw === undefined) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        'PgFinancialObligationEffect requires a raw transaction client.',
      );
    }
    const p = ctx.payload;
    const actorId = ctx.actor.actorId;

    switch (ctx.trigger) {
      case 'assess':
        return this.assess(raw, ctx, p, actorId);
      case 'revise_assessment':
        return this.revise(raw, ctx, p, actorId);
      case 'acknowledge':
        return this.acknowledge(raw, ctx, p, actorId);
      case 'confirm':
        return this.confirm(raw, ctx, p, actorId);
      case 'reconcile':
        return this.reconcile(raw, ctx, actorId, 'matched');
      case 'record_mismatch':
        return this.reconcile(raw, ctx, actorId, 'mismatch');
      case 'resolve_mismatch':
        return this.reconcile(raw, ctx, actorId, 'resolved');
      case 'waive':
        return this.clearance(raw, ctx, p, actorId, 'waiver');
      case 'exempt':
        return this.clearance(raw, ctx, p, actorId, 'exemption');
      case 'close':
        return undefined;
      default:
        return undefined;
    }
  }

  private async assess(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
  ): Promise<DomainEffectResult> {
    const amount = normalizeAmount(requireStr(p, 'amount'));
    const currency = requireStr(p, 'currency');
    const obligationType = requireStr(p, 'obligationType');
    const basis = requireStr(p, 'assessmentBasis');
    const blocking = readBool(p, 'blocking', true);
    await raw.query(
      `INSERT INTO affiliation_finance.financial_obligation
         (id, tenant_id, affiliation_application_id, subject_id, season, obligation_type,
          assessment_basis, assessment_version, assessed_amount, currency, blocking, assessed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, $11)`,
      [
        ctx.entityId,
        ctx.tenantId,
        requireStr(p, 'affiliationApplicationId'),
        requireStr(p, 'subjectId'),
        requireStr(p, 'season'),
        obligationType,
        basis,
        amount,
        currency,
        blocking,
        actorId,
      ],
    );
    await raw.query(
      `INSERT INTO affiliation_finance.obligation_assessment
         (tenant_id, obligation_id, version, amount, currency, basis, recorded_by)
       VALUES ($1, $2, 1, $3, $4, $5, $6)`,
      [ctx.tenantId, ctx.entityId, amount, currency, basis, actorId],
    );
    return { evidenceManifest: { obligationType, amount, currency, blocking, assessmentVersion: 1 } };
  }

  private async revise(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
  ): Promise<DomainEffectResult> {
    const amount = normalizeAmount(requireStr(p, 'amount'));
    const currency = requireStr(p, 'currency');
    const basis = requireStr(p, 'assessmentBasis');
    const reason = str(p, 'revisionReason') ?? str(p, 'reason');
    const rows = await raw.query<{ next_version: number }>(
      `UPDATE affiliation_finance.financial_obligation
          SET assessment_version = assessment_version + 1,
              assessed_amount = $3, currency = $4, assessment_basis = $5, updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING assessment_version AS next_version`,
      [ctx.tenantId, ctx.entityId, amount, currency, basis],
    );
    const nextVersion = rows[0]?.next_version;
    if (nextVersion === undefined) {
      throw new AppError(ErrorCode.FINANCIAL_OBLIGATION_NOT_FOUND, 'Obligation head not found for revision.', {
        details: { obligationId: ctx.entityId },
      });
    }
    await raw.query(
      `INSERT INTO affiliation_finance.obligation_assessment
         (tenant_id, obligation_id, version, amount, currency, basis, reason, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ctx.tenantId, ctx.entityId, nextVersion, amount, currency, basis, reason ?? null, actorId],
    );
    return {
      evidenceManifest: {
        assessmentVersion: nextVersion,
        amount,
        currency,
        ...(reason !== undefined ? { reason } : {}),
      },
    };
  }

  private async acknowledge(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
  ): Promise<DomainEffectResult> {
    const externalReference = requireStr(p, 'externalReference');
    const amount = str(p, 'amount');
    const currency = str(p, 'currency');
    await raw.query(
      `INSERT INTO affiliation_finance.obligation_external_event
         (tenant_id, obligation_id, event_kind, external_reference, amount, currency,
          external_message_id, recorded_by)
       VALUES ($1, $2, 'provider_acknowledgement', $3, $4, $5, $6, $7)`,
      [
        ctx.tenantId,
        ctx.entityId,
        externalReference,
        amount !== undefined ? normalizeAmount(amount) : null,
        currency ?? null,
        str(p, 'externalMessageId') ?? null,
        actorId,
      ],
    );
    return { evidenceManifest: { eventKind: 'provider_acknowledgement', externalReference } };
  }

  private async confirm(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
  ): Promise<DomainEffectResult> {
    const externalReference = requireStr(p, 'externalReference');
    const amount = normalizeAmount(requireStr(p, 'amount'));
    const currency = requireStr(p, 'currency');
    await raw.query(
      `INSERT INTO affiliation_finance.obligation_external_event
         (tenant_id, obligation_id, event_kind, external_reference, amount, currency,
          external_message_id, recorded_by)
       VALUES ($1, $2, 'accounting_confirmation', $3, $4, $5, $6, $7)`,
      [
        ctx.tenantId,
        ctx.entityId,
        externalReference,
        amount,
        currency,
        str(p, 'externalMessageId') ?? null,
        actorId,
      ],
    );
    return {
      evidenceManifest: { eventKind: 'accounting_confirmation', externalReference, amount, currency },
    };
  }

  private async reconcile(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    actorId: string,
    outcome: 'matched' | 'mismatch' | 'resolved',
  ): Promise<DomainEffectResult> {
    const view = await this.readExpectedConfirmed(raw, ctx.tenantId, ctx.entityId);
    const disc = discrepancy(view.expected, view.confirmed);
    await raw.query(
      `INSERT INTO affiliation_finance.obligation_reconciliation
         (tenant_id, obligation_id, expected_amount, confirmed_amount, discrepancy_amount,
          currency, outcome, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ctx.tenantId, ctx.entityId, view.expected, view.confirmed, disc, view.currency, outcome, actorId],
    );
    return {
      evidenceManifest: {
        outcome,
        expectedAmount: view.expected,
        confirmedAmount: view.confirmed,
        discrepancyAmount: disc,
        currency: view.currency,
      },
    };
  }

  private async clearance(
    raw: DomainEffectQueryClient,
    ctx: DomainEffectContext,
    p: Readonly<Record<string, unknown>>,
    actorId: string,
    clearanceKind: 'waiver' | 'exemption',
  ): Promise<DomainEffectResult> {
    const reason = str(p, 'clearanceReason') ?? str(p, 'reason');
    await raw.query(
      `INSERT INTO affiliation_finance.obligation_clearance
         (tenant_id, obligation_id, clearance_kind, reason, authorized_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [ctx.tenantId, ctx.entityId, clearanceKind, reason ?? null, actorId],
    );
    return { evidenceManifest: { clearanceKind, ...(reason !== undefined ? { reason } : {}) } };
  }

  private async readExpectedConfirmed(
    raw: DomainEffectQueryClient,
    tenantId: string,
    obligationId: string,
  ): Promise<{ readonly expected: string; readonly confirmed: string; readonly currency: string }> {
    const head = await raw.query<{ assessed_amount: string; currency: string }>(
      `SELECT assessed_amount, currency
         FROM affiliation_finance.financial_obligation
        WHERE tenant_id = $1 AND id = $2`,
      [tenantId, obligationId],
    );
    const row = head[0];
    if (row === undefined) {
      throw new AppError(ErrorCode.FINANCIAL_OBLIGATION_NOT_FOUND, 'Obligation head not found for reconciliation.', {
        details: { obligationId },
      });
    }
    const confirmation = await raw.query<{ amount: string }>(
      `SELECT amount
         FROM affiliation_finance.obligation_external_event
        WHERE tenant_id = $1 AND obligation_id = $2 AND event_kind = 'accounting_confirmation'
              AND amount IS NOT NULL
        ORDER BY recorded_at DESC, id DESC
        LIMIT 1`,
      [tenantId, obligationId],
    );
    const confirmed = confirmation[0]?.amount ?? row.assessed_amount;
    return {
      expected: normalizeAmount(row.assessed_amount),
      confirmed: normalizeAmount(confirmed),
      currency: row.currency,
    };
  }
}

// -----------------------------------------------------------------------------------------------
// In-memory effect (tests) — writes into an injected in-memory store.
// -----------------------------------------------------------------------------------------------

export class InMemoryFinancialObligationEffect implements TransitionDomainEffect {
  constructor(private readonly store: InMemoryFinancialObligationStore) {}

  apply(_tx: GovernanceTx, ctx: DomainEffectContext): Promise<DomainEffectResult | void> {
    const p = ctx.payload;
    const actorId = ctx.actor.actorId;

    switch (ctx.trigger) {
      case 'assess': {
        this.store.insertObligationWithInitialAssessment({
          id: ctx.entityId,
          tenantId: ctx.tenantId,
          affiliationApplicationId: requireStr(p, 'affiliationApplicationId'),
          subjectId: requireStr(p, 'subjectId'),
          season: requireStr(p, 'season'),
          obligationType: requireStr(p, 'obligationType'),
          assessmentBasis: requireStr(p, 'assessmentBasis'),
          assessedAmount: requireStr(p, 'amount'),
          currency: requireStr(p, 'currency'),
          blocking: readBool(p, 'blocking', true),
          assessedBy: actorId,
        });
        return Promise.resolve({
          evidenceManifest: {
            obligationType: requireStr(p, 'obligationType'),
            amount: normalizeAmount(requireStr(p, 'amount')),
            currency: requireStr(p, 'currency'),
            assessmentVersion: 1,
          },
        });
      }
      case 'revise_assessment': {
        const reason = str(p, 'revisionReason') ?? str(p, 'reason');
        const version = this.store.appendAssessmentRevision({
          tenantId: ctx.tenantId,
          obligationId: ctx.entityId,
          amount: requireStr(p, 'amount'),
          currency: requireStr(p, 'currency'),
          basis: requireStr(p, 'assessmentBasis'),
          recordedBy: actorId,
          ...(reason !== undefined ? { reason } : {}),
        });
        return Promise.resolve({
          evidenceManifest: {
            assessmentVersion: version,
            amount: normalizeAmount(requireStr(p, 'amount')),
            currency: requireStr(p, 'currency'),
          },
        });
      }
      case 'acknowledge': {
        const amount = str(p, 'amount');
        const currency = str(p, 'currency');
        const externalMessageId = str(p, 'externalMessageId');
        this.store.insertExternalEvent({
          tenantId: ctx.tenantId,
          obligationId: ctx.entityId,
          eventKind: 'provider_acknowledgement',
          externalReference: requireStr(p, 'externalReference'),
          recordedBy: actorId,
          ...(amount !== undefined ? { amount } : {}),
          ...(currency !== undefined ? { currency } : {}),
          ...(externalMessageId !== undefined ? { externalMessageId } : {}),
        });
        return Promise.resolve({
          evidenceManifest: {
            eventKind: 'provider_acknowledgement',
            externalReference: requireStr(p, 'externalReference'),
          },
        });
      }
      case 'confirm': {
        const externalMessageId = str(p, 'externalMessageId');
        this.store.insertExternalEvent({
          tenantId: ctx.tenantId,
          obligationId: ctx.entityId,
          eventKind: 'accounting_confirmation',
          externalReference: requireStr(p, 'externalReference'),
          amount: requireStr(p, 'amount'),
          currency: requireStr(p, 'currency'),
          recordedBy: actorId,
          ...(externalMessageId !== undefined ? { externalMessageId } : {}),
        });
        return Promise.resolve({
          evidenceManifest: {
            eventKind: 'accounting_confirmation',
            externalReference: requireStr(p, 'externalReference'),
            amount: normalizeAmount(requireStr(p, 'amount')),
            currency: requireStr(p, 'currency'),
          },
        });
      }
      case 'reconcile':
      case 'record_mismatch':
      case 'resolve_mismatch': {
        const outcome =
          ctx.trigger === 'reconcile'
            ? 'matched'
            : ctx.trigger === 'record_mismatch'
              ? 'mismatch'
              : 'resolved';
        const r = this.store.insertReconciliation({
          tenantId: ctx.tenantId,
          obligationId: ctx.entityId,
          outcome,
          recordedBy: actorId,
        });
        return Promise.resolve({
          evidenceManifest: {
            outcome,
            expectedAmount: r.expectedAmount,
            confirmedAmount: r.confirmedAmount,
            discrepancyAmount: r.discrepancyAmount,
          },
        });
      }
      case 'waive':
      case 'exempt': {
        const clearanceKind = ctx.trigger === 'waive' ? 'waiver' : 'exemption';
        const reason = str(p, 'clearanceReason') ?? str(p, 'reason');
        this.store.insertClearance({
          tenantId: ctx.tenantId,
          obligationId: ctx.entityId,
          clearanceKind,
          authorizedBy: actorId,
          ...(reason !== undefined ? { reason } : {}),
        });
        return Promise.resolve({ evidenceManifest: { clearanceKind } });
      }
      case 'close':
      default:
        return Promise.resolve(undefined);
    }
  }
}
