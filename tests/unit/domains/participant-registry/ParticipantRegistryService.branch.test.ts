import { describe, expect, it } from 'vitest';
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
  PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
  buildParticipantCreatedOutbox,
  buildParticipantUpdatedOutbox,
  buildOrganizationLinkedOutbox,
  buildOrganizationLinkStatusChangedOutbox,
} from '../../../../src/domains/participant-registry/index.js';
import { TelemetryCounters, TelemetryEvents } from '../../../../src/observability/TelemetryEvents.js';
import { ErrorCode } from '../../../../src/shared/errors/AppError.js';
import { fixedClock } from '../../../../src/shared/time/clock.js';
import type { IdGenerator } from '../../../../src/shared/uuid/id.js';
import type {
  OrganizationParticipantRecord,
  ParticipantRecord,
} from '../../../../src/domains/participant-registry/ParticipantTypes.js';

/**
 * Focused WRITE-PATH branch coverage for {@link ParticipantRegistryService} and
 * {@link InMemoryParticipantRegistryStore}. This complements the behavioral suite in
 * `ParticipantRegistryService.test.ts` by exercising the decision branches that suite does not
 * reach: idempotent replays (create / link / status no-ops), not-found write paths,
 * null-clearing vs unchanged update semantics, the fail-closed missing-organization-reader path,
 * archived-but-non-active linking, outbox correlation/causation lineage, and the store's
 * conflict / not_found / list-cursor branches.
 *
 * Fully hermetic: in-memory outbox + participant store + read-only organization reference, a
 * deterministic id generator + clock, and an in-memory telemetry sink. No DB, Azure, Entra, or
 * network. The participant registry remains REFERENCE-DATA structure — it never calls the
 * Governance Kernel, never mutates governed state, and never mutates the Organization Registry.
 */

const TENANT_ALPHA = '11111111-1111-1111-1111-111111111111';
const CLOCK = fixedClock(1_700_000_000_000);

function fixedIds(...ids: readonly string[]): IdGenerator {
  let i = 0;
  return { newId: () => ids[i++] ?? `gen-extra-${i}` };
}

interface Harness {
  service: ParticipantRegistryService;
  outbox: InMemoryOutboxStore;
  store: InMemoryParticipantRegistryStore;
  orgService: OrganizationRegistryService;
  telemetry: InMemoryTelemetry;
}

/** Build a service WITH a read-only organization reference. */
function build(idGen: IdGenerator = fixedIds()): Harness {
  const outbox = new InMemoryOutboxStore(CLOCK);
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
  return { service, outbox, store, orgService, telemetry };
}

/** Build a service WITHOUT any organization reader (fail-closed link path). */
function buildWithoutOrgReader(idGen: IdGenerator = fixedIds()): {
  service: ParticipantRegistryService;
  store: InMemoryParticipantRegistryStore;
} {
  const outbox = new InMemoryOutboxStore(CLOCK);
  const store = new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK });
  const service = new ParticipantRegistryService(store, { clock: CLOCK, ids: idGen });
  return { service, store };
}

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

function countMessages(outbox: InMemoryOutboxStore, messageType: string): number {
  return outbox.records.filter((r) => r.messageType === messageType).length;
}

describe('ParticipantRegistryService.branch — create write branches', () => {
  it('rejects a blank tenantId (fail closed)', async () => {
    const { service } = build();
    await expect(
      service.createParticipant({ tenantId: '   ', displayName: 'Reference Person' }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('treats a repeat create of the same id as an idempotent replay (no new row, no new signal)', async () => {
    const { service, outbox, telemetry } = build(fixedIds());
    const first = await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-dup',
      displayName: 'Reference Person',
      status: 'active',
    });
    const replay = await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-dup',
      displayName: 'Different Name (ignored on replay)',
      status: 'draft',
    });
    // The pre-existing row is returned unchanged.
    expect(replay.participantId).toBe(first.participantId);
    expect(replay.status).toBe('active');
    expect(replay.displayName).toBe('Reference Person');
    // Exactly one created signal + one created telemetry increment.
    expect(countMessages(outbox, PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE)).toBe(1);
    expect(telemetry.counterTotal(TelemetryCounters.participantRegistryCreated)).toBe(1);
  });

  it('persists explicit externalRefs and records a correlationId on the created event', async () => {
    const { service, store, outbox, telemetry } = build(fixedIds('p-ext'));
    const created = await service.createParticipant({
      tenantId: TENANT_ALPHA,
      displayName: 'Reference Person',
      externalRefs: [{ provider: 'membership', externalId: 'M-1' }],
      correlationId: 'corr-create',
    });
    expect(created.externalRefs).toEqual([{ provider: 'membership', externalId: 'M-1' }]);
    expect((await store.getParticipantById(TENANT_ALPHA, 'p-ext'))?.externalRefs).toEqual([
      { provider: 'membership', externalId: 'M-1' },
    ]);
    // The created outbox row carries lineage; the payload still excludes name/email.
    const createdMsg = outbox.records.find(
      (r) => r.messageType === PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE,
    );
    expect(createdMsg?.correlationId).toBe('corr-create');
    expect(telemetry.hasEvent(TelemetryEvents.participantRegistryCreated)).toBe(true);
  });
});

