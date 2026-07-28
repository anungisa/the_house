import { describe, it, expect } from 'vitest';

import {
  AffiliationDraftService,
  InMemoryAffiliationDraftStore,
  InMemoryAffiliationLifecycleReader,
  InMemoryEvidenceReferenceValidator,
  type RequirementCatalogStore,
  type RequirementDefinition,
  type RequirementResolutionContext,
} from '../../../../src/domains/affiliation-requirements/index.js';
import { AppError } from '../../../../src/shared/errors/AppError.js';

/**
 * Domain-level unit tests for {@link AffiliationDraftService}.
 *
 * Hermetic (in-memory ports only). Proves versioned requirement BINDING immutability (a later
 * catalog revision never rewrites an existing application), idempotent initiation, tenant-scoped
 * not-found semantics, optimistic-concurrency conflicts, and that evidence association never
 * advances governed lifecycle state (association ≠ acceptance).
 */

const TENANT = '11111111-1111-1111-1111-111111111111';
const ORG = 'org-1';
const SEASON = '2025-26';
const ACTOR = 'user-1';

function def(over: Partial<RequirementDefinition> & { id: string; code: string; version: number }): RequirementDefinition {
  return {
    responseType: 'acknowledgement',
    evidenceRequired: false,
    titleEn: 'Title EN',
    guidanceEn: 'Guidance EN',
    titleFr: 'Titre FR',
    guidanceFr: 'Directive FR',
    applicability: { orgTypes: ['local'], pathways: ['new_affiliation'] },
    institutionalSource: 'National Affiliation Policy',
    active: true,
    ...over,
  };
}

/** A mutable catalog so tests can introduce a later version AFTER an application is bound. */
class MutableCatalogStore implements RequirementCatalogStore {
  constructor(public definitions: RequirementDefinition[]) {}
  add(d: RequirementDefinition): void {
    this.definitions = [...this.definitions, d];
  }
  async listAll(): Promise<readonly RequirementDefinition[]> {
    return this.definitions;
  }
}

const CONTEXT: RequirementResolutionContext = {
  orgType: 'local',
  jurisdiction: 'member',
  pathway: 'new_affiliation',
  season: SEASON,
};

function build(catalog: MutableCatalogStore): AffiliationDraftService {
  return new AffiliationDraftService({
    store: new InMemoryAffiliationDraftStore(),
    catalog,
    lifecycle: new InMemoryAffiliationLifecycleReader(),
    evidenceValidator: new InMemoryEvidenceReferenceValidator(),
  });
}

