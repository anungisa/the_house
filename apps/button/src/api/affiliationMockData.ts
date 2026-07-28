/**
 * Deterministic synthetic affiliation-draft data for browser tests and offline development.
 *
 * NON-PRODUCTION ONLY. This mock is a faithful, in-memory mirror of the governed
 * `/v1/button/affiliation` surface: it binds the applicable versioned requirements on initiate,
 * persists responses under optimistic concurrency (rejecting a stale `expectedVersion` exactly
 * like the server's 409), associates/removes evidence WITHOUT advancing the lifecycle (association
 * ≠ acceptance), and derives completeness/blockers server-side. It lets the e2e suite and unit
 * tests exercise the real client/hook/route/form paths without a backend.
 */

import {
  AffiliationApiError,
  type AffiliationApplicationProjection,
  type AffiliationOverview,
  type CompletenessSummary,
  type DraftEvidenceLinkView,
  type RequirementResponseType,
  type RequirementStatus,
  type RequirementView,
  type SubmissionReceipt,
} from './affiliationTypes';

interface MockRequirementDef {
  readonly code: string;
  readonly version: number;
  readonly responseType: RequirementResponseType;
  readonly evidenceRequired: boolean;
  readonly titleEn: string;
  readonly guidanceEn: string;
  readonly titleFr: string;
  readonly guidanceFr: string;
  readonly orgTypes: readonly string[];
}

const CATALOG: readonly MockRequirementDef[] = [
  {
    code: 'ORG_PROFILE_CONFIRMATION',
    version: 1,
    responseType: 'acknowledgement',
    evidenceRequired: false,
    titleEn: 'Confirm organization profile',
    guidanceEn:
      "Confirm that the organization's registered name, jurisdiction, and primary address on file are current and accurate.",
    titleFr: "Confirmer le profil de l'organisation",
    guidanceFr:
      "Confirmez que le nom enregistré, la juridiction et l'adresse principale de l'organisation au dossier sont à jour et exacts.",
    orgTypes: ['national', 'regional', 'local'],
  },
  {
    code: 'PRIMARY_CONTACT_DETAILS',
    version: 1,
    responseType: 'structured_contact',
    evidenceRequired: false,
    titleEn: 'Primary affiliation contact',
    guidanceEn:
      'Provide the name, role, email, and phone number of the primary contact responsible for this affiliation.',
    titleFr: "Personne-ressource principale de l'affiliation",
    guidanceFr:
      "Indiquez le nom, le rôle, le courriel et le numéro de téléphone de la personne-ressource principale responsable de cette affiliation.",
    orgTypes: ['national', 'regional', 'local'],
  },
  {
    code: 'GOVERNING_DOCUMENT',
    version: 1,
    responseType: 'document_reference',
    evidenceRequired: true,
    titleEn: 'Governing document',
    guidanceEn:
      "Attach the organization's current governing document (constitution or bylaws). A supporting document is required.",
    titleFr: 'Document constitutif',
    guidanceFr:
      "Joignez le document constitutif actuel de l'organisation (constitution ou règlements). Un document justificatif est requis.",
    orgTypes: ['regional', 'local'],
  },
  {
    code: 'INSURANCE_CONFIRMATION',
    version: 1,
    responseType: 'confirmation',
    evidenceRequired: true,
    titleEn: 'Insurance confirmation',
    guidanceEn:
      'Confirm valid liability insurance for the affiliation season and attach the certificate of insurance.',
    titleFr: "Confirmation d'assurance",
    guidanceFr:
      "Confirmez une assurance responsabilité valide pour la saison d'affiliation et joignez le certificat d'assurance.",
    orgTypes: ['local'],
  },
];

const DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  INSURANCE_CONFIRMATION: ['GOVERNING_DOCUMENT'],
};

const KNOWN_ORG = 'club-1';
const ORG_TYPE = 'local';

interface DraftState {
  readonly applicationId: string;
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway: string;
  readonly boundCodes: readonly string[];
  version: number;
  lastSavedAt: string;
  readonly responses: Map<string, Record<string, unknown>>;
  readonly evidence: Map<string, DraftEvidenceLinkView[]>;
  lifecycleStatus: 'draft' | 'submitted';
}

function isAnswered(response: Record<string, unknown> | undefined): boolean {
  return response !== undefined && Object.keys(response).length > 0;
}