describe('ParticipantRegistryService.branch — update write branches', () => {
  it('rejects a blank participantId on update (fail closed)', async () => {
    const { service } = build();
    await expect(
      service.updateParticipant({ tenantId: TENANT_ALPHA, participantId: '   ', displayName: 'X' }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects updating a participant that does not exist', async () => {
    const { service } = build();
    await expect(
      service.updateParticipant({
        tenantId: TENANT_ALPHA,
        participantId: 'missing',
        displayName: 'X',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PARTICIPANT_NOT_FOUND });
  });

  it('clears nullable fields when null is supplied and leaves them when undefined', async () => {
    const { service } = build(fixedIds('p-clear'));
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-clear',
      displayName: 'Reference Person',
      givenName: 'Given',
      familyName: 'Family',
      email: 'person@example.com',
      externalRefs: [{ provider: 'membership', externalId: 'M-2' }],
      status: 'active',
    });
    const cleared = await service.updateParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-clear',
      givenName: null,
      familyName: null,
      email: null,
      externalRefs: null,
    });
    expect(cleared.givenName).toBeUndefined();
    expect(cleared.familyName).toBeUndefined();
    expect(cleared.email).toBeUndefined();
    expect(cleared.externalRefs).toBeUndefined();
    // displayName + status were left unchanged (undefined inputs).
    expect(cleared.displayName).toBe('Reference Person');
    expect(cleared.status).toBe('active');
  });

  it('sets nullable fields when concrete values are supplied', async () => {
    const { service } = build(fixedIds('p-set'));
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-set',
      displayName: 'Reference Person',
    });
    const updated = await service.updateParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-set',
      givenName: 'NewGiven',
      familyName: 'NewFamily',
      email: '  New.Email@Example.COM  ',
      externalRefs: [{ provider: 'membership', externalId: 'M-3' }],
    });
    expect(updated.givenName).toBe('NewGiven');
    expect(updated.familyName).toBe('NewFamily');
    expect(updated.email).toBe('new.email@example.com');
    expect(updated.externalRefs).toEqual([{ provider: 'membership', externalId: 'M-3' }]);
  });

  it('emits an updated signal even when no profile fields change', async () => {
    const { service, outbox } = build(fixedIds('p-noop'));
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-noop',
      displayName: 'Reference Person',
    });
    const updated = await service.updateParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-noop',
    });
    expect(updated.displayName).toBe('Reference Person');
    expect(countMessages(outbox, PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE)).toBe(1);
  });
});

describe('ParticipantRegistryService.branch — status write branches', () => {
  it('rejects an invalid status (fail closed on unknown enum)', async () => {
    const { service } = build(fixedIds('p-badstatus'));
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-badstatus',
      displayName: 'Reference Person',
    });
    await expect(
      service.changeParticipantStatus({
        tenantId: TENANT_ALPHA,
        participantId: 'p-badstatus',
        status: 'bogus' as never,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects a status change on a missing participant', async () => {
    const { service } = build();
    await expect(
      service.changeParticipantStatus({
        tenantId: TENANT_ALPHA,
        participantId: 'missing',
        status: 'active',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.PARTICIPANT_NOT_FOUND });
  });

  it('treats a no-op status change as idempotent (no mutation, no signal)', async () => {
    const { service, outbox, telemetry } = build(fixedIds('p-same'));
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-same',
      displayName: 'Reference Person',
      status: 'active',
    });
    const same = await service.changeParticipantStatus({
      tenantId: TENANT_ALPHA,
      participantId: 'p-same',
      status: 'active',
    });
    expect(same.status).toBe('active');
    expect(countMessages(outbox, PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE)).toBe(0);
    expect(telemetry.counterTotal(TelemetryCounters.participantRegistryStatusChanged)).toBe(0);
  });

  it('emits a status_changed signal with lineage on a real transition', async () => {
    const { service, outbox, telemetry } = build(fixedIds('p-trans'));
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-trans',
      displayName: 'Reference Person',
      status: 'active',
    });
    await service.changeParticipantStatus({
      tenantId: TENANT_ALPHA,
      participantId: 'p-trans',
      status: 'suspended',
      correlationId: 'corr-status',
    });
    const msg = outbox.records.find(
      (r) => r.messageType === PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
    );
    expect(msg?.correlationId).toBe('corr-status');
    expect(msg?.payload['previousStatus']).toBe('active');
    expect(msg?.payload['newStatus']).toBe('suspended');
    expect(telemetry.hasEvent(TelemetryEvents.participantRegistryStatusChanged)).toBe(true);
  });
});

