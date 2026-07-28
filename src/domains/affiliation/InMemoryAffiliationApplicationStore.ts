/**
 * In-memory {@link AffiliationApplicationStore} for unit tests.
 *
 * Seed helpers (`seedApplication`, `addDocument`, `addComplianceFlag`, `addPayment`,
 * `setCurrentSeason`) populate DOMAIN FACTS only. None of them touch governed lifecycle
 * state — the kernel remains the sole authority for `governance.entity_state`.
 */

import type {
  AffiliationApplicationFacts,
  AffiliationApplicationStore,
} from './AffiliationApplicationStore.js';

interface DocumentRecord {
  readonly applicationId: string;
  readonly required: boolean;
  readonly status: 'approved' | 'pending' | 'rejected' | 'missing';
}

interface ComplianceRecord {
  readonly applicationId: string;
  readonly status: 'open' | 'resolved' | 'dismissed';
}

interface PaymentRecord {
  readonly applicationId: string;
  readonly status: 'unpaid' | 'paid' | 'waived' | 'refunded' | 'failed';
}

interface ApplicationRecord extends AffiliationApplicationFacts {
  readonly tenantId: string;
}

function key(tenantId: string, applicationId: string): string {
  return `${tenantId}:${applicationId}`;
}

export class InMemoryAffiliationApplicationStore implements AffiliationApplicationStore {
  private readonly applications = new Map<string, ApplicationRecord>();
  private readonly documents: DocumentRecord[] = [];
  private readonly complianceFlags: ComplianceRecord[] = [];
  private readonly payments: PaymentRecord[] = [];
  private readonly currentSeasons = new Set<string>();
  /**
   * Test-only simulation of governed ACTIVE standing (in production this is authoritative
   * in governance.entity_state). Keyed by `tenantId:applicationId`.
   */
  private readonly activeStandings = new Set<string>();

  // --- Seed helpers (test-only; domain facts, NOT governed lifecycle) ---

  seedApplication(
    facts: Omit<AffiliationApplicationFacts, 'requiredFieldsComplete' | 'documentsVerified' | 'paymentStatus'> &
      Partial<
        Pick<AffiliationApplicationFacts, 'requiredFieldsComplete' | 'documentsVerified' | 'paymentStatus'>
      >,
  ): this {
    this.applications.set(key(facts.tenantId, facts.id), {
      requiredFieldsComplete: false,
      documentsVerified: false,
      paymentStatus: 'unpaid',
      ...facts,
    });
    return this;
  }

  addDocument(document: DocumentRecord): this {
    this.documents.push(document);
    return this;
  }

  addComplianceFlag(flag: ComplianceRecord): this {
    this.complianceFlags.push(flag);
    return this;
  }

  addPayment(payment: PaymentRecord): this {
    this.payments.push(payment);
    return this;
  }

  setCurrentSeason(tenantId: string, seasonId: string): this {
    this.currentSeasons.add(key(tenantId, seasonId));
    return this;
  }

  /**
   * Test-only: mark an application as currently holding ACTIVE governed standing so the
   * uniqueness read (`hasConflictingActiveAffiliation`) can observe a conflict. Simulates
   * governance.entity_state.current_state = 'active' without touching governed state.
   */
  markActiveStanding(tenantId: string, applicationId: string): this {
    this.activeStandings.add(key(tenantId, applicationId));
    return this;
  }

  // --- Read API (AffiliationApplicationStore) ---

  getApplicationFacts(
    tenantId: string,
    applicationId: string,
  ): Promise<AffiliationApplicationFacts | undefined> {
    return Promise.resolve(this.applications.get(key(tenantId, applicationId)));
  }

  async areRequiredFieldsComplete(tenantId: string, applicationId: string): Promise<boolean> {
    const app = await this.getApplicationFacts(tenantId, applicationId);
    return app?.requiredFieldsComplete === true;
  }

  async areRequiredDocumentsPresent(tenantId: string, applicationId: string): Promise<boolean> {
    const app = await this.getApplicationFacts(tenantId, applicationId);
    if (app === undefined) return false;
    const blocking = this.documents.some(
      (d) => d.applicationId === applicationId && d.required && d.status !== 'approved',
    );
    return !blocking;
  }

  async hasOpenComplianceFlags(tenantId: string, applicationId: string): Promise<boolean> {
    const app = await this.getApplicationFacts(tenantId, applicationId);
    // Fail closed: a missing application is treated as having open flags (blocks).
    if (app === undefined) return true;
    return this.complianceFlags.some(
      (f) => f.applicationId === applicationId && f.status === 'open',
    );
  }

  async isPaymentSatisfied(tenantId: string, applicationId: string): Promise<boolean> {
    const app = await this.getApplicationFacts(tenantId, applicationId);
    if (app === undefined) return false;
    const unsettled = this.payments.some(
      (p) => p.applicationId === applicationId && (p.status === 'unpaid' || p.status === 'failed'),
    );
    return !unsettled;
  }

  isSeasonCurrent(tenantId: string, seasonId: string): Promise<boolean> {
    return Promise.resolve(this.currentSeasons.has(key(tenantId, seasonId)));
  }

  async hasConflictingActiveAffiliation(
    tenantId: string,
    applicationId: string,
  ): Promise<boolean> {
    const me = await this.getApplicationFacts(tenantId, applicationId);
    if (me === undefined) return false;
    const subject = me.scopeId ?? me.localOrganizationId ?? me.organizationId;
    // Absence of a subject cannot assert a duplicate.
    if (subject === undefined) return false;
    for (const other of this.applications.values()) {
      if (other.tenantId !== tenantId) continue;
      if (other.id === applicationId) continue;
      if (other.seasonId !== me.seasonId) continue;
      const otherSubject = other.scopeId ?? other.localOrganizationId ?? other.organizationId;
      if (otherSubject !== subject) continue;
      if (this.activeStandings.has(key(tenantId, other.id))) return true;
    }
    return false;
  }
}
