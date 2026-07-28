/**
 * AffiliationFinancialObligation domain persistence port (READ-only runtime surface).
 *
 * The affiliation-finance domain owns FINANCIAL FACTS (obligation head, assessment history,
 * external events, reconciliation outcomes, clearances). It does NOT own governed lifecycle
 * state — that lives in `governance.entity_state`, written exclusively by the kernel.
 *
 * This port exposes ONLY the reads the guards, the reconcile-decision, and query endpoints
 * need. It deliberately exposes NO method that mutates governed lifecycle state. Domain-fact
 * WRITES happen exclusively through the kernel's {@link TransitionDomainEffect} inside a governed
 * transaction (see {@link PgFinancialObligationEffect}). All methods are tenant-scoped and MUST
 * fail CLOSED when the obligation (or a required fact) is missing.
 */

/** A snapshot of an obligation head's persisted facts. */
export interface FinancialObligationHead {
  readonly id: string;
  readonly tenantId: string;
  readonly affiliationApplicationId: string;
  readonly subjectId: string;
  readonly season: string;
  readonly obligationType: string;
  readonly assessmentBasis: string;
  readonly assessmentVersion: number;
  /** Decimal string, exactly two fractional digits (e.g. "125.00"). */
  readonly assessedAmount: string;
  readonly currency: string;
  readonly blocking: boolean;
  readonly assessedBy: string;
}

/**
 * The reconciliation inputs for an obligation: the currently ASSESSED (expected) amount and the
 * latest ACCOUNTING-CONFIRMED amount (if any). Both are decimal strings in the same currency.
 * `confirmedAmount`/`confirmedCurrency` are undefined when no accounting confirmation exists.
 */
export interface FinancialReconciliationView {
  readonly obligationId: string;
  readonly expectedAmount: string;
  readonly expectedCurrency: string;
  readonly confirmedAmount?: string;
  readonly confirmedCurrency?: string;
  /** True when at least one accounting_confirmation external event has been recorded. */
  readonly hasAccountingConfirmation: boolean;
}

/**
 * Read-only domain facts source for the affiliation-finance runtime. All methods are
 * tenant-scoped, side-effect-free, and fail CLOSED (return undefined / false) when the
 * obligation or a required fact is missing.
 */
export interface FinancialObligationStore {
  /** Return the obligation head facts, or undefined when it does not exist for the tenant. */
  getObligation(
    tenantId: string,
    obligationId: string,
  ): Promise<FinancialObligationHead | undefined>;

  /**
   * Return the reconciliation view (expected vs latest confirmed amount) for an obligation, or
   * undefined when the obligation does not exist. Used by the service to DETERMINISTICALLY drive
   * `reconcile` (amounts equal) vs `record_mismatch` (amounts differ), and by the guards to
   * re-verify the same persisted facts (fail closed).
   */
  getReconciliationView(
    tenantId: string,
    obligationId: string,
  ): Promise<FinancialReconciliationView | undefined>;

  /** True only when at least one accounting_confirmation event exists for the obligation. */
  hasAccountingConfirmation(tenantId: string, obligationId: string): Promise<boolean>;
}