describe('ParticipantRegistryService.branch — link write branches', () => {
  it('fails closed when no organization reader is configured', async () => {
    const { service } = buildWithoutOrgReader(fixedIds('p-noreader'));
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-noreader',
      displayName: 'Reference Person',
      status: 'active',
    });
    await expect(
      service.linkParticipantToOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-any',
        participantId: 'p-noreader',
        relationshipType: 'member',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_NOT_FOUND });
  });

  it('rejects an invalid relationshipType (fail closed on unknown enum)', async () => {
    const { service, orgService } = build(fixedIds('p-badtype'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-badtype',
      displayName: 'Reference Person',
      status: 'active',
    });
    await expect(
      service.linkParticipantToOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-alpha',
        participantId: 'p-badtype',
        relationshipType: 'captain' as never,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('rejects an invalid relationship status (fail closed on unknown enum)', async () => {
    const { service, orgService } = build(fixedIds('p-badrelstatus'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-badrelstatus',
      displayName: 'Reference Person',
      status: 'active',
    });
    await expect(
      service.linkParticipantToOrganization({
        tenantId: TENANT_ALPHA,
        organizationId: 'org-alpha',
        participantId: 'p-badrelstatus',
        relationshipType: 'member',
        status: 'bogus' as never,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('allows an archived participant to receive a NON-active (suspended) relationship', async () => {
    const { service, orgService } = build(fixedIds('p-arch', 'rel-arch'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-arch',
      displayName: 'Reference Person',
      status: 'archived',
    });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-arch',
      relationshipType: 'member',
      status: 'suspended',
    });
    expect(link.status).toBe('suspended');
  });

  it('returns the existing relationship on a duplicate active link (idempotent)', async () => {
    const { service, orgService, outbox } = build(fixedIds('p-idem', 'rel-idem', 'rel-idem-2'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-idem',
      displayName: 'Reference Person',
      status: 'active',
    });
    const first = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-idem',
      relationshipType: 'member',
    });
    const second = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-idem',
      relationshipType: 'member',
    });
    expect(second.relationshipId).toBe(first.relationshipId);
    expect(countMessages(outbox, PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE)).toBe(1);
  });

  it('creates a fresh relationship after the prior one of the same type has ended', async () => {
    const { service, orgService } = build(fixedIds('p-relink', 'rel-old', 'rel-new'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-relink',
      displayName: 'Reference Person',
      status: 'active',
    });
    const old = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-relink',
      relationshipType: 'member',
    });
    await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_ALPHA,
      relationshipId: old.relationshipId,
      status: 'ended',
    });
    const fresh = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-relink',
      relationshipType: 'member',
    });
    expect(fresh.relationshipId).not.toBe(old.relationshipId);
    expect(fresh.status).toBe('active');
  });

  it('records lineage + start/end dates when linking with correlation metadata', async () => {
    const { service, orgService, outbox } = build(fixedIds('p-dates', 'rel-dates'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-dates',
      displayName: 'Reference Person',
      status: 'active',
    });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-dates',
      relationshipType: 'staff',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      correlationId: 'corr-link',
    });
    expect(link.startDate).toBe('2024-01-01');
    expect(link.endDate).toBe('2024-12-31');
    const msg = outbox.records.find(
      (r) => r.messageType === PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
    );
    expect(msg?.correlationId).toBe('corr-link');
  });
});

