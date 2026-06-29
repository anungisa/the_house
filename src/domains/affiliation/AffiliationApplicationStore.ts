/**
 * AffiliationApplication domain persistence port.
 *
 * The affiliation domain owns APPLICATION FACTS (required-field completeness, documents,
 * compliance flags, payment obligations, season currency, generic org/scope metadata). It
 * does NOT own governed lifecycle state — that lives in `governance.entity_state` and is
 * written exclusively by the Governance Kernel.
 *
 * This port is intentionally READ-ONLY for the runtime/guard path: it exposes only the
 * reads guards need. It deliberately exposes NO method that mutates governed lifecycle
 * state or status. Test/seed mutation of domain facts lives on the concrete
 * implementations (in-memory setters, pg seed helpers), never here.
 */

/** A snapshot of an application's persisted facts. */
export interface AffiliationApplicationFacts {
  readonly id: string;
  readonly tenantId: string;
  readonly seasonId: string;
  readonly requiredFieldsComplete: boolean;
  readonly documentsVerified: boolean;
  readonly paymentStatus: string;
  readonly organizationId?: string;
  readonly organizationUnitId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;
  readonly scopeType?: string;
  readonly scopeId?: string;
  readonly applicationType?: string;
  readonly applicantUserId?: string;
}

/**
 * Read-only domain facts source consumed by the affiliation guard repository. All methods
 * are tenant-scoped and side-effect-free. Implementations must fail CLOSED when the
 * application (or required fact) is missing.
 */
export interface AffiliationApplicationStore {
  /** Return the application's persisted facts, or undefined when it does not exist. */
  getApplicationFacts(
    tenantId: string,
    applicationId: string,
  ): Promise<AffiliationApplicationFacts | undefined>;

  /** True only when the application exists AND its required fields are complete. */
  areRequiredFieldsComplete(tenantId: string, applicationId: string): Promise<boolean>;

  /**
   * True only when the application exists AND no REQUIRED document is in a non-approved
   * status (missing/pending/rejected). Vacuously true when no required documents exist.
   */
  areRequiredDocumentsPresent(tenantId: string, applicationId: string): Promise<boolean>;

  /** True when an OPEN compliance flag exists, OR when the application is missing (fail closed). */
  hasOpenComplianceFlags(tenantId: string, applicationId: string): Promise<boolean>;

  /**
   * True only when the application exists AND no payment obligation is 'unpaid' or
   * 'failed'. Authoritative source is the payment_obligation records.
   */
  isPaymentSatisfied(tenantId: string, applicationId: string): Promise<boolean>;

  /** True only when a season row marked current matches `seasonId` for the tenant. */
  isSeasonCurrent(tenantId: string, seasonId: string): Promise<boolean>;
}
