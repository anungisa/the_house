/**
 * AffiliationStanding domain persistence port (READ-only runtime surface).
 *
 * The affiliation-standing domain owns STANDING FACTS (the standing head with its current effective
 * period + pathway + version, the append-only period history, and the append-only lifecycle event
 * log). It does NOT own governed lifecycle state — that lives in `governance.entity_state`, written
 * exclusively by the kernel.
 *
 * This port exposes ONLY the reads the guards and query paths need (chiefly the current effective
 * period, which the term/renewal-window guards evaluate against an injected clock). It deliberately
 * exposes NO method that mutates governed lifecycle state. Domain-fact WRITES happen exclusively
 * through the kernel's {@link TransitionDomainEffect} inside a governed transaction (see
 * {@link PgAffiliationStandingEffect}). All methods are tenant-scoped and MUST fail CLOSED when the
 * standing (or a required fact) is missing.
 */

/** A snapshot of a standing head's persisted facts. */
export interface AffiliationStandingHead {
  readonly id: string;
  readonly tenantId: string;
  readonly affiliationApplicationId: string;
  readonly subjectId: string;
  readonly season: string;
  /** Monotonically increasing effective-period version (>= 1); incremented on each renewal. */
  readonly standingVersion: number;
  /** ISO-8601 UTC instant the CURRENT effective period begins. */
  readonly effectiveFrom: string;
  /** ISO-8601 UTC instant the CURRENT effective period ends (exclusive). */
  readonly effectiveUntil: string;
  /** Pathway under which the current period was granted/renewed. */
  readonly pathway: string;
  readonly establishedBy: string;
}

/**
 * Read-only domain facts source for the affiliation-standing runtime. All methods are
 * tenant-scoped, side-effect-free, and fail CLOSED (return undefined) when the standing is missing.
 */
export interface AffiliationStandingStore {
  /** Return the standing head facts, or undefined when it does not exist for the tenant. */
  getStanding(
    tenantId: string,
    standingId: string,
  ): Promise<AffiliationStandingHead | undefined>;
}