describe('ParticipantRegistryService.branch — relationship-status write branches', () => {
  it('rejects a blank/undefined relationshipId as not found', async () => {
    const { service } = build();
    await expect(
      service.changeOrganizationParticipantStatus({
        tenantId: TENANT_ALPHA,
        relationshipId: undefined as unknown as string,
        status: 'suspended',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_PARTICIPANT_NOT_FOUND });
  });

  it('rejects a status change on a missing relationship', async () => {
    const { service } = build();
    await expect(
      service.changeOrganizationParticipantStatus({
        tenantId: TENANT_ALPHA,
        relationshipId: 'rel-missing',
        status: 'suspended',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.ORGANIZATION_PARTICIPANT_NOT_FOUND });
  });

  it('rejects an invalid relationship status (fail closed on unknown enum)', async () => {
    const { service, orgService } = build(fixedIds('p-rs', 'rel-rs'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-rs',
      displayName: 'Reference Person',
      status: 'active',
    });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-rs',
      relationshipType: 'member',
    });
    await expect(
      service.changeOrganizationParticipantStatus({
        tenantId: TENANT_ALPHA,
        relationshipId: link.relationshipId,
        status: 'paused' as never,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('treats a no-op relationship status change as idempotent', async () => {
    const { service, orgService, outbox } = build(fixedIds('p-rsnoop', 'rel-rsnoop'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-rsnoop',
      displayName: 'Reference Person',
      status: 'active',
    });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-rsnoop',
      relationshipType: 'member',
    });
    const same = await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_ALPHA,
      relationshipId: link.relationshipId,
      status: 'active',
    });
    expect(same.status).toBe('active');
    expect(countMessages(outbox, PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE)).toBe(0);
  });

  it('applies an endDate even when the status is unchanged (not a no-op)', async () => {
    const { service, orgService, outbox } = build(fixedIds('p-rsend', 'rel-rsend'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-rsend',
      displayName: 'Reference Person',
      status: 'active',
    });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-rsend',
      relationshipType: 'member',
    });
    const updated = await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_ALPHA,
      relationshipId: link.relationshipId,
      status: 'active',
      endDate: '2024-06-30',
    });
    expect(updated.status).toBe('active');
    expect(updated.endDate).toBe('2024-06-30');
    expect(countMessages(outbox, PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE)).toBe(1);
  });
});

describe('ParticipantRegistryService.branch — read branches', () => {
  it('returns undefined for an absent participantId but still records a read', async () => {
    const { service, telemetry } = build();
    const view = await service.getParticipant(TENANT_ALPHA, undefined as unknown as string);
    expect(view).toBeUndefined();
    expect(telemetry.counterTotal(TelemetryCounters.participantRegistryRead)).toBe(1);
  });
});

describe('ParticipantRegistryService.branch — outbox lineage + sanitization', () => {
  it('propagates correlationId + causationId onto every write signal while excluding name/email', async () => {
    const { service, orgService, outbox } = build(fixedIds('p-lin', 'rel-lin'));
    await seedOrg(orgService, TENANT_ALPHA, 'org-alpha');
    const meta = {
      actorUserId: 'actor-1',
      requestId: 'req-1',
      correlationId: 'corr-1',
      causationId: 'cause-1',
    };
    await service.createParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-lin',
      displayName: 'SECRET-NAME-MARKER',
      email: 'secret-email-marker@example.com',
      status: 'active',
      ...meta,
    });
    await service.updateParticipant({
      tenantId: TENANT_ALPHA,
      participantId: 'p-lin',
      displayName: 'SECRET-NAME-MARKER-2',
      ...meta,
    });
    await service.changeParticipantStatus({
      tenantId: TENANT_ALPHA,
      participantId: 'p-lin',
      status: 'suspended',
      ...meta,
    });
    const link = await service.linkParticipantToOrganization({
      tenantId: TENANT_ALPHA,
      organizationId: 'org-alpha',
      participantId: 'p-lin',
      relationshipType: 'member',
      status: 'suspended',
      ...meta,
    });
    await service.changeOrganizationParticipantStatus({
      tenantId: TENANT_ALPHA,
      relationshipId: link.relationshipId,
      status: 'ended',
      endDate: '2024-09-30',
      ...meta,
    });

    const registrySignals = outbox.records.filter((r) => r.messageType.startsWith('participant.registry.'));
    expect(registrySignals.length).toBe(5);
    for (const sig of registrySignals) {
      expect(sig.correlationId).toBe('corr-1');
      expect(sig.causationId).toBe('cause-1');
      expect(sig.payload['actorUserId']).toBe('actor-1');
      expect(sig.payload['requestId']).toBe('req-1');
      expect(sig.payload).not.toHaveProperty('email');
      expect(sig.payload).not.toHaveProperty('displayName');
      const serialized = JSON.stringify(sig.payload).toLowerCase();
      expect(serialized).not.toContain('secret-email-marker');
      expect(serialized).not.toContain('secret-name-marker');
      for (const banned of ['bearer', 'authorization', 'password', 'secret=', 'apikey', 'set-cookie']) {
        expect(serialized).not.toContain(banned);
      }
    }
  });
});