function baseStatus(
  evidenceRequired: boolean,
  answered: boolean,
  hasEvidence: boolean,
): RequirementStatus {
  if (evidenceRequired) {
    if (answered && hasEvidence) return 'evidence_associated';
    if (answered && !hasEvidence) return 'evidence_required';
    if (!answered && hasEvidence) return 'in_progress';
    return 'not_started';
  }
  return answered ? 'answered' : 'not_started';
}

function isCompleteStatus(status: RequirementStatus): boolean {
  return status === 'answered' || status === 'evidence_associated';
}

function project(state: DraftState): AffiliationApplicationProjection {
  const bound = CATALOG.filter((d) => state.boundCodes.includes(d.code));
  const boundSet = new Set(bound.map((d) => d.code));

  const base = new Map<string, { status: RequirementStatus; complete: boolean }>();
  for (const def of bound) {
    const answered = isAnswered(state.responses.get(def.code));
    const links = state.evidence.get(def.code) ?? [];
    const status = baseStatus(def.evidenceRequired, answered, links.length > 0);
    base.set(def.code, { status, complete: isCompleteStatus(status) });
  }

  const requirements: RequirementView[] = [];
  const unresolvedBlockers: string[] = [];
  const requiredNextActions: string[] = [];
  let completedCount = 0;

  for (const def of bound) {
    const deps = DEPENDENCIES[def.code] ?? [];
    const activeBlockers = deps.filter(
      (dep) => boundSet.has(dep) && base.get(dep)?.complete !== true,
    );
    const baseEntry = base.get(def.code) ?? { status: 'not_started' as RequirementStatus, complete: false };
    const blocked = activeBlockers.length > 0;
    const status: RequirementStatus = blocked ? 'blocked' : baseEntry.status;
    const complete = !blocked && baseEntry.complete;
    if (complete) completedCount += 1;
    if (blocked) {
      unresolvedBlockers.push(def.code);
      requiredNextActions.push(`Complete ${activeBlockers.join(', ')} before ${def.code}.`);
    } else if (!complete) {
      requiredNextActions.push(`Provide a response for ${def.code}.`);
    }

    requirements.push({
      code: def.code,
      version: def.version,
      responseType: def.responseType,
      evidenceRequired: def.evidenceRequired,
      titleEn: def.titleEn,
      guidanceEn: def.guidanceEn,
      titleFr: def.titleFr,
      guidanceFr: def.guidanceFr,
      appliesBecause: `National Affiliation Policy · ${state.pathway} · ${ORG_TYPE}`,
      response: state.responses.get(def.code) ?? {},
      evidence: state.evidence.get(def.code) ?? [],
      status,
      complete,
      blockedBy: activeBlockers,
    });
  }

  const totalApplicable = bound.length;
  const completeness: CompletenessSummary = {
    totalApplicable,
    completedCount,
    unresolvedBlockers,
    requiredNextActions,
    eligibleForSubmission:
      totalApplicable > 0 && completedCount === totalApplicable && unresolvedBlockers.length === 0,
  };

  return {
    applicationId: state.applicationId,
    organizationId: state.organizationId,
    seasonId: state.seasonId,
    pathway: state.pathway,
    lifecycleStatus: state.lifecycleStatus,
    concurrencyToken: String(state.version),
    lastSavedAt: state.lastSavedAt,
    requirements,
    completeness,
  };
}

/** A stateful, in-memory affiliation store shared by the mock client. */
export class AffiliationMockStore {
  private readonly drafts = new Map<string, DraftState>();
  private readonly submissionReceipts = new Map<string, SubmissionReceipt>();
  private seq = 0;
  private linkSeq = 0;

  private assertKnownOrg(organizationId: string): void {
    if (organizationId !== KNOWN_ORG) {
      throw new AffiliationApiError('not-found', 404, 'Affiliation application not found.');
    }
  }

  overview(organizationId: string, season: string, pathway: string): AffiliationOverview {
    this.assertKnownOrg(organizationId);
    const existing = [...this.drafts.values()].find(
      (d) => d.organizationId === organizationId && d.seasonId === season && d.pathway === pathway,
    );
    return {
      organizationId,
      seasonId: season,
      pathway,
      application: existing
        ? {
            applicationId: existing.applicationId,
            lifecycleStatus: existing.lifecycleStatus,
            lastSavedAt: existing.lastSavedAt,
            completeness: project(existing).completeness,
          }
        : null,
      canInitiate: existing === undefined,
    };
  }

