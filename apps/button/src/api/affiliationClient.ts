/**
 * Injectable Button affiliation-draft API client (Slice C).
 *
 * The app depends on the {@link AffiliationApiClient} interface, never on `fetch` directly, so
 * tests and end-to-end runs can substitute a deterministic transport. The real transport calls the
 * bounded, task-specific `/v1/button/affiliation` endpoints (and the governed evidence upload
 * endpoint) with `credentials: same-origin`; a verifying edge injects the trusted identity headers.
 * The browser NEVER asserts identity, authority, or completeness — every decision is re-authorized
 * server-side.
 *
 * Optimistic concurrency: every projection carries a `concurrencyToken`; the client echoes it as
 * `If-Match` on the next draft write and surfaces a `version-conflict` when the server rejects a
 * stale write (409), so the UI can reconcile without duplicating a mutation.
 */

import {
  AffiliationApiError,
  type AffiliationApplicationProjection,
  type AffiliationErrorCategory,
  type AffiliationOverview,
  type DraftResponseInput,
  type SubmissionReceipt,
  type AffiliationReviewQueueItem,
  type AffiliationReviewCase,
  type AffiliationDecisionState,
  type CorrectionReason,
  type CorrectionRequestView,
  type AffiliationSubmissionState,
  type FinancialObligationQueueItem,
  type FinancialReconciliationResult,
  type StandingView,
} from './affiliationTypes';
import { AffiliationMockStore } from './affiliationMockData';
export interface GetOverviewInput {
  readonly organizationId: string;
  readonly season: string;
  readonly pathway?: string;
}

export interface InitiateInput {
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway?: string;
}

export interface SaveDraftInput {
  readonly applicationId: string;
  readonly expectedVersion: string;
  readonly responses: readonly DraftResponseInput[];
}

export interface AssociateEvidenceInput {
  readonly applicationId: string;
  readonly requirementCode: string;
  readonly file: File;
}

export interface RemoveEvidenceInput {
  readonly applicationId: string;
  readonly linkId: string;
}

export interface SubmitAffiliationInput {
  readonly applicationId: string;
  readonly expectedVersion: string;
  readonly idempotencyKey: string;
}

export interface ResubmitCorrectionInput extends SubmitAffiliationInput {
  readonly correctionRequestId: string;
}

export interface AffiliationApiClient {
  getOverview(input: GetOverviewInput): Promise<AffiliationOverview>;
  initiate(input: InitiateInput): Promise<AffiliationApplicationProjection>;
  getApplication(applicationId: string): Promise<AffiliationApplicationProjection>;
  saveDraft(input: SaveDraftInput): Promise<AffiliationApplicationProjection>;
  associateEvidence(input: AssociateEvidenceInput): Promise<AffiliationApplicationProjection>;
  removeEvidence(input: RemoveEvidenceInput): Promise<AffiliationApplicationProjection>;
  /** Slice D command; optional for legacy Slice C-only test doubles. */
  submit?(input: SubmitAffiliationInput): Promise<SubmissionReceipt>;
  listReviewQueue?(): Promise<readonly AffiliationReviewQueueItem[]>;
  startReview?(applicationId: string, idempotencyKey: string): Promise<AffiliationReviewQueueItem>;
  getReviewCase?(applicationId: string): Promise<AffiliationReviewCase>;
  openCorrection?(
    applicationId: string,
    reasons: readonly CorrectionReason[],
  ): Promise<CorrectionRequestView>;
  getDecisionState?(applicationId: string): Promise<AffiliationDecisionState | null>;
  proposeDecision?(
    applicationId: string,
    outcome: 'approve' | 'reject',
    reason: string,
  ): Promise<AffiliationDecisionState>;
  decideTier?(
    applicationId: string,
    state: AffiliationDecisionState,
    decision: 'approve' | 'reject',
    reason: string,
  ): Promise<AffiliationDecisionState>;
  executeDecision?(
    applicationId: string,
    state: AffiliationDecisionState,
  ): Promise<{ lifecycleState: string; idempotentReplay: boolean }>;
  activate?(
    applicationId: string,
  ): Promise<{ lifecycleState: string; idempotentReplay: boolean }>;
  listFinancialObligations?(): Promise<readonly FinancialObligationQueueItem[]>;
  reconcileFinancialObligation?(
    obligationId: string,
    reason: string,
  ): Promise<FinancialReconciliationResult>;
  listStanding?(): Promise<readonly StandingView[]>;
  getStanding?(standingId: string): Promise<StandingView>;
  getSubmissionState?(applicationId: string): Promise<AffiliationSubmissionState>;
  resubmitCorrection?(input: ResubmitCorrectionInput): Promise<SubmissionReceipt>;
}

