/**
 * Affiliation DRAFT service (Slice C) — the representative-facing application orchestration for the
 * pre-submission working set. It initiates/resumes an application, projects versioned requirements
 * with server-derived completeness, saves responses under optimistic concurrency, and associates or
 * removes governed-evidence references.
 *
 * STRICT SCOPE — this service does NOT:
 *  - mutate governed lifecycle state (governance.entity_state) or invoke the Governance Kernel;
 *  - execute a submission/transition (submission is a governed action delivered in Slice D);
 *  - accept evidence (association ≠ acceptance);
 *  - trust the browser for applicability, completeness, or authority — all are server-derived.
 *
 * Authorization (which organizations a representative may act for) is enforced at the Button HTTP
 * boundary; this service is tenant-scoped and assumes a trusted (tenantId, actor).
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type {
  AffiliationApplicationProjection,
  AffiliationOverview,
  DraftEvidenceLinkView,
  RequirementView,
} from './AffiliationDraftTypes.js';
import type { AffiliationDraftStore, DraftSnapshot } from './AffiliationDraftStore.js';
import type { AffiliationLifecycleReader } from './AffiliationLifecycleReader.js';
import type { EvidenceReferenceValidator } from './EvidenceReferenceValidator.js';
import type { RequirementCatalogStore } from './RequirementCatalogStore.js';
import { computeCompleteness } from './Completeness.js';
import {
  findRequirementVersion,
  resolveApplicableRequirements,
  type ApplicableRequirement,
  type RequirementResolutionContext,
} from './RequirementCatalog.js';

export interface AffiliationDraftServiceDeps {
  readonly store: AffiliationDraftStore;
  readonly catalog: RequirementCatalogStore;
  readonly lifecycle: AffiliationLifecycleReader;
  readonly evidenceValidator: EvidenceReferenceValidator;
}

export interface InitiateInput {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly seasonId: string;
  readonly actor: string;
  readonly context: RequirementResolutionContext;
}

export interface OverviewInput {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway: string;
}

export interface SaveDraftServiceInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly expectedVersion: number;
  readonly actor: string;
  readonly responses: readonly { readonly requirementCode: string; readonly value: Record<string, unknown> }[];
}

export interface AssociateEvidenceInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly requirementCode: string;
  readonly evidenceObjectId: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly displayName?: string;
  readonly actor: string;
}

export interface RemoveEvidenceInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly linkId: string;
  readonly actor: string;
}

export class AffiliationDraftService {
  constructor(private readonly deps: AffiliationDraftServiceDeps) {}

  /** Initiate a new application OR return the existing one for the subject (idempotent). */
  async initiate(input: InitiateInput): Promise<AffiliationApplicationProjection> {
    const catalog = await this.deps.catalog.listAll();
    const active = catalog.filter((d) => d.active);
    const applicable = resolveApplicableRequirements(active, input.context);
    const bindings = applicable.map((a) => ({
      requirementCode: a.definition.code,
      requirementVersion: a.definition.version,
      appliesBecause: a.appliesBecause,
    }));

    const { head } = await this.deps.store.initiateApplication({
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      seasonId: input.seasonId,
      pathway: input.context.pathway,
      actor: input.actor,
      bindings,
    });

    return this.getProjection(input.tenantId, head.applicationId);
  }

  /** Overview for an org+season: whether a draft exists (resume) or can be initiated (begin). */
  async getOverview(input: OverviewInput): Promise<AffiliationOverview> {
    const head = await this.deps.store.findApplicationBySubject(
      input.tenantId,
      input.organizationId,
      input.seasonId,
      input.pathway,
    );
    if (head === undefined) {
      return {
        organizationId: input.organizationId,
        seasonId: input.seasonId,
        pathway: input.pathway,
        application: null,
        canInitiate: true,
      };
    }
    const projection = await this.getProjection(input.tenantId, head.applicationId);
    return {
      organizationId: input.organizationId,
      seasonId: input.seasonId,
      pathway: input.pathway,
      application: {
        applicationId: projection.applicationId,
        lifecycleStatus: projection.lifecycleStatus,
        lastSavedAt: projection.lastSavedAt,
        completeness: projection.completeness,
      },
      canInitiate: false,
    };
  }

  /** Full representative-safe projection. Throws AFFILIATION_APPLICATION_NOT_FOUND when absent. */
  async getProjection(
    tenantId: string,
    applicationId: string,
  ): Promise<AffiliationApplicationProjection> {
    const snapshot = await this.deps.store.getSnapshot(tenantId, applicationId);
    if (snapshot === undefined) {
      throw new AppError(
        ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
        'Affiliation application not found.',
      );
    }
    return this.buildProjection(tenantId, snapshot);
  }

  private async buildProjection(
    tenantId: string,
    snapshot: DraftSnapshot,
  ): Promise<AffiliationApplicationProjection> {
    const catalog = await this.deps.catalog.listAll();

    // Resolve each BOUND version (immutable) — never the latest — so catalog evolution cannot
    // silently rewrite an existing application.
    const applicable: ApplicableRequirement[] = [];
    for (const binding of snapshot.bindings) {
      const definition = findRequirementVersion(
        catalog,
        binding.requirementCode,
        binding.requirementVersion,
      );
      if (definition === undefined) continue; // unknown bound version => omit, never fabricate
      applicable.push({ definition, appliesBecause: binding.appliesBecause });
    }

    const responses = new Map<string, Record<string, unknown>>();
    for (const r of snapshot.responses) responses.set(r.requirementCode, r.value);

    const evidenceByCode = new Map<string, DraftEvidenceLinkView[]>();
    for (const e of snapshot.evidence) {
      const view: DraftEvidenceLinkView = {
        linkId: e.linkId,
        requirementCode: e.requirementCode,
        evidenceObjectId: e.evidenceObjectId,
        contentHash: e.contentHash,
        contentType: e.contentType,
        ...(e.displayName !== undefined ? { displayName: e.displayName } : {}),
        associatedAt: e.associatedAt,
      };
      const list = evidenceByCode.get(e.requirementCode) ?? [];
      list.push(view);
      evidenceByCode.set(e.requirementCode, list);
    }

    const { requirements, completeness } = computeCompleteness({
      applicable,
      responses,
      evidence: evidenceByCode,
    });

    const lifecycleStatus = await this.deps.lifecycle.currentStatus(
      tenantId,
      snapshot.head.applicationId,
    );

    return {
      applicationId: snapshot.head.applicationId,
      organizationId: snapshot.head.organizationId,
      seasonId: snapshot.head.seasonId,
      pathway: snapshot.head.pathway,
      lifecycleStatus,
      concurrencyToken: String(snapshot.draft.version),
      lastSavedAt: snapshot.draft.lastSavedAt,
      requirements: requirements as readonly RequirementView[],
      completeness,
    };
  }

  /** Save responses under an optimistic-concurrency check; returns the refreshed projection. */
  async saveDraft(input: SaveDraftServiceInput): Promise<AffiliationApplicationProjection> {
    const result = await this.deps.store.saveDraft({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      expectedVersion: input.expectedVersion,
      actor: input.actor,
      responses: input.responses.map((r) => ({ requirementCode: r.requirementCode, value: r.value })),
    });
    if (!result.ok) {
      if (result.reason === 'not_found') {
        throw new AppError(
          ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
          'Affiliation application not found.',
        );
      }
      if (
        result.reason === 'not_editable' ||
        result.reason === 'outside_correction_scope'
      ) {
        throw new AppError(
          ErrorCode.AFFILIATION_CORRECTION_CONFLICT,
          result.reason === 'not_editable'
            ? 'The submitted application is read-only.'
            : 'That requirement is outside the authorized correction scope.',
        );
      }
      throw new AppError(
        ErrorCode.AFFILIATION_DRAFT_VERSION_CONFLICT,
        'The draft was modified since it was loaded. Reload and reapply your changes.',
        {
          details: {
            currentVersion: 'currentVersion' in result ? result.currentVersion : input.expectedVersion,
          },
        },
      );
    }
    return this.getProjection(input.tenantId, input.applicationId);
  }

  /** Associate an existing governed-evidence reference with a bound requirement. */
  async associateEvidence(
    input: AssociateEvidenceInput,
  ): Promise<{ projection: AffiliationApplicationProjection; link: DraftEvidenceLinkView }> {
    const valid = await this.deps.evidenceValidator.isValid({
      tenantId: input.tenantId,
      evidenceObjectId: input.evidenceObjectId,
      contentHash: input.contentHash,
    });
    if (!valid) {
      throw new AppError(
        ErrorCode.AFFILIATION_EVIDENCE_REFERENCE_INVALID,
        'The referenced evidence could not be validated for this tenant.',
      );
    }

    const result = await this.deps.store.addEvidenceLink({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      requirementCode: input.requirementCode,
      evidenceObjectId: input.evidenceObjectId,
      contentHash: input.contentHash,
      contentType: input.contentType,
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      actor: input.actor,
    });
    if (!result.ok) {
      if (result.reason === 'not_found') {
        throw new AppError(
          ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
          'Affiliation application not found.',
        );
      }
      if (
        result.reason === 'not_editable' ||
        result.reason === 'outside_correction_scope'
      ) {
        throw new AppError(
          ErrorCode.AFFILIATION_CORRECTION_CONFLICT,
          result.reason === 'not_editable'
            ? 'The submitted application is read-only.'
            : 'That requirement is outside the authorized correction scope.',
        );
      }
      throw new AppError(
        ErrorCode.AFFILIATION_REQUIREMENT_UNKNOWN,
        'The requirement is not applicable to this application.',
      );
    }

    const projection = await this.getProjection(input.tenantId, input.applicationId);
    const link: DraftEvidenceLinkView = {
      linkId: result.link.linkId,
      requirementCode: result.link.requirementCode,
      evidenceObjectId: result.link.evidenceObjectId,
      contentHash: result.link.contentHash,
      contentType: result.link.contentType,
      ...(result.link.displayName !== undefined ? { displayName: result.link.displayName } : {}),
      associatedAt: result.link.associatedAt,
    };
    return { projection, link };
  }

  /** Remove a draft evidence association (deletes ONLY the link, never a governed object). */
  async removeEvidence(input: RemoveEvidenceInput): Promise<AffiliationApplicationProjection> {
    const result = await this.deps.store.removeEvidenceLink({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      linkId: input.linkId,
      actor: input.actor,
    });
    if (!result.ok) {
      if (
        result.reason === 'not_editable' ||
        result.reason === 'outside_correction_scope'
      ) {
        throw new AppError(
          ErrorCode.AFFILIATION_CORRECTION_CONFLICT,
          result.reason === 'not_editable'
            ? 'The submitted application is read-only.'
            : 'That requirement is outside the authorized correction scope.',
        );
      }
      throw new AppError(
        ErrorCode.AFFILIATION_APPLICATION_NOT_FOUND,
        'Affiliation application or evidence association not found.',
      );
    }
    return this.getProjection(input.tenantId, input.applicationId);
  }
}
