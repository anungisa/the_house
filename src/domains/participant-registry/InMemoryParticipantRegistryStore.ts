/**
 * In-memory {@link ParticipantRegistryStore} — LOCAL/DEMO/TEST ONLY.
 *
 * Holds canonical participant + organization-participant rows in process and enqueues registry
 * signals through the supplied {@link OutboxStore}, mirroring the Pg store's create/update/read
 * semantics so the service's unit tests are fully hermetic (no DB, network, or Azure). It is NOT
 * durable and is NOT a second system of record.
 */

import { systemClock, type Clock } from '../../shared/time/clock.js';
import type { OutboxEnqueueInput, OutboxStore } from '../../governance/outbox/OutboxStore.js';
import {
  type CreateOrganizationLinkOutcome,
  type CreateParticipantOutcome,
  type ParticipantRegistryStore,
  type UpdateOrganizationLinkOutcome,
  type UpdateParticipantOutcome,
} from './ParticipantRegistryStore.js';
import {
  clampParticipantListLimit,
  type OrganizationParticipantListFilter,
  type OrganizationParticipantListResult,
  type OrganizationParticipantRecord,
  type OrganizationParticipantView,
  type ParticipantListCursor,
  type ParticipantListFilter,
  type ParticipantListResult,
  type ParticipantRecord,
  type ParticipantView,
  type RelationshipType,
} from './ParticipantTypes.js';

export interface InMemoryParticipantRegistryStoreDeps {
  readonly clock?: Clock;
}

function rowKey(tenantId: string, id: string): string {
  return `${tenantId}:${id}`;
}

function cloneParticipant(record: ParticipantRecord): ParticipantView {
  return {
    ...record,
    ...(record.externalRefs !== undefined
      ? { externalRefs: record.externalRefs.map((r) => ({ ...r })) }
      : {}),
  };
}

function cloneLink(record: OrganizationParticipantRecord): OrganizationParticipantView {
  return { ...record };
}

/** Stable sort: createdAt ASC, then id ASC (keyset tiebreaker). */
function compareByCreatedThenId(a: { createdAt: string }, aId: string, b: { createdAt: string }, bId: string): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (aId !== bId) return aId < bId ? -1 : 1;
  return 0;
}

function afterCursor(createdAt: string, id: string, cursor: ParticipantListCursor): boolean {
  if (createdAt !== cursor.createdAt) return createdAt > cursor.createdAt;
  return id > cursor.id;
}

export class InMemoryParticipantRegistryStore implements ParticipantRegistryStore {
  private readonly participants = new Map<string, ParticipantRecord>();
  private readonly links = new Map<string, OrganizationParticipantRecord>();
  private readonly clock: Clock;

  constructor(
    private readonly outbox: OutboxStore,
    deps: InMemoryParticipantRegistryStoreDeps = {},
  ) {
    this.clock = deps.clock ?? systemClock;
  }

