/**
 * In-memory {@link OrganizationRegistryStore} — LOCAL/DEMO/TEST ONLY.
 *
 * Holds canonical organization rows in process and enqueues registry signals through the
 * supplied {@link OutboxStore}, mirroring the Pg store's create/update/read semantics so the
 * service's unit tests are fully hermetic (no DB, network, or Azure). It is NOT durable and is
 * NOT a second system of record.
 */

import { systemClock, type Clock } from '../../shared/time/clock.js';
import type { OutboxEnqueueInput, OutboxStore } from '../../governance/outbox/OutboxStore.js';
import {
  type CreateOrganizationOutcome,
  type OrganizationRegistryStore,
  type UpdateOrganizationOutcome,
} from './OrganizationRegistryStore.js';
import {
  clampOrganizationListLimit,
  type OrganizationListCursor,
  type OrganizationListFilter,
  type OrganizationListResult,
  type OrganizationRecord,
  type OrganizationView,
} from './OrganizationTypes.js';

export interface InMemoryOrganizationRegistryStoreDeps {
  readonly clock?: Clock;
}

function rowKey(tenantId: string, organizationId: string): string {
  return `${tenantId}:${organizationId}`;
}

function clone(record: OrganizationRecord): OrganizationView {
  return { ...record };
}

/** Stable sort: createdAt ASC, then organizationId ASC (keyset tiebreaker). */
function compareRows(a: OrganizationRecord, b: OrganizationRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.organizationId !== b.organizationId) return a.organizationId < b.organizationId ? -1 : 1;
  return 0;
}

function afterCursor(record: OrganizationRecord, cursor: OrganizationListCursor): boolean {
  if (record.createdAt !== cursor.createdAt) return record.createdAt > cursor.createdAt;
  return record.organizationId > cursor.id;
}

export class InMemoryOrganizationRegistryStore implements OrganizationRegistryStore {
  private readonly rows = new Map<string, OrganizationRecord>();
  private readonly clock: Clock;

  constructor(
    private readonly outbox: OutboxStore,
    deps: InMemoryOrganizationRegistryStoreDeps = {},
  ) {
    this.clock = deps.clock ?? systemClock;
  }

  async create(
    record: OrganizationRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateOrganizationOutcome> {
    const key = rowKey(record.tenantId, record.organizationId);
    const existing = this.rows.get(key);
    if (existing !== undefined) {
      // Idempotent replay: never duplicate the row or the outbox signal.
      return { outcome: 'conflict', view: clone(existing) };
    }
    const outboxMessageId = await this.outbox.enqueue(outbox);
    this.rows.set(key, { ...record });
    return { outcome: 'created', view: clone(record), outboxMessageId };
  }

  async update(
    record: OrganizationRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateOrganizationOutcome> {
    const key = rowKey(record.tenantId, record.organizationId);
    const existing = this.rows.get(key);
    if (existing === undefined) {
      return { outcome: 'not_found' };
    }
    const outboxMessageId = await this.outbox.enqueue(outbox);
    // Only mutable columns change; immutable columns are preserved from the existing row.
    const next: OrganizationRecord = {
      tenantId: existing.tenantId,
      organizationId: existing.organizationId,
      organizationType: existing.organizationType,
      source: existing.source,
      createdAt: existing.createdAt,
      displayName: record.displayName,
      status: record.status,
      updatedAt: record.updatedAt,
      ...(existing.sourceEntityType !== undefined
        ? { sourceEntityType: existing.sourceEntityType }
        : {}),
      ...(existing.sourceEntityId !== undefined ? { sourceEntityId: existing.sourceEntityId } : {}),
      ...(record.legalName !== undefined ? { legalName: record.legalName } : {}),
      ...(record.parentOrganizationId !== undefined
        ? { parentOrganizationId: record.parentOrganizationId }
        : {}),
    };
    this.rows.set(key, next);
    return { outcome: 'updated', view: clone(next), outboxMessageId };
  }

  async getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined> {
    const existing = this.rows.get(rowKey(tenantId, organizationId));
    return existing !== undefined ? clone(existing) : undefined;
  }

  async list(tenantId: string, filter: OrganizationListFilter): Promise<OrganizationListResult> {
    const limit = clampOrganizationListLimit(filter.limit);
    const matched = [...this.rows.values()]
      .filter((r) => r.tenantId === tenantId)
      .filter((r) =>
        filter.organizationType !== undefined ? r.organizationType === filter.organizationType : true,
      )
      .filter((r) => (filter.status !== undefined ? r.status === filter.status : true))
      .filter((r) =>
        filter.parentOrganizationId !== undefined
          ? r.parentOrganizationId === filter.parentOrganizationId
          : true,
      )
      .filter((r) => (filter.cursor !== undefined ? afterCursor(r, filter.cursor) : true))
      .sort(compareRows);

    const page = matched.slice(0, limit);
    const items = page.map(clone);
    const result: { items: OrganizationView[]; nextCursor?: OrganizationListCursor } = { items };
    if (matched.length > limit && page.length > 0) {
      const last = page[page.length - 1]!;
      result.nextCursor = { createdAt: last.createdAt, id: last.organizationId };
    }
    return result;
  }

  /** Test/local inspection helper. Returns defensive copies. */
  listAll(): readonly OrganizationView[] {
    return [...this.rows.values()].map(clone);
  }
}
