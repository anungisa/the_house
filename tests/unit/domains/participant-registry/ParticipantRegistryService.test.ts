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
  InMemoryParticipantRegistryStore,
  ParticipantRegistryService,
  PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
  participantCreatedDedupeKey,
} from '../../../../src/domains/participant-registry/index.js';
import { TelemetryCounters, TelemetryEvents } from '../../../../src/observability/TelemetryEvents.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';
import { FORBIDDEN_DOMAIN_TERMS } from '../../../../src/deployment/validateDeploymentBaseline.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';

/**
 * Unit tests for {@link ParticipantRegistryService}. Fully hermetic: an in-memory outbox, an
 * in-memory participant store, an in-memory Organization Registry store as the READ-ONLY
 * reference, a deterministic id generator + clock, and an in-memory telemetry sink. No DB,
 * Azure, Entra, or network.
 *
 * The participant registry is REFERENCE-DATA structure: it never calls the Governance Kernel,
 * never mutates governed state, and never mutates the Organization Registry. It models only
 * minimal identifying fields and generic organizational relationships — no registration,
 * payments, enrollment, event participation, eligibility, or sensitive attributes.
 */

const TENANT_ALPHA = '11111111-1111-1111-1111-111111111111';
const TENANT_BETA = '22222222-2222-2222-2222-222222222222';
const CLOCK = fixedClock(1_700_000_000_000);

function fixedIds(...ids: readonly string[]): IdGenerator {
  let i = 0;
  return { newId: () => ids[i++] ?? `gen-extra-${i}` };
}

