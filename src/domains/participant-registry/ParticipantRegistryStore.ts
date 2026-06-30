/**
 * Participant Registry store port + org reader port + outbox builders.
 *
 * Stores are THIN and tenant-scoped: they persist the canonical row and ENQUEUE the matching
 * outbox message in the SAME unit of work (so a created/updated/status-changed/linked signal is
 * never lost or duplicated). All business rules (enum/email validation, organization existence,
 * archived-participant rules) live in {@link ParticipantRegistryService}; stores only persist and
 * report a deterministic outcome.
 *
 * Idempotency: create is idempotent on (tenantId, participantId) and (tenantId, relationshipId).
 * A repeat returns the existing row as a `conflict` outcome and enqueues nothing new. Outbox
 * dedupe keys are stable per signal.
 *
 * Organization dependency: the registry depends on the Organization Registry as READ/REFERENCE
 * only via {@link OrganizationReader}. It NEVER mutates organizations.
 */

import type { OutboxEnqueueInput } from '../../governance/outbox/OutboxStore.js';
import {
  PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
  PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE,
  type OrganizationParticipantListFilter,
  type OrganizationParticipantListResult,
  type OrganizationParticipantRecord,
  type OrganizationParticipantView,
  type ParticipantListFilter,
  type ParticipantListResult,
  type ParticipantRecord,
  type ParticipantRegistryCreatedPayload,
  type ParticipantRegistryOrganizationLinkedPayload,
  type ParticipantRegistryOrganizationLinkStatusChangedPayload,
  type ParticipantRegistryStatusChangedPayload,
  type ParticipantRegistryUpdatedPayload,
  type ParticipantView,
  type RelationshipType,
} from './ParticipantTypes.js';

/** Default outbox retry budget for registry signals (mirrors the platform default). */
export const PARTICIPANT_OUTBOX_MAX_RETRIES = 10;

/**
 * Narrow READ-ONLY view over the Organization Registry. The participant registry uses this only
 * to confirm that a referenced organization exists for the SAME tenant before recording a
 * relationship. It NEVER mutates organizations. Both Organization Registry store implementations
 * satisfy this structurally via their tenant-scoped `getById`.
 */
export interface OrganizationReader {
  getById(tenantId: string, organizationId: string): Promise<{ readonly organizationId: string } | undefined>;
}

/** Outcome of a participant create attempt. `conflict` carries the pre-existing row. */
export type CreateParticipantOutcome =
  | { readonly outcome: 'created'; readonly view: ParticipantView; readonly outboxMessageId: string }
  | { readonly outcome: 'conflict'; readonly view: ParticipantView };

/** Outcome of a participant update attempt. */
export type UpdateParticipantOutcome =
  | { readonly outcome: 'updated'; readonly view: ParticipantView; readonly outboxMessageId: string }
  | { readonly outcome: 'not_found' };

/** Outcome of an organization-link create attempt. `conflict` carries the pre-existing row. */
export type CreateOrganizationLinkOutcome =
  | {
      readonly outcome: 'created';
      readonly view: OrganizationParticipantView;
      readonly outboxMessageId: string;
    }
  | { readonly outcome: 'conflict'; readonly view: OrganizationParticipantView };

/** Outcome of an organization-link update attempt. */
export type UpdateOrganizationLinkOutcome =
  | {
      readonly outcome: 'updated';
      readonly view: OrganizationParticipantView;
      readonly outboxMessageId: string;
    }
  | { readonly outcome: 'not_found' };

/**
 * Tenant-scoped persistence + outbox port for participants and their organization relationships.
 *
 * RLS NOTE: the Pg implementation sets `app.tenant_id` inside each transaction before touching
 * `participant_registry.*`, so cross-tenant rows are invisible.
 */
