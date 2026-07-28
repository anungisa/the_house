/**
 * In-memory {@link FinancialObligationStore} — the hermetic backing for unit/domain tests and
 * the counterpart the {@link InMemoryFinancialObligationEffect} writes into.
 *
 * It mirrors the affiliation-finance schema (migration 0013) closely enough to exercise the
 * governed flows without a database: an obligation HEAD plus append-only assessment history,
 * external events (provider acknowledgements + accounting confirmations), reconciliation
 * outcomes, and clearances. Reads are tenant-scoped and fail CLOSED (undefined/false) when the
 * obligation is missing, matching the Pg store. Writes are used ONLY by the in-memory domain
 * effect (the runtime path never mutates through this class directly).
 *
 * Tenant isolation is modeled by keying every record on `tenantId` and filtering reads by it, so
 * a cross-tenant read returns nothing (mirroring RLS).
 */

import { amountsEqual, discrepancy, normalizeAmount } from './Money.js';
import type {
  FinancialObligationHead,
  FinancialObligationStore,
  FinancialReconciliationView,
} from './FinancialObligationStore.js';

interface ObligationRecord {
  id: string;
  tenantId: string;
  affiliationApplicationId: string;
  subjectId: string;
  season: string;
  obligationType: string;
  assessmentBasis: string;
  assessmentVersion: number;
  assessedAmount: string;
  currency: string;
  blocking: boolean;
  assessedBy: string;
}

interface AssessmentRecord {
  tenantId: string;
  obligationId: string;
  version: number;
  amount: string;
  currency: string;
  basis: string;
  reason?: string;
  recordedBy: string;
}

interface ExternalEventRecord {
  tenantId: string;
  obligationId: string;
  eventKind: 'provider_acknowledgement' | 'accounting_confirmation';
  externalReference: string;
  amount?: string;
  currency?: string;
  externalMessageId?: string;
  recordedBy: string;
  seq: number;
}

interface ReconciliationRecord {
  tenantId: string;
  obligationId: string;
  expectedAmount: string;
  confirmedAmount: string;
  discrepancyAmount: string;
  currency: string;
  outcome: 'matched' | 'mismatch' | 'resolved';
  reason?: string;
  recordedBy: string;
}

interface ClearanceRecord {
  tenantId: string;
  obligationId: string;
  clearanceKind: 'waiver' | 'exemption';
  reason?: string;
  authorizedBy: string;
}

/** A conflict raised when an append-only unique constraint would be violated (mirrors the DB). */
export class InMemoryFinancialConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InMemoryFinancialConflictError';
  }
}

export class InMemoryFinancialObligationStore implements FinancialObligationStore {
  private readonly obligations = new Map<string, ObligationRecord>();
  private readonly assessments: AssessmentRecord[] = [];
  private readonly externalEvents: ExternalEventRecord[] = [];
  private readonly reconciliations: ReconciliationRecord[] = [];
  private readonly clearances: ClearanceRecord[] = [];
  private seq = 0;

  // --- Read port (tenant-scoped, fail closed) --------------------------------------------

  getObligation(
    tenantId: string,
    obligationId: string,
  ): Promise<FinancialObligationHead | undefined> {
    const rec = this.obligations.get(obligationId);
    if (rec === undefined || rec.tenantId !== tenantId) return Promise.resolve(undefined);
    return Promise.resolve(this.toHead(rec));
  }

  getReconciliationView(
    tenantId: string,
    obligationId: string,
  ): Promise<FinancialReconciliationView | undefined> {
    const rec = this.obligations.get(obligationId);
    if (rec === undefined || rec.tenantId !== tenantId) return Promise.resolve(undefined);
    const confirmation = this.latestAccountingConfirmation(tenantId, obligationId);
    return Promise.resolve({
      obligationId,
      expectedAmount: rec.assessedAmount,
      expectedCurrency: rec.currency,
      hasAccountingConfirmation: confirmation !== undefined,
      ...(confirmation?.amount !== undefined ? { confirmedAmount: confirmation.amount } : {}),
      ...(confirmation?.currency !== undefined ? { confirmedCurrency: confirmation.currency } : {}),
    });
  }

