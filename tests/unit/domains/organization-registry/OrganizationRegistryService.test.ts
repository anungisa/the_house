import { describe, expect, it } from 'vitest';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import {
  InMemoryOrganizationRegistryStore,
  OrganizationRegistryService,
  ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE,
  ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
  ORGANIZATION_REGISTRY_UPDATED_MESSAGE_TYPE,
} from '../../../../src/domains/organization-registry/index.js';
import {
  TelemetryCounters,
  TelemetryEvents,
} from '../../../../src/observability/TelemetryEvents.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

/**
 * Unit tests for {@link OrganizationRegistryService}. Fully hermetic: an in-memory outbox, an
 * in-memory registry store, a deterministic id generator + clock, and an in-memory telemetry
 * sink. No DB, Azure, Entra, or network.
 *
 * The registry is REFERENCE-DATA structure: it never calls the Governance Kernel, never mutates
 * governed state, and never substitutes for a kernel-approved transition. The affiliation
 * registration seam is a one-way projection of an already-approved application.
 */

const TENANT_ALPHA = '11111111-1111-1111-1111-111111111111';
const TENANT_BETA = '22222222-2222-2222-2222-222222222222';
const CLOCK = fixedClock(1_700_000_000_000);

function fixedIds(...ids: readonly string[]): IdGenerator {
  let i = 0;
  return { newId: () => ids[i++] ?? `org-extra-${i}` };
}

function build(idGen: IdGenerator = fixedIds()): {
  service: OrganizationRegistryService;
  outbox: InMemoryOutboxStore;
  store: InMemoryOrganizationRegistryStore;
  telemetry: InMemoryTelemetry;
} {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryOrganizationRegistryStore(outbox, { clock: CLOCK });
  const telemetry = new InMemoryTelemetry();
  const service = new OrganizationRegistryService(store, { telemetry, clock: CLOCK, ids: idGen });
  return { service, outbox, store, telemetry };
}

const ALLOWED_CREATED_KEYS = new Set([
  'organizationId',
  'tenantId',
  'organizationType',
  'status',
  'source',
  'parentOrganizationId',
  'sourceEntityType',
  'sourceEntityId',
  'actorUserId',
  'requestId',
  'correlationId',
]);

