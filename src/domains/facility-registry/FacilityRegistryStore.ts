/**
 * Facility Registry store port + org reader port + outbox builders.
 *
 * Stores are THIN and tenant-scoped: they persist the canonical row and ENQUEUE the matching
 * outbox message in the SAME unit of work (so a created/updated/status-changed signal is never
 * lost or duplicated). All business rules (enum validation, organization existence) live in
 * {@link FacilityRegistryService}; stores only persist and report a deterministic outcome.
 *
 * Idempotency: create is idempotent on (tenantId, facilityId). A repeat returns the existing row
 * as a `conflict` outcome and enqueues nothing new. Outbox dedupe keys are stable per signal.
 *
 * Organization dependency: the registry depends on the Organization Registry as READ/REFERENCE
 * only via {@link OrganizationReader}. It NEVER mutates organizations.
 */

import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
import {
  FACILITY_REGISTRY_CREATED_MESSAGE_TYPE,
  FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
  FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE,
  type FacilityListFilter,
  type FacilityListResult,
  type FacilityRecord,
  type FacilityRegistryCreatedPayload,
  type FacilityRegistryStatusChangedPayload,
  type FacilityRegistryUpdatedPayload,
  type FacilityView,
} from './FacilityTypes.js';

/** Default outbox retry budget for registry signals (mirrors the platform default). */
export const FACILITY_OUTBOX_MAX_RETRIES = 10;

/**
 * Narrow READ-ONLY view over the Organization Registry. The facility registry uses this only to
 * confirm that a referenced organization exists for the SAME tenant before persisting a facility.
 * It NEVER mutates organizations. Both Organization Registry store implementations satisfy this
 * structurally via their tenant-scoped `getById`.
 */
export interface OrganizationReader {
  getById(
    tenantId: string,
    organizationId: string,
  ): Promise<{ readonly organizationId: string } | undefined>;
}

/** Outcome of a facility create attempt. `conflict` carries the pre-existing row (idempotent replay). */
export type CreateFacilityOutcome =
  | { readonly outcome: 'created'; readonly view: FacilityView; readonly outboxMessageId: string }
  | { readonly outcome: 'conflict'; readonly view: FacilityView };

/** Outcome of a facility update attempt. */
export type UpdateFacilityOutcome =
  | { readonly outcome: 'updated'; readonly view: FacilityView; readonly outboxMessageId: string }
  | { readonly outcome: 'not_found' };

/**
 * Tenant-scoped persistence + outbox port for facilities.
 *
 * RLS NOTE: the Pg implementation sets `app.tenant_id` inside each transaction before touching
 * `facility_registry.facility`, so cross-tenant rows are invisible.
 */
export interface FacilityRegistryStore {
  /** Atomically persist a new facility and enqueue its created signal. Idempotent on (tenant, id). */
  create(record: FacilityRecord, outbox: OutboxEnqueueInput): Promise<CreateFacilityOutcome>;

  /**
   * Atomically overwrite the MUTABLE columns (name, status, address fields, coordinates, contact
   * fields, visibility, capabilityTags, updatedAt) of an existing facility and enqueue the supplied
   * signal. Immutable columns on `record` (organizationId, facilityType, createdAt) are ignored by
   * the store; the service is responsible for preserving them.
   */
  update(record: FacilityRecord, outbox: OutboxEnqueueInput): Promise<UpdateFacilityOutcome>;

  /** Tenant-scoped single read. Returns undefined when absent (or owned by another tenant). */
  getById(tenantId: string, facilityId: string): Promise<FacilityView | undefined>;

  /** Tenant-scoped, keyset-paginated list. */
  list(tenantId: string, filter: FacilityListFilter): Promise<FacilityListResult>;
}

function withOptional(
  base: Record<string, unknown>,
  extra: Record<string, string | undefined>,
): Record<string, unknown> {
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) base[key] = value;
  }
  return base;
}

export interface OutboxCorrelation {
  readonly correlationId?: string;
  readonly causationId?: string;
}

type OutboxMeta = { readonly actorUserId?: string; readonly requestId?: string } & OutboxCorrelation;

// --- Dedupe keys ----------------------------------------------------------------------------

/** Stable facility-created dedupe key. */
export function facilityCreatedDedupeKey(facilityId: string): string {
  return `${FACILITY_REGISTRY_CREATED_MESSAGE_TYPE}:${facilityId}`;
}

/** Stable facility-updated dedupe key (monotonic via updatedAt so repeated edits each emit once). */
export function facilityUpdatedDedupeKey(facilityId: string, updatedAt: string): string {
  return `${FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE}:${facilityId}:${updatedAt}`;
}

/** Stable facility status-changed dedupe key (idempotent per target status + timestamp). */
export function facilityStatusChangedDedupeKey(
  facilityId: string,
  newStatus: string,
  updatedAt: string,
): string {
  return `${FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE}:${facilityId}:${newStatus}:${updatedAt}`;
}

// --- Outbox builders (sanitized payloads; NEVER name, address, contact, coordinates, or bytes) ---

/** Build the sanitized facility-created outbox input. */
export function buildFacilityCreatedOutbox(
  record: FacilityRecord,
  meta: OutboxMeta,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      facilityId: record.facilityId,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
      facilityType: record.facilityType,
      status: record.status,
    },
    {
      visibility: record.visibility,
      actorUserId: meta.actorUserId,
      requestId: meta.requestId,
      correlationId: meta.correlationId,
    },
  ) as unknown as FacilityRegistryCreatedPayload;
  return {
    tenantId: record.tenantId,
    messageType: FACILITY_REGISTRY_CREATED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: facilityCreatedDedupeKey(record.facilityId),
    maxRetries: FACILITY_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}

/** Build the sanitized facility-updated outbox input. */
export function buildFacilityUpdatedOutbox(
  record: FacilityRecord,
  meta: OutboxMeta,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      facilityId: record.facilityId,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
      facilityType: record.facilityType,
      status: record.status,
    },
    {
      visibility: record.visibility,
      actorUserId: meta.actorUserId,
      requestId: meta.requestId,
      correlationId: meta.correlationId,
    },
  ) as unknown as FacilityRegistryUpdatedPayload;
  return {
    tenantId: record.tenantId,
    messageType: FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: facilityUpdatedDedupeKey(record.facilityId, record.updatedAt),
    maxRetries: FACILITY_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}

/** Build the sanitized facility status-changed outbox input. */
export function buildFacilityStatusChangedOutbox(
  record: FacilityRecord,
  previousStatus: string,
  meta: OutboxMeta,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      facilityId: record.facilityId,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
      facilityType: record.facilityType,
      previousStatus,
      newStatus: record.status,
    },
    {
      visibility: record.visibility,
      actorUserId: meta.actorUserId,
      requestId: meta.requestId,
      correlationId: meta.correlationId,
    },
  ) as unknown as FacilityRegistryStatusChangedPayload;
  return {
    tenantId: record.tenantId,
    messageType: FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: facilityStatusChangedDedupeKey(record.facilityId, record.status, record.updatedAt),
    maxRetries: FACILITY_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}