  initiate(organizationId: string, seasonId: string, pathway: string): AffiliationApplicationProjection {
    this.assertKnownOrg(organizationId);
    const existing = [...this.drafts.values()].find(
      (d) => d.organizationId === organizationId && d.seasonId === seasonId && d.pathway === pathway,
    );
    if (existing) return project(existing); // idempotent
    this.seq += 1;
    const applicationId = `app-${this.seq.toString().padStart(4, '0')}`;
    const boundCodes = CATALOG.filter((d) => d.orgTypes.includes(ORG_TYPE)).map((d) => d.code);
    const state: DraftState = {
      applicationId,
      organizationId,
      seasonId,
      pathway,
      boundCodes,
      version: 1,
      lastSavedAt: new Date(0).toISOString(),
      responses: new Map(),
      evidence: new Map(),
      lifecycleStatus: 'draft',
    };
    this.drafts.set(applicationId, state);
    return project(state);
  }

  private require(applicationId: string): DraftState {
    const state = this.drafts.get(applicationId);
    if (state === undefined) {
      throw new AffiliationApiError('not-found', 404, 'Affiliation application not found.');
    }
    return state;
  }

  getApplication(applicationId: string): AffiliationApplicationProjection {
    return project(this.require(applicationId));
  }

  saveDraft(
    applicationId: string,
    expectedVersion: string,
    responses: readonly { requirementCode: string; value: Record<string, unknown> }[],
  ): AffiliationApplicationProjection {
    const state = this.require(applicationId);
    if (expectedVersion !== String(state.version)) {
      throw new AffiliationApiError('version-conflict', 409, 'The draft was changed elsewhere.');
    }
    for (const r of responses) {
      if (!state.boundCodes.includes(r.requirementCode)) {
        throw new AffiliationApiError('not-found', 404, 'Requirement is not part of this application.');
      }
      state.responses.set(r.requirementCode, r.value);
    }
    state.version += 1;
    state.lastSavedAt = new Date(state.version * 1000).toISOString();
    return project(state);
  }

  associateEvidence(
    applicationId: string,
    requirementCode: string,
    displayName: string,
  ): AffiliationApplicationProjection {
    const state = this.require(applicationId);
    if (!state.boundCodes.includes(requirementCode)) {
      throw new AffiliationApiError('not-found', 404, 'Requirement is not part of this application.');
    }
    this.linkSeq += 1;
    const link: DraftEvidenceLinkView = {
      linkId: `link-${this.linkSeq.toString().padStart(4, '0')}`,
      requirementCode,
      evidenceObjectId: `ev-${this.linkSeq.toString().padStart(4, '0')}`,
      contentHash: `hash-${this.linkSeq}`,
      contentType: 'application/pdf',
      displayName,
      associatedAt: new Date(state.version * 1000 + 500).toISOString(),
    };
    const existing = state.evidence.get(requirementCode) ?? [];
    state.evidence.set(requirementCode, [...existing, link]);
    // Association does NOT advance the lifecycle or bump the concurrency token.
    return project(state);
  }

  removeEvidence(applicationId: string, linkId: string): AffiliationApplicationProjection {
    const state = this.require(applicationId);
    for (const [code, links] of state.evidence) {
      const next = links.filter((l) => l.linkId !== linkId);
      if (next.length !== links.length) {
        state.evidence.set(code, next);
        return project(state);
      }
    }
    throw new AffiliationApiError('not-found', 404, 'Evidence association not found.');
  }

  submit(
    applicationId: string,
    expectedVersion: string,
    idempotencyKey: string,
  ): SubmissionReceipt {
    const state = this.require(applicationId);
    const existing = this.submissionReceipts.get(applicationId);
    if (existing !== undefined) {
      if (existing.idempotencyKey === idempotencyKey) return existing;
      throw new AffiliationApiError('version-conflict', 409, 'The application is already submitted.');
    }
    if (expectedVersion !== String(state.version)) {
      throw new AffiliationApiError('version-conflict', 409, 'The draft was changed elsewhere.');
    }
    const projected = project(state);
    if (!projected.completeness.eligibleForSubmission) {
      throw new AffiliationApiError('version-conflict', 409, 'The application is not ready.');
    }
    state.lifecycleStatus = 'submitted';
    const receipt: SubmissionReceipt = {
      receiptId: `receipt-${applicationId}-1`,
      applicationId,
      sequence: 1,
      sourceDraftVersion: state.version,
      submittedAt: new Date(state.version * 1000 + 1000).toISOString(),
      submittedBy: 'representative',
      idempotencyKey,
    };
    this.submissionReceipts.set(applicationId, receipt);
    return receipt;
  }
}