describe('OrganizationRegistryService — creation', () => {
  it('creates a national organization (draft by default)', async () => {
    const { service, store } = build(fixedIds('org-national'));
    const org = await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'National Organization',
    });
    expect(org.organizationId).toBe('org-national');
    expect(org.organizationType).toBe('national');
    expect(org.status).toBe('draft');
    expect(org.source).toBe('manual');
    expect(org.tenantId).toBe(TENANT_ALPHA);
    expect((await store.getById(TENANT_ALPHA, 'org-national'))?.displayName).toBe(
      'National Organization',
    );
  });

  it('creates a regional organization parented to a national organization', async () => {
    const { service } = build(fixedIds('org-national', 'org-regional'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'National Organization',
      status: 'active',
    });
    const regional = await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'regional',
      displayName: 'Regional Organization',
      parentOrganizationId: 'org-national',
    });
    expect(regional.parentOrganizationId).toBe('org-national');
    expect(regional.organizationType).toBe('regional');
  });

  it('creates a local organization parented to a regional organization', async () => {
    const { service } = build(fixedIds('org-national', 'org-regional', 'org-local'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'National Organization',
    });
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'regional',
      displayName: 'Regional Organization',
      parentOrganizationId: 'org-national',
    });
    const local = await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'local',
      displayName: 'Local Organization',
      parentOrganizationId: 'org-regional',
    });
    expect(local.parentOrganizationId).toBe('org-regional');
    expect(local.organizationType).toBe('local');
  });

  it('rejects a parent that belongs to a different tenant (cross-tenant isolation)', async () => {
    const { service } = build(fixedIds('beta-parent', 'alpha-child'));
    await service.createOrganization({
      tenantId: TENANT_BETA,
      organizationType: 'national',
      displayName: 'Beta National Organization',
    });
    await expect(
      service.createOrganization({
        tenantId: TENANT_ALPHA,
        organizationType: 'regional',
        displayName: 'Alpha Regional Organization',
        parentOrganizationId: 'beta-parent',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_PARENT_NOT_FOUND });
  });

  it('rejects a self-referential parent (cycle)', async () => {
    const { service } = build(fixedIds('org-self'));
    await expect(
      service.createOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-self',
        organizationType: 'regional',
        displayName: 'Self Parented',
        parentOrganizationId: 'org-self',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_PARENT_CYCLE });
  });

  it('rejects a missing displayName', async () => {
    const { service } = build();
    await expect(
      service.createOrganization({
        tenantId: TENANT_ALPHA,
        organizationType: 'national',
        displayName: '   ',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects an unknown organizationType (fails closed)', async () => {
    const { service } = build();
    await expect(
      service.createOrganization({
        tenantId: TENANT_ALPHA,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        organizationType: 'club' as any,
        displayName: 'Bad Type',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects an unknown status (fails closed)', async () => {
    const { service } = build();
    await expect(
      service.createOrganization({
        tenantId: TENANT_ALPHA,
        organizationType: 'national',
        displayName: 'Bad Status',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status: 'frozen' as any,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('is idempotent on (tenant, organizationId): a replayed create does not duplicate', async () => {
    const { service, outbox, store } = build();
    const first = await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-fixed',
      organizationType: 'national',
      displayName: 'National Organization',
    });
    const second = await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-fixed',
      organizationType: 'national',
      displayName: 'National Organization',
    });
    expect(second.organizationId).toBe(first.organizationId);
    expect(store.listAll()).toHaveLength(1);
    expect(
      outbox.records.filter((r) => r.messageType === ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE),
    ).toHaveLength(1);
  });
});

describe('OrganizationRegistryService — hierarchy cycles', () => {
  it('rejects an update that would introduce a multi-node cycle', async () => {
    const { service } = build(fixedIds('org-a', 'org-b'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'Organization A',
    });
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'regional',
      displayName: 'Organization B',
      parentOrganizationId: 'org-a',
    });
    // org-b's parent is org-a; setting org-a's parent to org-b closes a cycle.
    await expect(
      service.updateOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-a',
        parentOrganizationId: 'org-b',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_PARENT_CYCLE });
  });
});

describe('OrganizationRegistryService — tenant-scoped reads', () => {
  it('lists only the calling tenant organizations', async () => {
    const { service } = build(fixedIds('alpha-1', 'alpha-2', 'beta-1'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'Alpha One',
    });
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'regional',
      displayName: 'Alpha Two',
    });
    await service.createOrganization({
      tenantId: TENANT_BETA,
      organizationType: 'national',
      displayName: 'Beta One',
    });
    const alpha = await service.listOrganizations(TENANT_ALPHA);
    expect(alpha.items.map((o) => o.organizationId).sort()).toEqual(['alpha-1', 'alpha-2']);
    const beta = await service.listOrganizations(TENANT_BETA);
    expect(beta.items.map((o) => o.organizationId)).toEqual(['beta-1']);
  });

  it('returns detail only for the calling tenant', async () => {
    const { service } = build(fixedIds('alpha-detail'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'Alpha Detail',
    });
    expect((await service.getOrganization(TENANT_ALPHA, 'alpha-detail'))?.displayName).toBe(
      'Alpha Detail',
    );
    // Tenant Beta cannot read Tenant Alpha's organization.
    expect(await service.getOrganization(TENANT_BETA, 'alpha-detail')).toBeUndefined();
  });
});

describe('OrganizationRegistryService — status changes never delete', () => {
  it('suspends then archives an organization while retaining the row', async () => {
    const { service, store } = build(fixedIds('org-x'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'Organization X',
      status: 'active',
    });
    const suspended = await service.changeOrganizationStatus({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-x',
      status: 'suspended',
    });
    expect(suspended.status).toBe('suspended');
    const archived = await service.changeOrganizationStatus({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-x',
      status: 'archived',
    });
    expect(archived.status).toBe('archived');
    // Row still present after suspend + archive — never deleted.
    expect(store.listAll()).toHaveLength(1);
    expect((await store.getById(TENANT_ALPHA, 'org-x'))?.status).toBe('archived');
  });

  it('is an idempotent no-op when the status is unchanged', async () => {
    const { service, outbox } = build(fixedIds('org-y'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'Organization Y',
      status: 'active',
    });
    await service.changeOrganizationStatus({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-y',
      status: 'active',
    });
    expect(
      outbox.records.filter(
        (r) => r.messageType === ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
      ),
    ).toHaveLength(0);
  });
});

