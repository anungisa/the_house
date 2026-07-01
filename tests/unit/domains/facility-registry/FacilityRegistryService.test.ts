import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { InMemoryOutboxStore } from '../../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryTelemetry } from '../../../../src/observability/index.js';
import {
  InMemoryOrganizationRegistryStore,
  OrganizationRegistryService,
} from '../../../../src/domains/organization-registry/index.js';
import {
  InMemoryFacilityRegistryStore,
  FacilityRegistryService,
  FACILITY_REGISTRY_CREATED_MESSAGE_TYPE,
  FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
  FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE,
  facilityCreatedDedupeKey,
} from '../../../../src/domains/facility-registry/index.js';
import { TelemetryCounters, TelemetryEvents } from '../../../../src/observability/TelemetryEvents.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';
import { FORBIDDEN_DOMAIN_TERMS } from '../../../../src/deployment/validateDeploymentBaseline.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

/**
 * Unit tests for {@link FacilityRegistryService}. Fully hermetic: an in-memory outbox, an in-memory
 * facility store, an in-memory Organization Registry store as the READ-ONLY reference, a
 * deterministic id generator + clock, and an in-memory telemetry sink. No DB, Azure, Entra, or
 * network.
 *
 * The facility registry is REFERENCE-DATA structure: it never calls the Governance Kernel, never
 * mutates governed state, and never mutates the Organization Registry. It models only descriptive,
 * location, and contact reference fields for a place — no booking, scheduling, maintenance,
 * inventory, inspection, accreditation, contracts, registration, payments, programs, or competition.
 */

const TENANT_ALPHA = '11111111-1111-1111-1111-111111111111';
const TENANT_BETA = '22222222-2222-2222-2222-222222222222';
const CLOCK = fixedClock(1_700_000_000_000);

function fixedIds(...ids: readonly string[]): IdGenerator {
  let i = 0;
  return { newId: () => ids[i++] ?? `gen-extra-${i}` };
}

function build(idGen: IdGenerator = fixedIds()): {
  service: FacilityRegistryService;
  outbox: InMemoryOutboxStore;
  store: InMemoryFacilityRegistryStore;
  orgStore: InMemoryOrganizationRegistryStore;
  orgService: OrganizationRegistryService;
  telemetry: InMemoryTelemetry;
} {
  const outbox = new InMemoryOutboxStore(CLOCK);
  // The org registry shares the same outbox backing array; it is used as a read-only reference.
  const orgStore = new InMemoryOrganizationRegistryStore(
    new InMemoryOutboxStore(CLOCK, undefined, outbox.records),
    { clock: CLOCK },
  );
  const orgService = new OrganizationRegistryService(orgStore, { clock: CLOCK });
  const store = new InMemoryFacilityRegistryStore(outbox, { clock: CLOCK });
  const telemetry = new InMemoryTelemetry();
  const service = new FacilityRegistryService(store, {
    telemetry,
    clock: CLOCK,
    ids: idGen,
    organizationReader: orgStore,
  });
  return { service, outbox, store, orgStore, orgService, telemetry };
}

/** Seed a generic, NSO-generic organization for a tenant and return its id. */
async function seedOrg(
  orgService: OrganizationRegistryService,
  tenantId: string,
  organizationId: string,
): Promise<string> {
  const org = await orgService.createOrganization({
    tenantId,
    organizationId,
    organizationType: 'local',
    displayName: 'Reference Organization',
    status: 'active',
  });
  return org.organizationId;
}

