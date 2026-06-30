/**
 * Organization Registry store port + outbox builders.
 *
 * Stores are THIN and tenant-scoped: they persist the canonical row and ENQUEUE the matching
 * outbox message in the SAME unit of work (so a created/updated/status-changed signal is never
 * lost or duplicated). All business rules (enum validation, parent existence, cycle detection,
 * source-reference rules) live in {@link OrganizationRegistryService}; stores only persist and
 * report a deterministic outcome.
 *
 * Idempotency: create is idempotent on (tenantId, organizationId) — a repeat returns the existing
 * row as a `conflict` outcome and enqueues nothing new. Outbox dedupe keys are stable per signal.
 */

import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
import {
  ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE,
  ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
  ORGANIZATION_REGISTRY_UPDATED_MESSAGE_TYPE,
  type OrganizationListFilter,
  type OrganizationListResult,
  type OrganizationRecord,
  type OrganizationRegistryCreatedPayload,
  type OrganizationRegistryStatusChangedPayload,
  type OrganizationRegistryUpdatedPayload,
  type OrganizationView,
} from './OrganizationTypes.js';

/** Default outbox retry budget for registry signals (mirrors the platform default). */
export const ORGANIZATION_OUTBOX_MAX_RETRIES = 10;

/** Outcome of a create attempt. `conflict` carries the pre-existing row (idempotent replay). */
export type CreateOrganizationOutcome =
  | { readonly outcome: 'created'; readonly view: OrganizationView; readonly outboxMessageId: string }
  | { readonly outcome: 'conflict'; readonly view: OrganizationView };

/** Outcome of an update attempt. */
export type UpdateOrganizationOutcome =
  | { readonly outcome: 'updated'; readonly view: OrganizationView; readonly outboxMessageId: string }
  | { readonly outcome: 'not_found' };

/**
 * Tenant-scoped persistence + outbox port for organizations.
 *
 * RLS NOTE: the Pg implementation sets `app.tenant_id` inside each transaction before touching
 * `organization_registry.organization`, so cross-tenant rows are invisible — a parent id from a
 * different tenant simply does not resolve.
 */
export interface OrganizationRegistryStore {
  /** Atomically persist a new organization and enqueue its created signal. Idempotent on (tenant, id). */
  create(record: OrganizationRecord, outbox: OutboxEnqueueInput): Promise<CreateOrganizationOutcome>;

  /**
   * Atomically overwrite the MUTABLE columns (displayName, legalName, parentOrganizationId,
   * status, updatedAt) of an existing organization and enqueue the supplied signal. Immutable
   * columns on `record` are ignored by the store; the service is responsible for preserving them.
   */
  update(record: OrganizationRecord, outbox: OutboxEnqueueInput): Promise<UpdateOrganizationOutcome>;

  /** Tenant-scoped single read. Returns undefined when absent (or owned by another tenant). */
  getById(tenantId: string, organizationId: string): Promise<OrganizationView | undefined>;

  /** Tenant-scoped, keyset-paginated list. */
  list(tenantId: string, filter: OrganizationListFilter): Promise<OrganizationListResult>;
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

/** Stable created-signal dedupe key. */
export function organizationCreatedDedupeKey(organizationId: string): string {
  return `${ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE}:${organizationId}`;
}

/** Stable updated-signal dedupe key (monotonic via updatedAt so repeated edits each emit once). */
export function organizationUpdatedDedupeKey(organizationId: string, updatedAt: string): string {
  return `${ORGANIZATION_REGISTRY_UPDATED_MESSAGE_TYPE}:${organizationId}:${updatedAt}`;
}

/** Stable status-changed dedupe key (idempotent per target status + timestamp). */
export function organizationStatusChangedDedupeKey(
  organizationId: string,
  newStatus: string,
  updatedAt: string,
): string {
  return `${ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE}:${organizationId}:${newStatus}:${updatedAt}`;
}

export interface OutboxCorrelation {
  readonly correlationId?: string;
  readonly causationId?: string;
}

/** Build the sanitized created-signal outbox input. */
export function buildOrganizationCreatedOutbox(
  record: OrganizationRecord,
  meta: { readonly actorUserId?: string; readonly requestId?: string } & OutboxCorrelation,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      organizationId: record.organizationId,
      tenantId: record.tenantId,
      organizationType: record.organizationType,
      status: record.status,
      source: record.source,
    },
    {
      parentOrganizationId: record.parentOrganizationId,
      sourceEntityType: record.sourceEntityType,
      sourceEntityId: record.sourceEntityId,
      actorUserId: meta.actorUserId,
      requestId: meta.requestId,
      correlationId: meta.correlationId,
    },
  ) as unknown as OrganizationRegistryCreatedPayload;
  return {
    tenantId: record.tenantId,
    messageType: ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: organizationCreatedDedupeKey(record.organizationId),
    maxRetries: ORGANIZATION_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}

/** Build the sanitized updated-signal outbox input. */
export function buildOrganizationUpdatedOutbox(
  record: OrganizationRecord,
  meta: { readonly actorUserId?: string; readonly requestId?: string } & OutboxCorrelation,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      organizationId: record.organizationId,
      tenantId: record.tenantId,
      organizationType: record.organizationType,
      status: record.status,
    },
    {
      parentOrganizationId: record.parentOrganizationId,
      actorUserId: meta.actorUserId,
      requestId: meta.requestId,
      correlationId: meta.correlationId,
    },
  ) as unknown as OrganizationRegistryUpdatedPayload;
  return {
    tenantId: record.tenantId,
    messageType: ORGANIZATION_REGISTRY_UPDATED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: organizationUpdatedDedupeKey(record.organizationId, record.updatedAt),
    maxRetries: ORGANIZATION_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}

/** Build the sanitized status-changed-signal outbox input. */
export function buildOrganizationStatusChangedOutbox(
  record: OrganizationRecord,
  previousStatus: string,
  meta: { readonly actorUserId?: string; readonly requestId?: string } & OutboxCorrelation,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      organizationId: record.organizationId,
      tenantId: record.tenantId,
      organizationType: record.organizationType,
      previousStatus,
      newStatus: record.status,
    },
    {
      actorUserId: meta.actorUserId,
      requestId: meta.requestId,
      correlationId: meta.correlationId,
    },
  ) as unknown as OrganizationRegistryStatusChangedPayload;
  return {
    tenantId: record.tenantId,
    messageType: ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: organizationStatusChangedDedupeKey(record.organizationId, record.status, record.updatedAt),
    maxRetries: ORGANIZATION_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}