  hasAccountingConfirmation(tenantId: string, obligationId: string): Promise<boolean> {
    return Promise.resolve(
      this.latestAccountingConfirmation(tenantId, obligationId) !== undefined,
    );
  }

  // --- Write surface (used ONLY by the in-memory domain effect) ---------------------------

  insertObligationWithInitialAssessment(input: {
    readonly id: string;
    readonly tenantId: string;
    readonly affiliationApplicationId: string;
    readonly subjectId: string;
    readonly season: string;
    readonly obligationType: string;
    readonly assessmentBasis: string;
    readonly assessedAmount: string;
    readonly currency: string;
    readonly blocking: boolean;
    readonly assessedBy: string;
  }): void {
    if (this.obligations.has(input.id)) {
      throw new InMemoryFinancialConflictError(`Obligation already exists: ${input.id}`);
    }
    const amount = normalizeAmount(input.assessedAmount);
    this.obligations.set(input.id, {
      id: input.id,
      tenantId: input.tenantId,
      affiliationApplicationId: input.affiliationApplicationId,
      subjectId: input.subjectId,
      season: input.season,
      obligationType: input.obligationType,
      assessmentBasis: input.assessmentBasis,
      assessmentVersion: 1,
      assessedAmount: amount,
      currency: input.currency,
      blocking: input.blocking,
      assessedBy: input.assessedBy,
    });
    this.assessments.push({
      tenantId: input.tenantId,
      obligationId: input.id,
      version: 1,
      amount,
      currency: input.currency,
      basis: input.assessmentBasis,
      recordedBy: input.assessedBy,
    });
  }