describe('FacilityRegistryService — creation + validation', () => {
  it('creates a facility with draft status by default', async () => {
    const { service, orgService, store } = build(fixedIds('f-1'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    const f = await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
    });
    expect(f.facilityId).toBe('f-1');
    expect(f.status).toBe('draft');
    expect(f.organizationId).toBe('org-1');
    expect((await store.getById(TENANT_ALPHA, 'f-1'))?.name).toBe('Reference Facility');
  });

  it('creates a facility with an explicit status', async () => {
    const { service, orgService } = build(fixedIds('f-2'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    const f = await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Main Venue',
      facilityType: 'training_site',
      status: 'active',
    });
    expect(f.status).toBe('active');
    expect(f.facilityType).toBe('training_site');
  });

  it('accepts a client-supplied facilityId', async () => {
    const { service, orgService } = build(fixedIds('unused'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    const f = await service.createFacility({
      tenantId: TENANT_ALPHA,
      facilityId: 'explicit-id',
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'office',
    });
    expect(f.facilityId).toBe('explicit-id');
  });

  it('rejects a blank facilityId when present', async () => {
    const { service, orgService } = build();
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        facilityId: '   ',
        organizationId: 'org-1',
        name: 'Reference Facility',
        facilityType: 'venue',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a missing name', async () => {
    const { service, orgService } = build();
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-1',
        name: '   ',
        facilityType: 'venue',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a missing organizationId', async () => {
    const { service } = build();
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: '  ',
        name: 'Reference Facility',
        facilityType: 'venue',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects an invalid facilityType (fail closed)', async () => {
    const { service, orgService } = build();
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-1',
        name: 'Reference Facility',
        facilityType: 'bogus' as never,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects an invalid status (fail closed)', async () => {
    const { service, orgService } = build();
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-1',
        name: 'Reference Facility',
        facilityType: 'venue',
        status: 'bogus' as never,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a facility whose organization does not exist', async () => {
    const { service } = build();
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'missing-org',
        name: 'Reference Facility',
        facilityType: 'venue',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FACILITY_ORGANIZATION_NOT_FOUND });
  });

  it('treats a cross-tenant organization as not found (tenant isolation)', async () => {
    const { service, orgService } = build();
    // Organization exists only for BETA.
    await seedOrg(orgService, TENANT_BETA, 'org-beta');
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-beta',
        name: 'Reference Facility',
        facilityType: 'venue',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FACILITY_ORGANIZATION_NOT_FOUND });
  });

  it('fails closed when no organizationReader is configured', async () => {
    const outbox = new InMemoryOutboxStore(CLOCK);
    const store = new InMemoryFacilityRegistryStore(outbox, { clock: CLOCK });
    const service = new FacilityRegistryService(store, { clock: CLOCK });
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-1',
        name: 'Reference Facility',
        facilityType: 'venue',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FACILITY_ORGANIZATION_NOT_FOUND });
  });

  it('normalizes countryCode to uppercase and rejects an invalid code', async () => {
    const { service, orgService } = build(fixedIds('f-cc'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    const f = await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
      countryCode: 'ca',
    });
    expect(f.countryCode).toBe('CA');
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-1',
        name: 'Reference Facility',
        facilityType: 'venue',
        countryCode: 'Canada',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('normalizes contact email and rejects an invalid one', async () => {
    const { service, orgService } = build(fixedIds('f-em'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    const f = await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
      contactEmail: '  Site.Contact@Example.COM ',
    });
    expect(f.contactEmail).toBe('site.contact@example.com');
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-1',
        name: 'Reference Facility',
        facilityType: 'venue',
        contactEmail: 'not-an-email',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('validates latitude/longitude bounds', async () => {
    const { service, orgService } = build();
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await expect(
      service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-1',
        name: 'Reference Facility',
        facilityType: 'venue',
        latitude: 200,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('de-duplicates capability tags', async () => {
    const { service, orgService } = build(fixedIds('f-tags'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    const f = await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
      capabilityTags: ['accessible', 'parking', 'accessible'],
    });
    expect(f.capabilityTags).toEqual(['accessible', 'parking']);
  });
});

describe('FacilityRegistryService — outbox + telemetry', () => {
  it('emits a sanitized created signal and telemetry on create', async () => {
    const { service, orgService, outbox, telemetry } = build(fixedIds('f-1'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Confidential Facility Name',
      facilityType: 'venue',
      addressLine1: '123 Secret Street',
      contactEmail: 'contact@example.com',
      contactPhone: '+1-555-0100',
      correlationId: 'corr-1',
    });
    const created = outbox.records.find(
      (r) => r.messageType === FACILITY_REGISTRY_CREATED_MESSAGE_TYPE,
    );
    expect(created).toBeDefined();
    expect(created!.dedupeKey).toBe(facilityCreatedDedupeKey('f-1'));
    // Sanitized: identity/routing only, never descriptive/contact/address data.
    expect(created!.payload).toMatchObject({
      facilityId: 'f-1',
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      facilityType: 'venue',
      status: 'draft',
    });
    expect(created!.payload).not.toHaveProperty('name');
    expect(created!.payload).not.toHaveProperty('addressLine1');
    expect(created!.payload).not.toHaveProperty('contactEmail');
    expect(created!.payload).not.toHaveProperty('contactPhone');
    expect(telemetry.counterTotal(TelemetryCounters.facilityRegistryCreated)).toBe(1);
    expect(telemetry.counterTotal(TelemetryCounters.facilityRegistryWrite)).toBe(1);
    expect(telemetry.hasEvent(TelemetryEvents.facilityRegistryCreated)).toBe(true);
  });

  it('is idempotent on a repeated create (no duplicate row or signal)', async () => {
    const { service, orgService, outbox, store } = build(fixedIds('f-1', 'f-1'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    const input = {
      tenantId: TENANT_ALPHA,
      facilityId: 'f-1',
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue' as const,
    };
    await service.createFacility(input);
    await service.createFacility(input);
    expect(store.listAll().filter((f) => f.facilityId === 'f-1')).toHaveLength(1);
    expect(
      outbox.records.filter((r) => r.messageType === FACILITY_REGISTRY_CREATED_MESSAGE_TYPE),
    ).toHaveLength(1);
  });
});

describe('FacilityRegistryService — update', () => {
  it('updates mutable descriptive fields without touching status/type/org', async () => {
    const { service, orgService, outbox } = build(fixedIds('f-1'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
      status: 'active',
    });
    const updated = await service.updateFacility({
      tenantId: TENANT_ALPHA,
      facilityId: 'f-1',
      name: 'Renamed Facility',
      locality: 'Ottawa',
    });
    expect(updated.name).toBe('Renamed Facility');
    expect(updated.locality).toBe('Ottawa');
    expect(updated.status).toBe('active');
    expect(updated.facilityType).toBe('venue');
    expect(updated.organizationId).toBe('org-1');
    expect(
      outbox.records.some((r) => r.messageType === FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE),
    ).toBe(true);
  });

  it('clears an optional field when passed null', async () => {
    const { service, orgService } = build(fixedIds('f-1'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
      locality: 'Ottawa',
    });
    const updated = await service.updateFacility({
      tenantId: TENANT_ALPHA,
      facilityId: 'f-1',
      locality: null,
    });
    expect(updated.locality).toBeUndefined();
  });

  it('throws not found when updating an unknown facility', async () => {
    const { service } = build();
    await expect(
      service.updateFacility({ tenantId: TENANT_ALPHA, facilityId: 'nope', name: 'X' }),
    ).rejects.toMatchObject({ code: ErrorCode.FACILITY_NOT_FOUND });
  });
});

describe('FacilityRegistryService — status change', () => {
  it('changes status and emits a status_changed signal + event', async () => {
    const { service, orgService, outbox, telemetry } = build(fixedIds('f-1'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
      status: 'active',
    });
    const changed = await service.changeFacilityStatus({
      tenantId: TENANT_ALPHA,
      facilityId: 'f-1',
      status: 'inactive',
    });
    expect(changed.status).toBe('inactive');
    const signal = outbox.records.find(
      (r) => r.messageType === FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
    );
    expect(signal!.payload).toMatchObject({
      facilityId: 'f-1',
      previousStatus: 'active',
      newStatus: 'inactive',
    });
    expect(telemetry.hasEvent(TelemetryEvents.facilityRegistryStatusChanged)).toBe(true);
  });

  it('is a no-op when the status is already at the target', async () => {
    const { service, orgService, outbox } = build(fixedIds('f-1'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
      status: 'active',
    });
    await service.changeFacilityStatus({
      tenantId: TENANT_ALPHA,
      facilityId: 'f-1',
      status: 'active',
    });
    expect(
      outbox.records.filter((r) => r.messageType === FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE),
    ).toHaveLength(0);
  });

  it('throws not found when changing status of an unknown facility', async () => {
    const { service } = build();
    await expect(
      service.changeFacilityStatus({ tenantId: TENANT_ALPHA, facilityId: 'nope', status: 'active' }),
    ).rejects.toMatchObject({ code: ErrorCode.FACILITY_NOT_FOUND });
  });
});

describe('FacilityRegistryService — reads + isolation', () => {
  it('returns undefined for an unknown facility and isolates by tenant', async () => {
    const { service, orgService } = build(fixedIds('f-1'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'Reference Facility',
      facilityType: 'venue',
    });
    expect(await service.getFacility(TENANT_ALPHA, 'f-1')).toBeDefined();
    expect(await service.getFacility(TENANT_BETA, 'f-1')).toBeUndefined();
    expect(await service.getFacility(TENANT_ALPHA, 'missing')).toBeUndefined();
  });

  it('lists facilities filtered by type, status, and organization', async () => {
    const { service, orgService } = build(fixedIds('f-1', 'f-2', 'f-3'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    await seedOrg(orgService, TENANT_ALPHA, 'org-2');
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'A',
      facilityType: 'venue',
      status: 'active',
    });
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-1',
      name: 'B',
      facilityType: 'office',
      status: 'inactive',
    });
    await service.createFacility({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-2',
      name: 'C',
      facilityType: 'venue',
      status: 'active',
    });
    const active = await service.listFacilities(TENANT_ALPHA, { status: 'active' });
    expect(active.items.map((f) => f.facilityId).sort()).toEqual(['f-1', 'f-3']);
    const forOrg1 = await service.listFacilitiesForOrganization(TENANT_ALPHA, 'org-1');
    expect(forOrg1.items.map((f) => f.facilityId).sort()).toEqual(['f-1', 'f-2']);
  });

  it('paginates with a stable keyset cursor', async () => {
    const { service, orgService } = build(fixedIds('f-1', 'f-2', 'f-3'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-1');
    for (const name of ['A', 'B', 'C']) {
      await service.createFacility({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-1',
        name,
        facilityType: 'venue',
      });
    }
    const page1 = await service.listFacilities(TENANT_ALPHA, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();
    const page2 = await service.listFacilities(TENANT_ALPHA, { limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
  });
});

describe('FacilityRegistryService — NSO-generic + governance boundaries', () => {
  it('domain source contains no sport-specific terminology', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const domainDir = join(here, '..', '..', '..', '..', 'src', 'domains', 'facility-registry');
    for (const file of readdirSync(domainDir)) {
      const text = readFileSync(join(domainDir, file), 'utf8').toLowerCase();
      for (const term of FORBIDDEN_DOMAIN_TERMS) {
        expect(text.includes(term), `${file} must not contain "${term}"`).toBe(false);
      }
    }
  });

  it('domain source never references the Governance Kernel', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const domainDir = join(here, '..', '..', '..', '..', 'src', 'domains', 'facility-registry');
    for (const file of readdirSync(domainDir)) {
      const text = readFileSync(join(domainDir, file), 'utf8');
      expect(text.includes('GovernanceKernel'), `${file} must not reference GovernanceKernel`).toBe(
        false,
      );
      expect(text.includes('entity_state'), `${file} must not touch entity_state`).toBe(false);
    }
  });
});
