/**
 * In-memory {@link FacilityRegistryStore} — LOCAL/DEMO/TEST ONLY.
 *
 * Holds canonical facility rows in process and enqueues registry signals through the supplied
 * {@link OutboxStore}, mirroring the Pg store's create/update/read semantics so the service's unit
 * tests are fully hermetic (no DB, network, or Azure). It is NOT durable and is NOT a second system
 * of record.
 */

import { systemClock, type Clock } from '../../shared/time/clock.js';
import type { OutboxEnqueueInput, OutboxStore } from '../../governance/outbox/OutboxStore.js';
import {
  type CreateFacilityOutcome,
  type FacilityRegistryStore,
  type UpdateFacilityOutcome,
} from './FacilityRegistryStore.js';
import {
  clampFacilityListLimit,
  type FacilityListCursor,
  type FacilityListFilter,
  type FacilityListResult,
  type FacilityRecord,
  type FacilityView,
} from './FacilityTypes.js';

export interface InMemoryFacilityRegistryStoreDeps {
  readonly clock?: Clock;
}

function rowKey(tenantId: string, facilityId: string): string {
  return `${tenantId}:${facilityId}`;
}

function clone(record: FacilityRecord): FacilityView {
  return { ...record, ...(record.capabilityTags !== undefined ? { capabilityTags: [...record.capabilityTags] } : {}) };
}

/** Stable sort: createdAt ASC, then facilityId ASC (keyset tiebreaker). */
function compareRows(a: FacilityRecord, b: FacilityRecord): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.facilityId !== b.facilityId) return a.facilityId < b.facilityId ? -1 : 1;
  return 0;
}

function afterCursor(record: FacilityRecord, cursor: FacilityListCursor): boolean {
  if (record.createdAt !== cursor.createdAt) return record.createdAt > cursor.createdAt;
  return record.facilityId > cursor.id;
}

export class InMemoryFacilityRegistryStore implements FacilityRegistryStore {
  private readonly rows = new Map<string, FacilityRecord>();
  private readonly clock: Clock;

  constructor(
    private readonly outbox: OutboxStore,
    deps: InMemoryFacilityRegistryStoreDeps = {},
  ) {
    this.clock = deps.clock ?? systemClock;
  }

  async create(
    record: FacilityRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateFacilityOutcome> {
    const key = rowKey(record.tenantId, record.facilityId);
    const existing = this.rows.get(key);
    if (existing !== undefined) {
      // Idempotent replay: never duplicate the row or the outbox signal.
      return { outcome: 'conflict', view: clone(existing) };
    }
    const outboxMessageId = await this.outbox.enqueue(outbox);
    this.rows.set(key, clone(record));
    return { outcome: 'created', view: clone(record), outboxMessageId };
  }

  async update(
    record: FacilityRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateFacilityOutcome> {
    const key = rowKey(record.tenantId, record.facilityId);
    const existing = this.rows.get(key);
    if (existing === undefined) {
      return { outcome: 'not_found' };
    }
    const outboxMessageId = await this.outbox.enqueue(outbox);
    // Only mutable columns change; immutable columns are preserved from the existing row.
    const next: FacilityRecord = {
      tenantId: existing.tenantId,
      facilityId: existing.facilityId,
      organizationId: existing.organizationId,
      facilityType: existing.facilityType,
      createdAt: existing.createdAt,
      name: record.name,
      status: record.status,
      updatedAt: record.updatedAt,
      ...(record.addressLine1 !== undefined ? { addressLine1: record.addressLine1 } : {}),
      ...(record.addressLine2 !== undefined ? { addressLine2: record.addressLine2 } : {}),
      ...(record.locality !== undefined ? { locality: record.locality } : {}),
      ...(record.region !== undefined ? { region: record.region } : {}),
      ...(record.postalCode !== undefined ? { postalCode: record.postalCode } : {}),
      ...(record.countryCode !== undefined ? { countryCode: record.countryCode } : {}),
      ...(record.latitude !== undefined ? { latitude: record.latitude } : {}),
      ...(record.longitude !== undefined ? { longitude: record.longitude } : {}),
      ...(record.contactName !== undefined ? { contactName: record.contactName } : {}),
      ...(record.contactEmail !== undefined ? { contactEmail: record.contactEmail } : {}),
      ...(record.contactPhone !== undefined ? { contactPhone: record.contactPhone } : {}),
      ...(record.visibility !== undefined ? { visibility: record.visibility } : {}),
      ...(record.capabilityTags !== undefined ? { capabilityTags: [...record.capabilityTags] } : {}),
    };
    this.rows.set(key, next);
    return { outcome: 'updated', view: clone(next), outboxMessageId };
  }

  async getById(tenantId: string, facilityId: string): Promise<FacilityView | undefined> {
    const existing = this.rows.get(rowKey(tenantId, facilityId));
    return existing !== undefined ? clone(existing) : undefined;
  }

  async list(tenantId: string, filter: FacilityListFilter): Promise<FacilityListResult> {
    const limit = clampFacilityListLimit(filter.limit);
    const matched = [...this.rows.values()]
      .filter((r) => r.tenantId === tenantId)
      .filter((r) =>
        filter.organizationId !== undefined ? r.organizationId === filter.organizationId : true,
      )
      .filter((r) => (filter.facilityType !== undefined ? r.facilityType === filter.facilityType : true))
      .filter((r) => (filter.status !== undefined ? r.status === filter.status : true))
      .filter((r) => (filter.cursor !== undefined ? afterCursor(r, filter.cursor) : true))
      .sort(compareRows);

    const page = matched.slice(0, limit);
    const items = page.map(clone);
    const result: { items: FacilityView[]; nextCursor?: FacilityListCursor } = { items };
    if (matched.length > limit && page.length > 0) {
      const last = page[page.length - 1]!;
      result.nextCursor = { createdAt: last.createdAt, id: last.facilityId };
    }
    return result;
  }

  /** Test/local read helper. Returns defensive copies. */
  listAll(): readonly FacilityView[] {
    return [...this.rows.values()].map(clone);
  }
}