  appendAssessmentRevision(input: {
    readonly tenantId: string;
    readonly obligationId: string;
    readonly amount: string;
    readonly currency: string;
    readonly basis: string;
    readonly reason?: string;
    readonly recordedBy: string;
  }): number {
    const rec = this.require(input.tenantId, input.obligationId);
    const version = rec.assessmentVersion + 1;
    const amount = normalizeAmount(input.amount);
    this.assessments.push({
      tenantId: input.tenantId,
      obligationId: input.obligationId,
      version,
      amount,
      currency: input.currency,
      basis: input.basis,
      recordedBy: input.recordedBy,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    rec.assessmentVersion = version;
    rec.assessedAmount = amount;
    rec.assessmentBasis = input.basis;
    rec.currency = input.currency;
    return version;
  }

  insertExternalEvent(input: {
    readonly tenantId: string;
    readonly obligationId: string;
    readonly eventKind: 'provider_acknowledgement' | 'accounting_confirmation';
    readonly externalReference: string;
    readonly amount?: string;
    readonly currency?: string;
    readonly externalMessageId?: string;
    readonly recordedBy: string;
  }): void {
    this.require(input.tenantId, input.obligationId);
    const duplicate = this.externalEvents.some(
      (e) =>
        e.tenantId === input.tenantId &&
        e.obligationId === input.obligationId &&
        e.eventKind === input.eventKind &&
        e.externalReference === input.externalReference,
    );
    if (duplicate) {
      throw new InMemoryFinancialConflictError(
        `Duplicate external event: ${input.eventKind}:${input.externalReference}`,
      );
    }
    this.externalEvents.push({
      tenantId: input.tenantId,
      obligationId: input.obligationId,
      eventKind: input.eventKind,
      externalReference: input.externalReference,
      recordedBy: input.recordedBy,
      seq: ++this.seq,
      ...(input.amount !== undefined ? { amount: normalizeAmount(input.amount) } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.externalMessageId !== undefined
        ? { externalMessageId: input.externalMessageId }
        : {}),
    });
  }

  insertReconciliation(input: {
    readonly tenantId: string;
    readonly obligationId: string;
    readonly outcome: 'matched' | 'mismatch' | 'resolved';
    readonly reason?: string;
    readonly recordedBy: string;
  }): { readonly expectedAmount: string; readonly confirmedAmount: string; readonly discrepancyAmount: string } {
    const rec = this.require(input.tenantId, input.obligationId);
    const confirmation = this.latestAccountingConfirmation(input.tenantId, input.obligationId);
    const expected = rec.assessedAmount;
    const confirmed = confirmation?.amount ?? expected;
    const disc = discrepancy(expected, confirmed);
    this.reconciliations.push({
      tenantId: input.tenantId,
      obligationId: input.obligationId,
      expectedAmount: expected,
      confirmedAmount: confirmed,
      discrepancyAmount: disc,
      currency: rec.currency,
      outcome: input.outcome,
      recordedBy: input.recordedBy,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    return { expectedAmount: expected, confirmedAmount: confirmed, discrepancyAmount: disc };
  }

  insertClearance(input: {
    readonly tenantId: string;
    readonly obligationId: string;
    readonly clearanceKind: 'waiver' | 'exemption';
    readonly reason?: string;
    readonly authorizedBy: string;
  }): void {
    this.require(input.tenantId, input.obligationId);
    this.clearances.push({
      tenantId: input.tenantId,
      obligationId: input.obligationId,
      clearanceKind: input.clearanceKind,
      authorizedBy: input.authorizedBy,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
  }

  // --- Test/read introspection helpers ----------------------------------------------------

  /** Blocking obligation ids for an affiliation application (test affordance for the clearance
   *  reader). Tenant-scoped, mirroring RLS. */
  blockingObligationIdsForApplication(
    tenantId: string,
    affiliationApplicationId: string,
  ): readonly string[] {
    return [...this.obligations.values()]
      .filter(
        (o) =>
          o.tenantId === tenantId &&
          o.affiliationApplicationId === affiliationApplicationId &&
          o.blocking,
      )
      .map((o) => o.id);
  }

  /** Count append-only history rows across all fact tables (for idempotency assertions). */
  countHistory(tenantId: string, obligationId: string): {
    readonly assessments: number;
    readonly externalEvents: number;
    readonly reconciliations: number;
    readonly clearances: number;
  } {
    const inScope = <T extends { tenantId: string; obligationId: string }>(rows: readonly T[]): number =>
      rows.filter((r) => r.tenantId === tenantId && r.obligationId === obligationId).length;
    return {
      assessments: inScope(this.assessments),
      externalEvents: inScope(this.externalEvents),
      reconciliations: inScope(this.reconciliations),
      clearances: inScope(this.clearances),
    };
  }

  amountsMatch(tenantId: string, obligationId: string): boolean | undefined {
    const rec = this.obligations.get(obligationId);
    if (rec === undefined || rec.tenantId !== tenantId) return undefined;
    const confirmation = this.latestAccountingConfirmation(tenantId, obligationId);
    if (confirmation?.amount === undefined) return undefined;
    return amountsEqual(rec.assessedAmount, confirmation.amount);
  }

  private latestAccountingConfirmation(
    tenantId: string,
    obligationId: string,
  ): ExternalEventRecord | undefined {
    return this.externalEvents
      .filter(
        (e) =>
          e.tenantId === tenantId &&
          e.obligationId === obligationId &&
          e.eventKind === 'accounting_confirmation',
      )
      .sort((a, b) => b.seq - a.seq)[0];
  }

  private require(tenantId: string, obligationId: string): ObligationRecord {
    const rec = this.obligations.get(obligationId);
    if (rec === undefined || rec.tenantId !== tenantId) {
      throw new InMemoryFinancialConflictError(`Obligation not found: ${obligationId}`);
    }
    return rec;
  }

  private toHead(rec: ObligationRecord): FinancialObligationHead {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      affiliationApplicationId: rec.affiliationApplicationId,
      subjectId: rec.subjectId,
      season: rec.season,
      obligationType: rec.obligationType,
      assessmentBasis: rec.assessmentBasis,
      assessmentVersion: rec.assessmentVersion,
      assessedAmount: rec.assessedAmount,
      currency: rec.currency,
      blocking: rec.blocking,
      assessedBy: rec.assessedBy,
    };
  }
}