function build(idGen: IdGenerator = fixedIds()): {
  service: ParticipantRegistryService;
  outbox: InMemoryOutboxStore;
  store: InMemoryParticipantRegistryStore;
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
  const store = new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK });
  const telemetry = new InMemoryTelemetry();
  const service = new ParticipantRegistryService(store, {
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

describe('ParticipantRegistryService — participant creation + validation', () => {
  // (1) Create a participant (draft by default).
  it('creates a participant with draft status by default', async () => {
    const { service, store } = build(fixedIds('p-1'));
    const p = await service.createParticipant({
      tenantId: TENANT_ALPHA,
      displayName: 'Reference Person',
    });
    expect(p.participantId).toBe('p-1');
    expect(p.status).toBe('draft');
    expect(p.tenantId).toBe(TENANT_ALPHA);
    expect((await store.getParticipantById(TENANT_ALPHA, 'p-1'))?.displayName).toBe('Reference Person');
  });

  // (2) Normalize email to lowercase + trimmed.
  it('normalizes a contact email to trimmed lowercase', async () => {
    const { service } = build(fixedIds('p-2'));
    const p = await service.createParticipant({
      tenantId: TENANT_ALPHA,
      displayName: 'Reference Person',
      email: '  Mixed.Case@Example.COM  ',
    });
    expect(p.email).toBe('mixed.case@example.com');
  });

  // (3) Reject an invalid email.
  it('rejects an invalid email', async () => {
    const { service } = build(fixedIds('p-3'));
    await expect(
      service.createParticipant({
        tenantId: TENANT_ALPHA,
        displayName: 'Reference Person',
        email: 'not-an-email',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PARTICIPANT_INVALID_EMAIL });
  });

  // (4) Reject a missing displayName.
  it('rejects a missing displayName', async () => {
    const { service } = build();
    await expect(
      service.createParticipant({ tenantId: TENANT_ALPHA, displayName: '   ' }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  // (5) Reject an invalid status (fail closed on unknown enum).
  it('rejects an invalid status', async () => {
    const { service } = build();
    await expect(
      service.createParticipant({
        tenantId: TENANT_ALPHA,
        displayName: 'Reference Person',
        status: 'bogus' as never,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });
});

describe('ParticipantRegistryService — updates + status (never delete)', () => {
  // (6) Update safe profile fields.
  it('updates safe profile fields without changing status', async () => {
    const { service } = build(fixedIds('p-6'));
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Original Name', status: 'active' });
    const updated = await service.updateParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-6',
      displayName: 'Renamed Person',
      givenName: 'Given',
      familyName: 'Family',
    });
    expect(updated.displayName).toBe('Renamed Person');
    expect(updated.givenName).toBe('Given');
    expect(updated.familyName).toBe('Family');
    expect(updated.status).toBe('active');
  });

  // (7) Suspend a participant.
  it('suspends a participant via a status change', async () => {
    const { service } = build(fixedIds('p-7'));
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    const suspended = await service.changeParticipantStatus({
      tenantId: TENANT_ALPHA,
      participantId: 'p-7',
      status: 'suspended',
    });
    expect(suspended.status).toBe('suspended');
  });

  // (8) Archive without deleting the row.
  it('archives a participant while retaining the row', async () => {
    const { service, store } = build(fixedIds('p-8'));
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    await service.changeParticipantStatus({ tenantId: TENANT_ALPHA, participantId: 'p-8', status: 'archived' });
    const row = await store.getParticipantById(TENANT_ALPHA, 'p-8');
    expect(row).toBeDefined();
    expect(row?.status).toBe('archived');
    expect(store.listAllParticipants()).toHaveLength(1);
  });
});

describe('ParticipantRegistryService — tenant-scoped reads', () => {
  // (9) List only the current tenant's participants.
  it('lists only the current tenant participants', async () => {
    const { service } = build(fixedIds('p-9a', 'p-9b'));
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Alpha Person' });
    await service.createParticipant({ tenantId: TENANT_BETA, displayName: 'Beta Person' });
    const alpha = await service.listParticipants(TENANT_ALPHA);
    expect(alpha.items).toHaveLength(1);
    expect(alpha.items[0]!.tenantId).toBe(TENANT_ALPHA);
  });

  // (10) Tenant Beta cannot read Tenant Alpha's participant.
  it('does not let Tenant Beta read a Tenant Alpha participant', async () => {
    const { service } = build(fixedIds('p-10'));
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Alpha Person' });
    expect(await service.getParticipant(TENANT_ALPHA, 'p-10')).toBeDefined();
    expect(await service.getParticipant(TENANT_BETA, 'p-10')).toBeUndefined();
  });
});

describe('ParticipantRegistryService — organization relationships', () => {
  // (11) Link an active participant to a same-tenant organization.
  it('links a participant to a same-tenant organization', async () => {
    const { service, orgService } = build(fixedIds('p-11', 'rel-11'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-11',
      relationshipType: 'member',
    });
    expect(link.relationshipId).toBe('rel-11');
    expect(link.organizationId).toBe('org-alpha');
    expect(link.participantId).toBe('p-11');
    expect(link.status).toBe('active');
  });

  // (12) Reject a link to a missing organization.
  it('rejects a link to a missing organization', async () => {
    const { service } = build(fixedIds('p-12', 'rel-12'));
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    await expect(
      service.linkParticipantToOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-missing',
        participantId: 'p-12',
        relationshipType: 'member',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_NOT_FOUND });
  });

  // (13) Reject a cross-tenant organization link (org belongs to another tenant).
  it('rejects linking a participant to a different tenant organization', async () => {
    const { service, orgService } = build(fixedIds('p-13', 'rel-13'));
    await seedOrg(orgService, TENANT_BETA, 'org-beta');
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    await expect(
      service.linkParticipantToOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-beta',
        participantId: 'p-13',
        relationshipType: 'member',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_NOT_FOUND });
  });

  // (14) Reject a link to a missing participant.
  it('rejects a link to a missing participant', async () => {
    const { service, orgService } = build(fixedIds('rel-14'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await expect(
      service.linkParticipantToOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-alpha',
        participantId: 'p-missing',
        relationshipType: 'member',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PARTICIPANT_NOT_FOUND });
  });

  // (15) Reject an active link for an archived participant.
  it('rejects an active link for an archived participant', async () => {
    const { service, orgService } = build(fixedIds('p-15', 'rel-15'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'archived' });
    await expect(
      service.linkParticipantToOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-alpha',
        participantId: 'p-15',
        relationshipType: 'member',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PARTICIPANT_ARCHIVED_NO_ACTIVE_LINK });
  });

  // (16) Suspend / end a relationship without deleting it.
  it('suspends and then ends a relationship via status changes', async () => {
    const { service, orgService } = build(fixedIds('p-16', 'rel-16'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-16',
      relationshipType: 'staff',
    });
    const suspended = await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_ALPHA,
      relationshipId: link.relationshipId,
      status: 'suspended',
    });
    expect(suspended.status).toBe('suspended');
    const ended = await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_ALPHA,
      relationshipId: link.relationshipId,
      status: 'ended',
      endDate: '2024-01-31',
    });
    expect(ended.status).toBe('ended');
    expect(ended.endDate).toBe('2024-01-31');
  });

  // (17) An ended relationship is retained (not deleted).
  it('retains an ended relationship row', async () => {
    const { service, orgService, store } = build(fixedIds('p-17', 'rel-17'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-17',
      relationshipType: 'member',
    });
    await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_ALPHA,
      relationshipId: link.relationshipId,
      status: 'ended',
    });
    const row = await store.getOrganizationLinkById(TENANT_ALPHA, link.relationshipId);
    expect(row).toBeDefined();
    expect(row?.status).toBe('ended');
    expect(store.listAllLinks()).toHaveLength(1);
  });
});