  async createParticipant(
    record: ParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateParticipantOutcome> {
    const key = rowKey(record.tenantId, record.participantId);
    const existing = this.participants.get(key);
    if (existing !== undefined) {
      return { outcome: 'conflict', view: cloneParticipant(existing) };
    }
    const outboxMessageId = await this.outbox.enqueue(outbox);
    this.participants.set(key, cloneParticipant(record));
    return { outcome: 'created', view: cloneParticipant(record), outboxMessageId };
  }

  async updateParticipant(
    record: ParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateParticipantOutcome> {
    const key = rowKey(record.tenantId, record.participantId);
    const existing = this.participants.get(key);
    if (existing === undefined) {
      return { outcome: 'not_found' };
    }
    const outboxMessageId = await this.outbox.enqueue(outbox);
    // Only mutable columns change; immutable columns are preserved from the existing row.
    const next: ParticipantRecord = {
      tenantId: existing.tenantId,
      participantId: existing.participantId,
      createdAt: existing.createdAt,
      displayName: record.displayName,
      status: record.status,
      updatedAt: record.updatedAt,
      ...(record.givenName !== undefined ? { givenName: record.givenName } : {}),
      ...(record.familyName !== undefined ? { familyName: record.familyName } : {}),
      ...(record.email !== undefined ? { email: record.email } : {}),
      ...(record.externalRefs !== undefined ? { externalRefs: record.externalRefs.map((r) => ({ ...r })) } : {}),
    };
    this.participants.set(key, next);
    return { outcome: 'updated', view: cloneParticipant(next), outboxMessageId };
  }

  async getParticipantById(tenantId: string, participantId: string): Promise<ParticipantView | undefined> {
    const existing = this.participants.get(rowKey(tenantId, participantId));
    return existing !== undefined ? cloneParticipant(existing) : undefined;
  }

  async listParticipants(
    tenantId: string,
    filter: ParticipantListFilter,
  ): Promise<ParticipantListResult> {
    const limit = clampParticipantListLimit(filter.limit);
    const matched = [...this.participants.values()]
      .filter((r) => r.tenantId === tenantId)
      .filter((r) => (filter.status !== undefined ? r.status === filter.status : true))
      .filter((r) => (filter.email !== undefined ? r.email === filter.email : true))
      .filter((r) => (filter.cursor !== undefined ? afterCursor(r.createdAt, r.participantId, filter.cursor) : true))
      .sort((a, b) => compareByCreatedThenId(a, a.participantId, b, b.participantId));

    const page = matched.slice(0, limit);
    const items = page.map(cloneParticipant);
    const result: { items: ParticipantView[]; nextCursor?: ParticipantListCursor } = { items };
    if (matched.length > limit && page.length > 0) {
      const last = page[page.length - 1]!;
      result.nextCursor = { createdAt: last.createdAt, id: last.participantId };
    }
    return result;
  }

  async createOrganizationLink(
    record: OrganizationParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateOrganizationLinkOutcome> {
    const key = rowKey(record.tenantId, record.relationshipId);
    const existing = this.links.get(key);
    if (existing !== undefined) {
      return { outcome: 'conflict', view: cloneLink(existing) };
    }
    const outboxMessageId = await this.outbox.enqueue(outbox);
    this.links.set(key, { ...record });
    return { outcome: 'created', view: cloneLink(record), outboxMessageId };
  }

  async updateOrganizationLink(
    record: OrganizationParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateOrganizationLinkOutcome> {
    const key = rowKey(record.tenantId, record.relationshipId);
    const existing = this.links.get(key);
    if (existing === undefined) {
      return { outcome: 'not_found' };
    }
    const outboxMessageId = await this.outbox.enqueue(outbox);
    const next: OrganizationParticipantRecord = {
      tenantId: existing.tenantId,
      relationshipId: existing.relationshipId,
      organizationId: existing.organizationId,
      participantId: existing.participantId,
      relationshipType: existing.relationshipType,
      createdAt: existing.createdAt,
      status: record.status,
      updatedAt: record.updatedAt,
      ...(record.startDate !== undefined ? { startDate: record.startDate } : {}),
      ...(record.endDate !== undefined ? { endDate: record.endDate } : {}),
    };
    this.links.set(key, next);
    return { outcome: 'updated', view: cloneLink(next), outboxMessageId };
  }

  async getOrganizationLinkById(
    tenantId: string,
    relationshipId: string,
  ): Promise<OrganizationParticipantView | undefined> {
    const existing = this.links.get(rowKey(tenantId, relationshipId));
    return existing !== undefined ? cloneLink(existing) : undefined;
  }

  async findActiveOrganizationLink(
    tenantId: string,
    organizationId: string,
    participantId: string,
    relationshipType: RelationshipType,
  ): Promise<OrganizationParticipantView | undefined> {
    const found = [...this.links.values()].find(
      (r) =>
        r.tenantId === tenantId &&
        r.organizationId === organizationId &&
        r.participantId === participantId &&
        r.relationshipType === relationshipType &&
        r.status !== 'ended',
    );
    return found !== undefined ? cloneLink(found) : undefined;
  }

  async listOrganizationParticipants(
    tenantId: string,
    filter: OrganizationParticipantListFilter,
  ): Promise<OrganizationParticipantListResult> {
    const limit = clampParticipantListLimit(filter.limit);
    const matched = [...this.links.values()]
      .filter((r) => r.tenantId === tenantId)
      .filter((r) => (filter.organizationId !== undefined ? r.organizationId === filter.organizationId : true))
      .filter((r) => (filter.participantId !== undefined ? r.participantId === filter.participantId : true))
      .filter((r) => (filter.relationshipType !== undefined ? r.relationshipType === filter.relationshipType : true))
      .filter((r) => (filter.status !== undefined ? r.status === filter.status : true))
      .filter((r) => (filter.cursor !== undefined ? afterCursor(r.createdAt, r.relationshipId, filter.cursor) : true))
      .sort((a, b) => compareByCreatedThenId(a, a.relationshipId, b, b.relationshipId));

    const page = matched.slice(0, limit);
    const items = page.map(cloneLink);
    const result: { items: OrganizationParticipantView[]; nextCursor?: ParticipantListCursor } = { items };
    if (matched.length > limit && page.length > 0) {
      const last = page[page.length - 1]!;
      result.nextCursor = { createdAt: last.createdAt, id: last.relationshipId };
    }
    return result;
  }

  /** Test/local inspection helper. Returns defensive copies. */
  listAllParticipants(): readonly ParticipantView[] {
    return [...this.participants.values()].map(cloneParticipant);
  }

  /** Test/local inspection helper. Returns defensive copies. */
  listAllLinks(): readonly OrganizationParticipantView[] {
    return [...this.links.values()].map(cloneLink);
  }
}