function categoryFor(status: number, code: string | undefined): AffiliationErrorCategory {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'access-denied';
  if (status === 404) return 'not-found';
  if (status === 409) return 'version-conflict';
  if (status === 400) {
    return code === 'AFFILIATION_EVIDENCE_REFERENCE_INVALID' ? 'evidence-invalid' : 'invalid-input';
  }
  return 'service-unavailable';
}

interface ErrorEnvelope {
  readonly status: 'error';
  readonly code?: string;
  readonly message?: string;
}

const EVIDENCE_ASSOCIATION_RETRY_LIMIT = 5;
const EVIDENCE_ASSOCIATION_RETRY_DELAY_MS = 100;

/** Real transport against the governed House HTTP surface. */
export class HttpAffiliationApiClient implements AffiliationApiClient {
  constructor(private readonly baseUrl = '') {}

  private async wait(delayMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    extract: (body: unknown) => T,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        credentials: 'same-origin',
        ...init,
      });
    } catch {
      throw new AffiliationApiError('service-unavailable', 0, 'The service is temporarily unavailable.');
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      const envelope = (parsed ?? {}) as ErrorEnvelope;
      throw new AffiliationApiError(
        categoryFor(response.status, envelope.code),
        response.status,
        'The request could not be completed.',
      );
    }
    return extract(parsed);
  }

  async getOverview(input: GetOverviewInput): Promise<AffiliationOverview> {
    const params = new URLSearchParams({ organizationId: input.organizationId, season: input.season });
    if (input.pathway) params.set('pathway', input.pathway);
    return this.request(
      `/v1/button/affiliation?${params.toString()}`,
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { overview: AffiliationOverview }).overview,
    );
  }

  async initiate(input: InitiateInput): Promise<AffiliationApplicationProjection> {
    return this.request(
      '/v1/button/affiliation/applications',
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId: input.organizationId,
          seasonId: input.seasonId,
          ...(input.pathway ? { pathway: input.pathway } : {}),
        }),
      },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }

  async getApplication(applicationId: string): Promise<AffiliationApplicationProjection> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}`,
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }

  async saveDraft(input: SaveDraftInput): Promise<AffiliationApplicationProjection> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(input.applicationId)}/draft`,
      {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'If-Match': `"${input.expectedVersion}"`,
        },
        body: JSON.stringify({ responses: input.responses }),
      },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }

  async associateEvidence(input: AssociateEvidenceInput): Promise<AffiliationApplicationProjection> {
    // Two governed steps: upload the payload through the evidence boundary, then associate the
    // resulting reference. Association is NOT acceptance — the governed evidence review is separate.
    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const uploaded = await this.request(
      '/v1/evidence/objects',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': input.file.type || 'application/octet-stream',
          'x-house-source-filename': encodeURIComponent(input.file.name),
        },
        body: bytes,
      },
      (body) => body as { evidenceObjectId: string; contentHash: string; contentType: string },
    );

    for (let attempt = 0; attempt < EVIDENCE_ASSOCIATION_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.request(
          `/v1/button/affiliation/applications/${encodeURIComponent(input.applicationId)}/evidence-links`,
          {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify({
              requirementCode: input.requirementCode,
              evidenceObjectId: uploaded.evidenceObjectId,
              contentHash: uploaded.contentHash,
              contentType: uploaded.contentType,
              displayName: input.file.name,
            }),
          },
          (body) => (body as { application: AffiliationApplicationProjection }).application,
        );
      } catch (error) {
        if (
          error instanceof AffiliationApiError &&
          error.category === 'evidence-invalid' &&
          attempt + 1 < EVIDENCE_ASSOCIATION_RETRY_LIMIT
        ) {
          await this.wait(EVIDENCE_ASSOCIATION_RETRY_DELAY_MS);
          continue;
        }
        throw error;
      }
    }

    throw new AffiliationApiError(
      'service-unavailable',
      0,
      'The service is temporarily unavailable.',
    );
  }

  async removeEvidence(input: RemoveEvidenceInput): Promise<AffiliationApplicationProjection> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(
        input.applicationId,
      )}/evidence-links/${encodeURIComponent(input.linkId)}`,
      { method: 'DELETE', headers: { accept: 'application/json' } },
      (body) => (body as { application: AffiliationApplicationProjection }).application,
    );
  }

  async submit(input: SubmitAffiliationInput): Promise<SubmissionReceipt> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(input.applicationId)}/submissions`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'If-Match': `"${input.expectedVersion}"`,
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({ expectedVersion: input.expectedVersion }),
      },
      (body) => (body as { receipt: SubmissionReceipt }).receipt,
    );
  }

  async listReviewQueue(): Promise<readonly AffiliationReviewQueueItem[]> {
    return this.request(
      '/v1/button/affiliation/review-queue',
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { items: readonly AffiliationReviewQueueItem[] }).items,
    );
  }

  async startReview(
    applicationId: string,
    idempotencyKey: string,
  ): Promise<AffiliationReviewQueueItem> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/review-start`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: '{}',
      },
      (body) => (body as { item: AffiliationReviewQueueItem }).item,
    );
  }

  async getReviewCase(applicationId: string): Promise<AffiliationReviewCase> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/review-case`,
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { reviewCase: AffiliationReviewCase }).reviewCase,
    );
  }

  async openCorrection(
    applicationId: string,
    reasons: readonly CorrectionReason[],
  ): Promise<CorrectionRequestView> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/corrections`,
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ reasons }),
      },
      (body) => (body as { correction: CorrectionRequestView }).correction,
    );
  }

  async getDecisionState(applicationId: string): Promise<AffiliationDecisionState | null> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/decision-state`,
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { decisionState: AffiliationDecisionState | null }).decisionState,
    );
  }

  async proposeDecision(
    applicationId: string,
    outcome: 'approve' | 'reject',
    reason: string,
  ): Promise<AffiliationDecisionState> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/decision-proposals`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': `decision-proposal-${applicationId}-${outcome}`,
        },
        body: JSON.stringify({ outcome, reason }),
      },
      (body) => (body as { decisionState: AffiliationDecisionState }).decisionState,
    );
  }

  async decideTier(
    applicationId: string,
    state: AffiliationDecisionState,
    decision: 'approve' | 'reject',
    reason: string,
  ): Promise<AffiliationDecisionState> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/tier-decisions`,
      {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowInstanceId: state.workflowInstanceId,
          stepCode: state.currentStepCode,
          decision,
          reason,
        }),
      },
      (body) => (body as { decisionState: AffiliationDecisionState }).decisionState,
    );
  }

  async executeDecision(
    applicationId: string,
    state: AffiliationDecisionState,
  ): Promise<{ lifecycleState: string; idempotentReplay: boolean }> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/decision-executions`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': `decision-execution-${state.workflowInstanceId}`,
        },
        body: JSON.stringify({ workflowInstanceId: state.workflowInstanceId }),
      },
      (body) =>
        (body as { execution: { lifecycleState: string; idempotentReplay: boolean } }).execution,
    );
  }

  async activate(
    applicationId: string,
  ): Promise<{ lifecycleState: string; idempotentReplay: boolean }> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/activations`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': `affiliation-activation-${applicationId}`,
        },
        body: JSON.stringify({ reason: 'Activate approved affiliation.' }),
      },
      (body) =>
        (body as { activation: { lifecycleState: string; idempotentReplay: boolean } }).activation,
    );
  }

  async listFinancialObligations(): Promise<readonly FinancialObligationQueueItem[]> {
    return this.request(
      '/v1/button/affiliation/financial-obligations',
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { items: readonly FinancialObligationQueueItem[] }).items,
    );
  }

  async reconcileFinancialObligation(
    obligationId: string,
    reason: string,
  ): Promise<FinancialReconciliationResult> {
    return this.request(
      `/v1/button/affiliation/financial-obligations/${encodeURIComponent(obligationId)}/reconciliations`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'idempotency-key': `financial-reconciliation-${obligationId}`,
        },
        body: JSON.stringify({ reason }),
      },
      (body) => body as FinancialReconciliationResult,
    );
  }

  async listStanding(): Promise<readonly StandingView[]> {
    return this.request(
      '/v1/button/affiliation/standing',
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { items: readonly StandingView[] }).items,
    );
  }

  async getStanding(standingId: string): Promise<StandingView> {
    return this.request(
      `/v1/button/affiliation/standing/${encodeURIComponent(standingId)}`,
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { standing: StandingView }).standing,
    );
  }

  async getSubmissionState(applicationId: string): Promise<AffiliationSubmissionState> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(applicationId)}/submission-state`,
      { method: 'GET', headers: { accept: 'application/json' } },
      (body) => (body as { submissionState: AffiliationSubmissionState }).submissionState,
    );
  }

  async resubmitCorrection(input: ResubmitCorrectionInput): Promise<SubmissionReceipt> {
    return this.request(
      `/v1/button/affiliation/applications/${encodeURIComponent(input.applicationId)}/corrections/${encodeURIComponent(input.correctionRequestId)}/resubmissions`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'if-match': `"${input.expectedVersion}"`,
          'idempotency-key': input.idempotencyKey,
        },
        body: '{}',
      },
      (body) => (body as { receipt: SubmissionReceipt }).receipt,
    );
  }
}

/**
 * Deterministic mock transport for browser tests and offline development. Backed by a stateful
 * in-memory store that mirrors the governed surface (versioning, conflicts, evidence association).
 */
export class MockAffiliationApiClient implements AffiliationApiClient {
  private reviewQueue: AffiliationReviewQueueItem[] = [
    {
      applicationId: 'review-app-0001',
      organizationId: 'club-1',
      seasonId: '2025-26',
      pathway: 'new_affiliation',
      lifecycleState: 'submitted',
      submittedAt: '2026-01-15T00:00:00.000Z',
      submissionSequence: 1,
    },
  ];
  constructor(private readonly store: AffiliationMockStore = new AffiliationMockStore()) {}
  private decisionState: AffiliationDecisionState | null = null;
  private financialObligations: FinancialObligationQueueItem[] = [
    {
      obligationId: 'obligation-0001',
      affiliationApplicationId: 'review-app-0001',
      season: '2025-26',
      obligationType: 'affiliation_fee',
      assessmentBasis: 'Annual affiliation fee',
      assessmentVersion: 1,
      assessedAmount: '250.00',
      currency: 'CAD',
      blocking: true,
      lifecycleState: 'confirmed',
      hasAccountingConfirmation: true,
      canReconcile: true,
      confirmedAmount: '250.00',
      confirmedCurrency: 'CAD',
    },
  ];
  private standings: StandingView[] = [
    {
      standingId: 'standing-0001',
      affiliationApplicationId: 'review-app-0001',
      organizationId: 'club-1',
      season: '2025-26',
      status: 'active',
      effectiveFrom: '2025-09-01T00:00:00.000Z',
      effectiveUntil: '2026-08-31T00:00:00.000Z',
      standingVersion: 1,
      pathway: 'new_affiliation',
      isExpired: false,
      daysUntilExpiry: 120,
    },
    {
      standingId: 'standing-0002',
      affiliationApplicationId: 'review-app-0002',
      organizationId: 'club-1',
      season: '2024-25',
      status: 'lapsed',
      effectiveFrom: '2024-09-01T00:00:00.000Z',
      effectiveUntil: '2025-08-31T00:00:00.000Z',
      standingVersion: 1,
      pathway: 'new_affiliation',
      isExpired: true,
      daysUntilExpiry: null,
    },
  ];

  async getOverview(input: GetOverviewInput): Promise<AffiliationOverview> {
    return this.store.overview(input.organizationId, input.season, input.pathway ?? 'new_affiliation');
  }

  async initiate(input: InitiateInput): Promise<AffiliationApplicationProjection> {
    return this.store.initiate(input.organizationId, input.seasonId, input.pathway ?? 'new_affiliation');
  }

  async getApplication(applicationId: string): Promise<AffiliationApplicationProjection> {
    return this.store.getApplication(applicationId);
  }

  async saveDraft(input: SaveDraftInput): Promise<AffiliationApplicationProjection> {
    return this.store.saveDraft(input.applicationId, input.expectedVersion, input.responses);
  }

  async associateEvidence(input: AssociateEvidenceInput): Promise<AffiliationApplicationProjection> {
    return this.store.associateEvidence(input.applicationId, input.requirementCode, input.file.name);
  }

  async removeEvidence(input: RemoveEvidenceInput): Promise<AffiliationApplicationProjection> {
    return this.store.removeEvidence(input.applicationId, input.linkId);
  }

  async submit(input: SubmitAffiliationInput): Promise<SubmissionReceipt> {
    return this.store.submit(input.applicationId, input.expectedVersion, input.idempotencyKey);
  }

  async listReviewQueue(): Promise<readonly AffiliationReviewQueueItem[]> {
    return this.reviewQueue;
  }

  async startReview(applicationId: string): Promise<AffiliationReviewQueueItem> {
    const current = this.reviewQueue.find((item) => item.applicationId === applicationId);
    if (current === undefined) {
      throw new AffiliationApiError('not-found', 404, 'Affiliation application not found.');
    }
    if (current.lifecycleState === 'under_review') return current;
    const assigned: AffiliationReviewQueueItem = {
      ...current,
      lifecycleState: 'under_review',
      assignedReviewerUserId: 'reviewer',
      assignedAt: '2026-01-15T00:05:00.000Z',
    };
    this.reviewQueue = this.reviewQueue.map((item) =>
      item.applicationId === applicationId ? assigned : item,
    );
    return assigned;
  }

  async getReviewCase(applicationId: string): Promise<AffiliationReviewCase> {
    const item = this.reviewQueue.find(
      (candidate) =>
        candidate.applicationId === applicationId && candidate.lifecycleState !== 'submitted',
    );
    const lifecycleState = item?.lifecycleState;
    if (item?.assignedReviewerUserId === undefined) {
      throw new AffiliationApiError('not-found', 404, 'Affiliation application not found.');
    }
    if (lifecycleState === undefined || lifecycleState === 'submitted') {
      throw new AffiliationApiError('not-found', 404, 'Affiliation application not found.');
    }
    return {
      applicationId,
      ...(item.organizationId !== undefined ? { organizationId: item.organizationId } : {}),
      seasonId: item.seasonId,
      ...(item.pathway !== undefined ? { pathway: item.pathway } : {}),
      lifecycleState,
      submissionSequence: item.submissionSequence,
      submittedAt: item.submittedAt,
      assignedReviewerUserId: item.assignedReviewerUserId,
      requirements: [
        {
          code: 'ORG_PROFILE_CONFIRMATION',
          version: 1,
          titleEn: 'Confirm organization profile',
          titleFr: 'Confirmer le profil de l\u2019organisation',
          guidanceEn: 'Confirm the submitted organization details.',
          guidanceFr: 'Confirmez les renseignements soumis sur l\u2019organisation.',
          appliesBecause: 'Required for this affiliation pathway.',
          response: { acknowledged: true },
          evidence: [],
        },
        {
          code: 'GOVERNING_DOCUMENT',
          version: 1,
          titleEn: 'Governing document',
          titleFr: 'Document constitutif',
          guidanceEn: 'Review the submitted governing document reference.',
          guidanceFr: 'Examinez la r\u00e9f\u00e9rence du document constitutif soumis.',
          appliesBecause: 'Required documentary evidence.',
          response: { attached: true },
          evidence: [
            {
              evidenceObjectId: 'evidence-review-1',
              contentType: 'application/pdf',
              displayName: 'governing-document.pdf',
            },
          ],
        },
      ],
    };
  }

  async openCorrection(
    applicationId: string,
    reasons: readonly CorrectionReason[],
  ): Promise<CorrectionRequestView> {
    if (reasons.length === 0) {
      throw new AffiliationApiError('invalid-input', 400, 'A correction reason is required.');
    }
    return {
      correctionRequestId: `correction-${applicationId}`,
      applicationId,
      status: 'open',
      requirementCodes: reasons.map((reason) => reason.requirementCode),
      reasons,
      openedAt: '2026-01-15T00:10:00.000Z',
    };
  }

  async getDecisionState(): Promise<AffiliationDecisionState | null> {
    return this.decisionState;
  }

  async proposeDecision(
    _applicationId: string,
    outcome: 'approve' | 'reject',
  ): Promise<AffiliationDecisionState> {
    this.decisionState = {
      workflowInstanceId: 'workflow-review-1',
      outcome,
      status: 'pending',
      currentStepCode: 'regional_signoff',
      executable: false,
      executed: false,
      steps: [
        {
          stepCode: 'regional_signoff',
          stepOrder: 1,
          reviewTier: 'regional_review',
          required: true,
          status: 'pending',
          assignedRoleKey: 'regional_reviewer',
        },
        {
          stepCode: 'national_signoff',
          stepOrder: 2,
          reviewTier: 'national_review',
          required: true,
          status: 'pending',
          assignedRoleKey: 'national_reviewer',
        },
      ],
    };
    return this.decisionState;
  }

  async decideTier(
    _applicationId: string,
    state: AffiliationDecisionState,
    decision: 'approve' | 'reject',
  ): Promise<AffiliationDecisionState> {
    const current = state.currentStepCode;
    const steps = state.steps.map((step) =>
      step.stepCode === current
        ? { ...step, status: decision === 'approve' ? ('approved' as const) : ('rejected' as const) }
        : step,
    );
    const next =
      decision === 'approve'
        ? steps.find((step) => step.status === 'pending')?.stepCode
        : undefined;
    this.decisionState = {
      ...state,
      steps,
      status: decision === 'reject' ? 'rejected' : next ? 'pending' : 'approved',
      ...(next ? { currentStepCode: next } : {}),
      executable: decision === 'approve' && next === undefined,
    };
    return this.decisionState;
  }

  async executeDecision(
    applicationId: string,
    state: AffiliationDecisionState,
  ): Promise<{ lifecycleState: string; idempotentReplay: boolean }> {
    this.decisionState = { ...state, executable: false, executed: true };
    const lifecycleState = state.outcome === 'approve' ? 'approved' : 'rejected';
    if (lifecycleState === 'approved') {
      this.reviewQueue = this.reviewQueue.map((item) =>
        item.applicationId === applicationId ? { ...item, lifecycleState: 'approved' } : item,
      );
    }
    return { lifecycleState, idempotentReplay: false };
  }

  async activate(
    applicationId: string,
  ): Promise<{ lifecycleState: string; idempotentReplay: boolean }> {
    const item = this.reviewQueue.find((candidate) => candidate.applicationId === applicationId);
    if (item?.lifecycleState === 'active') {
      return { lifecycleState: 'active', idempotentReplay: true };
    }
    if (item?.lifecycleState !== 'approved') {
      throw new AffiliationApiError('version-conflict', 409, 'Application is not approved.');
    }
    this.reviewQueue = this.reviewQueue.map((candidate) =>
      candidate.applicationId === applicationId
        ? { ...candidate, lifecycleState: 'active' }
        : candidate,
    );
    return { lifecycleState: 'active', idempotentReplay: false };
  }

  async listFinancialObligations(): Promise<readonly FinancialObligationQueueItem[]> {
    return this.financialObligations;
  }

  async reconcileFinancialObligation(
    obligationId: string,
  ): Promise<FinancialReconciliationResult> {
    const obligation = this.financialObligations.find((item) => item.obligationId === obligationId);
    if (obligation === undefined) {
      throw new AffiliationApiError('not-found', 404, 'Financial obligation not found.');
    }
    if (!obligation.hasAccountingConfirmation) {
      throw new AffiliationApiError('version-conflict', 409, 'Accounting confirmation is required.');
    }
    if (!obligation.canReconcile) {
      throw new AffiliationApiError('access-denied', 403, 'Reconciliation authority is required.');
    }
    const replayed = obligation.lifecycleState === 'reconciled';
    this.financialObligations = this.financialObligations.map((item) =>
      item.obligationId === obligationId ? { ...item, lifecycleState: 'reconciled' } : item,
    );
    return { obligationId, toState: 'reconciled', replayed };
  }

  async listStanding(): Promise<readonly StandingView[]> {
    return this.standings;
  }

  async getStanding(standingId: string): Promise<StandingView> {
    const standing = this.standings.find((item) => item.standingId === standingId);
    if (standing === undefined) {
      throw new AffiliationApiError('not-found', 404, 'Standing not found.');
    }
    return standing;
  }

  async getSubmissionState(applicationId: string): Promise<AffiliationSubmissionState> {
    return this.store.getSubmissionState(applicationId);
  }

  async resubmitCorrection(input: ResubmitCorrectionInput): Promise<SubmissionReceipt> {
    return this.store.resubmitCorrection(
      input.applicationId,
      input.correctionRequestId,
      input.expectedVersion,
      input.idempotencyKey,
    );
  }
}

/**
 * Select the affiliation client from the build/runtime environment. When `VITE_BUTTON_MOCK` is set
 * the app runs fully offline against synthetic data (used by the e2e browser suite).
 */
export function createAffiliationApiClient(): AffiliationApiClient {
  if (import.meta.env.VITE_BUTTON_MOCK === '1') {
    return new MockAffiliationApiClient();
  }
  return new HttpAffiliationApiClient();
}