describe('InMemoryParticipantRegistryStore.branch — store outcomes + list cursors', () => {
  const baseParticipant = (overrides: Partial<ParticipantRecord> = {}): ParticipantRecord => ({
    tenantId: TENANT_ALPHA,
    participantId: 'store-p',
    displayName: 'Reference Person',
    status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  const baseLink = (overrides: Partial<OrganizationParticipantRecord> = {}): OrganizationParticipantRecord => ({
    tenantId: TENANT_ALPHA,
    relationshipId: 'store-rel',
    organizationId: 'org-alpha',
    participantId: 'store-p',
    relationshipType: 'member',
    status: 'active',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  function freshStore(): { store: InMemoryParticipantRegistryStore; outbox: InMemoryOutboxStore } {
    const outbox = new InMemoryOutboxStore(CLOCK);
    return { store: new InMemoryParticipantRegistryStore(outbox, { clock: CLOCK }), outbox };
  }

  it('returns not_found when updating an absent participant', async () => {
    const { store } = freshStore();
    const record = baseParticipant();
    const outbox = buildParticipantUpdatedOutbox(record, {});
    const result = await store.updateParticipant(record, outbox);
    expect(result.outcome).toBe('not_found');
  });

  it('returns not_found when updating an absent relationship', async () => {
    const { store } = freshStore();
    const record = baseLink();
    const outbox = buildOrganizationLinkStatusChangedOutbox(record, 'active', {});
    const result = await store.updateOrganizationLink(record, outbox);
    expect(result.outcome).toBe('not_found');
  });

  it('returns conflict when creating a duplicate relationship id', async () => {
    const { store, outbox } = freshStore();
    const record = baseLink();
    const linkedOutbox = buildOrganizationLinkedOutbox(record, {});
    const first = await store.createOrganizationLink(record, linkedOutbox);
    expect(first.outcome).toBe('created');
    const second = await store.createOrganizationLink(record, linkedOutbox);
    expect(second.outcome).toBe('conflict');
    // The conflicting create enqueues nothing new.
    expect(outbox.records).toHaveLength(1);
  });

  it('paginates participants with a keyset cursor and applies status/email filters', async () => {
    const { store } = freshStore();
    for (let i = 0; i < 3; i += 1) {
      const record = baseParticipant({
        participantId: `lp-${i}`,
        email: `person${i}@example.com`,
        createdAt: `2024-01-0${i + 1}T00:00:00.000Z`,
      });
      await store.createParticipant(record, buildParticipantCreatedOutbox(record, {}));
    }
    const firstPage = await store.listParticipants(TENANT_ALPHA, { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();
    const secondPage = await store.listParticipants(TENANT_ALPHA, {
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeUndefined();

    const byStatus = await store.listParticipants(TENANT_ALPHA, { status: 'active' });
    expect(byStatus.items).toHaveLength(3);
    const byEmail = await store.listParticipants(TENANT_ALPHA, { email: 'person1@example.com' });
    expect(byEmail.items).toHaveLength(1);
    expect(byEmail.items[0]!.participantId).toBe('lp-1');
  });

  it('paginates relationships with a keyset cursor and applies relationship filters', async () => {
    const { store } = freshStore();
    for (let i = 0; i < 3; i += 1) {
      const record = baseLink({
        relationshipId: `lr-${i}`,
        relationshipType: i === 0 ? 'staff' : 'member',
        createdAt: `2024-02-0${i + 1}T00:00:00.000Z`,
      });
      await store.createOrganizationLink(record, buildOrganizationLinkedOutbox(record, {}));
    }
    const firstPage = await store.listOrganizationParticipants(TENANT_ALPHA, { limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeDefined();
    const secondPage = await store.listOrganizationParticipants(TENANT_ALPHA, {
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items).toHaveLength(1);

    const onlyStaff = await store.listOrganizationParticipants(TENANT_ALPHA, { relationshipType: 'staff' });
    expect(onlyStaff.items).toHaveLength(1);
    const byOrg = await store.listOrganizationParticipants(TENANT_ALPHA, { organizationId: 'org-alpha' });
    expect(byOrg.items).toHaveLength(3);
    const byParticipant = await store.listOrganizationParticipants(TENANT_ALPHA, { participantId: 'store-p' });
    expect(byParticipant.items).toHaveLength(3);
  });
});