export interface ParticipantRegistryStore {
  /** Atomically persist a new participant and enqueue its created signal. Idempotent on (tenant, id). */
  createParticipant(
    record: ParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateParticipantOutcome>;

  /**
   * Atomically overwrite the MUTABLE columns (displayName, givenName, familyName, email, status,
   * externalRefs, updatedAt) of an existing participant and enqueue the supplied signal.
   * Immutable columns on `record` are ignored by the store.
   */
  updateParticipant(
    record: ParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateParticipantOutcome>;

  /** Tenant-scoped single read. Returns undefined when absent (or owned by another tenant). */
  getParticipantById(tenantId: string, participantId: string): Promise<ParticipantView | undefined>;

  /** Tenant-scoped, keyset-paginated participant list. */
  listParticipants(tenantId: string, filter: ParticipantListFilter): Promise<ParticipantListResult>;

  /** Atomically persist a new relationship and enqueue its linked signal. Idempotent on (tenant, id). */
  createOrganizationLink(
    record: OrganizationParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<CreateOrganizationLinkOutcome>;

  /**
   * Atomically overwrite the MUTABLE columns (status, startDate, endDate, updatedAt) of an
   * existing relationship and enqueue the supplied signal. Immutable columns are ignored.
   */
  updateOrganizationLink(
    record: OrganizationParticipantRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<UpdateOrganizationLinkOutcome>;

  /** Tenant-scoped single read by relationship id. */
  getOrganizationLinkById(
    tenantId: string,
    relationshipId: string,
  ): Promise<OrganizationParticipantView | undefined>;

  /**
   * Find an existing NON-ended relationship of the given type between an organization and a
   * participant (used to keep linking idempotent). Returns undefined when none is active.
   */
  findActiveOrganizationLink(
    tenantId: string,
    organizationId: string,
    participantId: string,
    relationshipType: RelationshipType,
  ): Promise<OrganizationParticipantView | undefined>;

  /** Tenant-scoped, keyset-paginated relationship list. */
  listOrganizationParticipants(
    tenantId: string,
    filter: OrganizationParticipantListFilter,
  ): Promise<OrganizationParticipantListResult>;
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

/** Stable participant-created dedupe key. */
export function participantCreatedDedupeKey(participantId: string): string {
  return `${PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE}:${participantId}`;
}

/** Stable participant-updated dedupe key (monotonic via updatedAt). */
export function participantUpdatedDedupeKey(participantId: string, updatedAt: string): string {
  return `${PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE}:${participantId}:${updatedAt}`;
}

/** Stable participant status-changed dedupe key. */
export function participantStatusChangedDedupeKey(
  participantId: string,
  newStatus: string,
  updatedAt: string,
): string {
  return `${PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE}:${participantId}:${newStatus}:${updatedAt}`;
}

/** Stable organization-linked dedupe key. */
export function organizationLinkedDedupeKey(relationshipId: string): string {
  return `${PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE}:${relationshipId}`;
}

/** Stable organization-link status-changed dedupe key. */
export function organizationLinkStatusChangedDedupeKey(
  relationshipId: string,
  newStatus: string,
  updatedAt: string,
): string {
  return `${PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE}:${relationshipId}:${newStatus}:${updatedAt}`;
}

// --- Outbox builders (sanitized payloads; NEVER names, email, secrets, or bytes) -------------

/** Build the sanitized participant-created outbox input. */
export function buildParticipantCreatedOutbox(
  record: ParticipantRecord,
  meta: OutboxMeta,
): OutboxEnqueueInput {
  const payload = withOptional(
    { participantId: record.participantId, tenantId: record.tenantId, status: record.status },
    { actorUserId: meta.actorUserId, requestId: meta.requestId, correlationId: meta.correlationId },
  ) as unknown as ParticipantRegistryCreatedPayload;
  return {
    tenantId: record.tenantId,
    messageType: PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: participantCreatedDedupeKey(record.participantId),
    maxRetries: PARTICIPANT_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}

/** Build the sanitized participant-updated outbox input. */
export function buildParticipantUpdatedOutbox(
  record: ParticipantRecord,
  meta: OutboxMeta,
): OutboxEnqueueInput {
  const payload = withOptional(
    { participantId: record.participantId, tenantId: record.tenantId, status: record.status },
    { actorUserId: meta.actorUserId, requestId: meta.requestId, correlationId: meta.correlationId },
  ) as unknown as ParticipantRegistryUpdatedPayload;
  return {
    tenantId: record.tenantId,
    messageType: PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: participantUpdatedDedupeKey(record.participantId, record.updatedAt),
    maxRetries: PARTICIPANT_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}

/** Build the sanitized participant status-changed outbox input. */
export function buildParticipantStatusChangedOutbox(
  record: ParticipantRecord,
  previousStatus: string,
  meta: OutboxMeta,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      participantId: record.participantId,
      tenantId: record.tenantId,
      previousStatus,
      newStatus: record.status,
    },
    { actorUserId: meta.actorUserId, requestId: meta.requestId, correlationId: meta.correlationId },
  ) as unknown as ParticipantRegistryStatusChangedPayload;
  return {
    tenantId: record.tenantId,
    messageType: PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: participantStatusChangedDedupeKey(record.participantId, record.status, record.updatedAt),
    maxRetries: PARTICIPANT_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}

/** Build the sanitized organization-linked outbox input. */
export function buildOrganizationLinkedOutbox(
  record: OrganizationParticipantRecord,
  meta: OutboxMeta,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      relationshipId: record.relationshipId,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
      participantId: record.participantId,
      relationshipType: record.relationshipType,
      status: record.status,
    },
    { actorUserId: meta.actorUserId, requestId: meta.requestId, correlationId: meta.correlationId },
  ) as unknown as ParticipantRegistryOrganizationLinkedPayload;
  return {
    tenantId: record.tenantId,
    messageType: PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: organizationLinkedDedupeKey(record.relationshipId),
    maxRetries: PARTICIPANT_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}

/** Build the sanitized organization-link status-changed outbox input. */
export function buildOrganizationLinkStatusChangedOutbox(
  record: OrganizationParticipantRecord,
  previousStatus: string,
  meta: OutboxMeta,
): OutboxEnqueueInput {
  const payload = withOptional(
    {
      relationshipId: record.relationshipId,
      tenantId: record.tenantId,
      organizationId: record.organizationId,
      participantId: record.participantId,
      relationshipType: record.relationshipType,
      previousStatus,
      newStatus: record.status,
    },
    { actorUserId: meta.actorUserId, requestId: meta.requestId, correlationId: meta.correlationId },
  ) as unknown as ParticipantRegistryOrganizationLinkStatusChangedPayload;
  return {
    tenantId: record.tenantId,
    messageType: PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE,
    payload: payload as unknown as Readonly<Record<string, unknown>>,
    dedupeKey: organizationLinkStatusChangedDedupeKey(
      record.relationshipId,
      record.status,
      record.updatedAt,
    ),
    maxRetries: PARTICIPANT_OUTBOX_MAX_RETRIES,
    ...(meta.correlationId !== undefined ? { correlationId: meta.correlationId } : {}),
    ...(meta.causationId !== undefined ? { causationId: meta.causationId } : {}),
  };
}