describe('AffiliationDraftService', () => {
  it('binds the applicable requirement versions at initiation', async () => {
    const catalog = new MutableCatalogStore([def({ id: 'A@1', code: 'A', version: 1 })]);
    const service = build(catalog);
    const projection = await service.initiate({
      tenantId: TENANT,
      organizationId: ORG,
      seasonId: SEASON,
      actor: ACTOR,
      context: CONTEXT,
    });
    expect(projection.requirements.map((r) => r.code)).toEqual(['A']);
    expect(projection.requirements[0]?.version).toBe(1);
  });

  it('does not silently alter an existing application when a later catalog version is published', async () => {
    const catalog = new MutableCatalogStore([
      def({ id: 'A@1', code: 'A', version: 1, titleEn: 'Version one title' }),
    ]);
    const service = build(catalog);
    const initiated = await service.initiate({
      tenantId: TENANT,
      organizationId: ORG,
      seasonId: SEASON,
      actor: ACTOR,
      context: CONTEXT,
    });

    // Publish a NEWER version of the same requirement.
    catalog.add(def({ id: 'A@2', code: 'A', version: 2, titleEn: 'Version two title' }));

    const reprojected = await service.getProjection(TENANT, initiated.applicationId);
    expect(reprojected.requirements[0]?.version).toBe(1);
    expect(reprojected.requirements[0]?.titleEn).toBe('Version one title');
  });

  it('is idempotent — re-initiating the same subject resolves the same application', async () => {
    const catalog = new MutableCatalogStore([def({ id: 'A@1', code: 'A', version: 1 })]);
    const service = build(catalog);
    const first = await service.initiate({
      tenantId: TENANT,
      organizationId: ORG,
      seasonId: SEASON,
      actor: ACTOR,
      context: CONTEXT,
    });
    const second = await service.initiate({
      tenantId: TENANT,
      organizationId: ORG,
      seasonId: SEASON,
      actor: ACTOR,
      context: CONTEXT,
    });
    expect(second.applicationId).toBe(first.applicationId);
  });

  it('throws AFFILIATION_APPLICATION_NOT_FOUND for a cross-tenant projection read', async () => {
    const catalog = new MutableCatalogStore([def({ id: 'A@1', code: 'A', version: 1 })]);
    const service = build(catalog);
    const initiated = await service.initiate({
      tenantId: TENANT,
      organizationId: ORG,
      seasonId: SEASON,
      actor: ACTOR,
      context: CONTEXT,
    });
    await expect(
      service.getProjection('99999999-9999-9999-9999-999999999999', initiated.applicationId),
    ).rejects.toMatchObject({ code: 'AFFILIATION_APPLICATION_NOT_FOUND' });
  });

  it('rejects a stale save with AFFILIATION_DRAFT_VERSION_CONFLICT', async () => {
    const catalog = new MutableCatalogStore([def({ id: 'A@1', code: 'A', version: 1 })]);
    const service = build(catalog);
    const initiated = await service.initiate({
      tenantId: TENANT,
      organizationId: ORG,
      seasonId: SEASON,
      actor: ACTOR,
      context: CONTEXT,
    });
    await service.saveDraft({
      tenantId: TENANT,
      applicationId: initiated.applicationId,
      expectedVersion: 1,
      actor: ACTOR,
      responses: [{ requirementCode: 'A', value: { acknowledged: true } }],
    });
    await expect(
      service.saveDraft({
        tenantId: TENANT,
        applicationId: initiated.applicationId,
        expectedVersion: 1,
        actor: ACTOR,
        responses: [{ requirementCode: 'A', value: { acknowledged: false } }],
      }),
    ).rejects.toMatchObject({ code: 'AFFILIATION_DRAFT_VERSION_CONFLICT' });
  });

  it('evidence association never advances governed lifecycle state', async () => {
    const catalog = new MutableCatalogStore([
      def({ id: 'A@1', code: 'A', version: 1, evidenceRequired: true }),
    ]);
    const evidence = new InMemoryEvidenceReferenceValidator();
    evidence.register({ tenantId: TENANT, evidenceObjectId: 'ev-1', contentHash: 'h1' });
    const service = new AffiliationDraftService({
      store: new InMemoryAffiliationDraftStore(),
      catalog,
      lifecycle: new InMemoryAffiliationLifecycleReader(),
      evidenceValidator: evidence,
    });
    const initiated = await service.initiate({
      tenantId: TENANT,
      organizationId: ORG,
      seasonId: SEASON,
      actor: ACTOR,
      context: CONTEXT,
    });
    const { projection, link } = await service.associateEvidence({
      tenantId: TENANT,
      applicationId: initiated.applicationId,
      requirementCode: 'A',
      evidenceObjectId: 'ev-1',
      contentHash: 'h1',
      contentType: 'application/pdf',
      actor: ACTOR,
    });
    expect(link.evidenceObjectId).toBe('ev-1');
    expect(projection.lifecycleStatus).toBe('draft');
  });

  it('rejects an evidence reference that cannot be validated for the tenant', async () => {
    const catalog = new MutableCatalogStore([
      def({ id: 'A@1', code: 'A', version: 1, evidenceRequired: true }),
    ]);
    const service = build(catalog); // validator has NO registered refs
    const initiated = await service.initiate({
      tenantId: TENANT,
      organizationId: ORG,
      seasonId: SEASON,
      actor: ACTOR,
      context: CONTEXT,
    });
    await expect(
      service.associateEvidence({
        tenantId: TENANT,
        applicationId: initiated.applicationId,
        requirementCode: 'A',
        evidenceObjectId: 'ev-missing',
        contentHash: 'nope',
        contentType: 'application/pdf',
        actor: ACTOR,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