describe('OrganizationRegistryService — affiliation projection seam', () => {
  it('rejects an active affiliation-sourced organization without a source reference', async () => {
    const { service } = build(fixedIds('org-noref'));
    await expect(
      service.createOrganization({
        tenantId: TENANT_ALPHA,
        organizationType: 'local',
        displayName: 'Sourced Organization',
        status: 'active',
        source: 'affiliation_application',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_SOURCE_REFERENCE_REQUIRED });
  });

  it('registers an active organization from an approved affiliation application', async () => {
    const { service, outbox } = build(fixedIds('org-from-app'));
    const org = await service.registerOrganizationFromApprovedAffiliationApplication({
      tenantId: TENANT_ALPHA,
      affiliationApplicationId: 'app-123',
      organizationType: 'local',
      displayName: 'Registered Local Organization',
    });
    expect(org.status).toBe('active');
    expect(org.source).toBe('affiliation_application');
    expect(org.sourceEntityType).toBe('AffiliationApplication');
    expect(org.sourceEntityId).toBe('app-123');

    const created = outbox.records.find(
      (r) => r.messageType === ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE,
    );
    expect(created?.payload).toMatchObject({
      source: 'affiliation_application',
      sourceEntityType: 'AffiliationApplication',
      sourceEntityId: 'app-123',
      status: 'active',
    });
  });

  it('rejects registration without an affiliation application id', async () => {
    const { service } = build();
    await expect(
      service.registerOrganizationFromApprovedAffiliationApplication({
        tenantId: TENANT_ALPHA,
        affiliationApplicationId: '   ',
        organizationType: 'local',
        displayName: 'No App',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_SOURCE_REFERENCE_REQUIRED });
  });
});

describe('OrganizationRegistryService — outbox signals', () => {
  it('emits a sanitized created signal with a stable dedupe key and no PII/secret fields', async () => {
    const { service, outbox } = build(fixedIds('org-sig'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'Organization Sig',
      legalName: 'Organization Sig Legal Entity',
      actorUserId: 'user-1',
      requestId: 'req-1',
      correlationId: 'corr-1',
    });
    const created = outbox.records.find(
      (r) => r.messageType === ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE,
    );
    expect(created).toBeDefined();
    expect(created!.dedupeKey).toBe(`${ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE}:org-sig`);
    // Payload carries only the sanitized allow-listed keys (no legalName/displayName/bytes).
    for (const key of Object.keys(created!.payload)) {
      expect(ALLOWED_CREATED_KEYS.has(key)).toBe(true);
    }
    expect(created!.payload).not.toHaveProperty('legalName');
    expect(created!.payload).not.toHaveProperty('displayName');
  });

  it('emits an updated signal on attribute change and a status_changed signal on status change', async () => {
    const { service, outbox } = build(fixedIds('org-upd'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'Organization Upd',
      status: 'active',
    });
    await service.updateOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-upd',
      displayName: 'Organization Upd Renamed',
    });
    await service.changeOrganizationStatus({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-upd',
      status: 'suspended',
    });
    expect(
      outbox.records.some((r) => r.messageType === ORGANIZATION_REGISTRY_UPDATED_MESSAGE_TYPE),
    ).toBe(true);
    expect(
      outbox.records.some(
        (r) => r.messageType === ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
      ),
    ).toBe(true);
  });
});

describe('OrganizationRegistryService — telemetry', () => {
  it('emits created, read, and updated telemetry without leaking secrets', async () => {
    const { service, telemetry } = build(fixedIds('org-tel'));
    await service.createOrganization({
      tenantId: TENANT_ALPHA,
      organizationType: 'national',
      displayName: 'Organization Tel',
      status: 'active',
    });
    await service.getOrganization(TENANT_ALPHA, 'org-tel');
    await service.listOrganizations(TENANT_ALPHA);
    await service.changeOrganizationStatus({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-tel',
      status: 'suspended',
    });

    expect(telemetry.counterTotal(TelemetryCounters.organizationRegistryCreated)).toBe(1);
    expect(telemetry.counterTotal(TelemetryCounters.organizationRegistryRead)).toBe(2);
    expect(telemetry.counterTotal(TelemetryCounters.organizationRegistryUpdated)).toBe(1);
    expect(telemetry.hasEvent(TelemetryEvents.organizationRegistryCreated)).toBe(true);
    expect(telemetry.hasEvent(TelemetryEvents.organizationRegistryStatusChanged)).toBe(true);

    // No retained telemetry attribute value should look like a secret or raw payload.
    const serialized = JSON.stringify(telemetry.snapshot());
    expect(serialized).not.toMatch(/password|secret|authorization|bearer/i);
  });
});