describe('ParticipantRegistryService — outbox signals (sanitized)', () => {
  // (18) Creation emits a participant.registry.created signal with a stable dedupe key.
  it('emits a participant.registry.created signal', async () => {
    const { service, outbox } = build(fixedIds('p-18'));
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person' });
    const created = outbox.records.find((r) => r.messageType === PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE);
    expect(created).toBeDefined();
    expect(created!.dedupeKey).toBe(participantCreatedDedupeKey('p-18'));
  });

  // (19) Linking emits a participant.registry.organization_linked signal.
  it('emits a participant.registry.organization_linked signal', async () => {
    const { service, orgService, outbox } = build(fixedIds('p-19', 'rel-19'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-19',
      relationshipType: 'official',
    });
    const linked = outbox.records.find(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
    );
    expect(linked).toBeDefined();
    expect(linked!.payload['relationshipId']).toBe('rel-19');
    expect(linked!.payload['organizationId']).toBe('org-alpha');
  });

  // (20) Outbox payloads carry no secrets/tokens/bytes AND never the participant email.
  it('emits sanitized payloads that exclude email, names, secrets, tokens, and bytes', async () => {
    const { service, outbox } = build(fixedIds('p-20'));
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      displayName: 'SECRET-NAME-MARKER',
      givenName: 'SECRET-GIVEN-MARKER',
      familyName: 'SECRET-FAMILY-MARKER',
      email: 'secret-email-marker@example.com',
    });
    const created = outbox.records.find((r) => r.messageType === PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE);
    expect(created).toBeDefined();
    expect(created!.payload).not.toHaveProperty('email');
    expect(created!.payload).not.toHaveProperty('displayName');
    expect(created!.payload).not.toHaveProperty('givenName');
    expect(created!.payload).not.toHaveProperty('familyName');
    const serialized = JSON.stringify(created!.payload).toLowerCase();
    expect(serialized).not.toContain('secret-email-marker');
    expect(serialized).not.toContain('secret-name-marker');
    for (const banned of ['bearer', 'authorization', 'password', 'secret=', 'apikey', 'set-cookie']) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe('ParticipantRegistryService — telemetry', () => {
  // (21) Telemetry records create, update, link, and read without leaking secrets.
  it('records create/update/link/read telemetry without leaking secrets', async () => {
    const { service, orgService, telemetry } = build(fixedIds('p-21', 'rel-21'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({ tenantId: TENANT_ALPHA, displayName: 'Reference Person', status: 'active' });
    await service.updateParticipant({ tenantId: TENANT_ALPHA, participantId: 'p-21', displayName: 'Renamed Person' });
    await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-21',
      relationshipType: 'member',
    });
    await service.getParticipant(TENANT_ALPHA, 'p-21');
    await service.listParticipants(TENANT_ALPHA);

    expect(telemetry.counterTotal(TelemetryCounters.participantRegistryCreated)).toBe(1);
    expect(telemetry.counterTotal(TelemetryCounters.participantRegistryUpdated)).toBe(1);
    expect(telemetry.counterTotal(TelemetryCounters.participantRegistryOrganizationLinked)).toBe(1);
    expect(telemetry.counterTotal(TelemetryCounters.participantRegistryRead)).toBe(2);
    expect(telemetry.hasEvent(TelemetryEvents.participantRegistryCreated)).toBe(true);
    expect(telemetry.hasEvent(TelemetryEvents.participantRegistryOrganizationLinked)).toBe(true);

    const serialized = JSON.stringify(telemetry.snapshot());
    expect(serialized).not.toMatch(/password|secret|authorization|bearer/i);
  });
});

describe('ParticipantRegistryService — NSO-generic vocabulary', () => {
  // (22) The participant registry domain source carries no sport-specific terms.
  it('uses no sport-specific terminology', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const domainDir = join(here, '..', '..', '..', '..', 'src', 'domains', 'participant-registry');
    // The banned terms come from the shared deployment baseline so this test file does not itself
    // spell them out (which would trip the static baseline validator); only the domain SOURCE
    // files are inspected.
    const files = readdirSync(domainDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(join(domainDir, file), 'utf8').toLowerCase();
      for (const term of FORBIDDEN_DOMAIN_TERMS) {
        expect(text.includes(term), `${file} leaks sport term "${term}"`).toBe(false);
      }
    }
  });
});
