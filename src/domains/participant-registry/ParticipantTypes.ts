/**
 * Participant Registry domain types.
 *
 * The Participant Registry models tenant-scoped PEOPLE (participants/members) and their
 * relationships to organizations in the Organization Registry. It is REFERENCE/DOMAIN
 * STRUCTURE, not a competing lifecycle engine: it never approves anything, never mutates
 * governance.entity_state, and never calls the Governance Kernel. It depends on the
 * Organization Registry as READ/REFERENCE only — it never mutates organizations.
 *
 * NSO-GENERIC: every type/value here is sport-agnostic. There is no registration, payment,
 * program enrollment, event participation, eligibility, or sport-specific vocabulary. Records
 * hold only the minimal identifying fields required to model a participant and its
 * organizational relationships. No demographic, medical, financial, or otherwise sensitive
 * attributes are modeled.
 */

/**
 * The operational status of a participant. This is REGISTRY reference status — it is NOT a
 * governed lifecycle FSM and carries no kernel semantics. Records are never deleted;
 * `suspended`/`archived` retain the row.
 */
export type ParticipantStatus = 'draft' | 'active' | 'suspended' | 'archived';

/** All known participant statuses (used to fail closed on unknown input). */
export const PARTICIPANT_STATUSES: readonly ParticipantStatus[] = [
  'draft',
  'active',
  'suspended',
  'archived',
];

/**
 * The kind of relationship a participant has to an organization. Generic NSO relationship
 * categories only — no sport-specific roles.
 */
export type RelationshipType =
  | 'member'
  | 'staff'
  | 'volunteer'
  | 'official'
  | 'contact'
  | 'other';

/** All known relationship types (used to fail closed on unknown input). */
export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  'member',
  'staff',
  'volunteer',
  'official',
  'contact',
  'other',
];

/**
 * The status of an organization-participant relationship. `ended` retires a relationship
 * without deleting it (the row is retained for history); a new relationship of the same type
 * can then be created.
 */
export type RelationshipStatus = 'active' | 'suspended' | 'ended';

/** All known relationship statuses (used to fail closed on unknown input). */
export const RELATIONSHIP_STATUSES: readonly RelationshipStatus[] = [
  'active',
  'suspended',
  'ended',
];

/**
 * A reference to a participant in an external system. This is a narrow, generic correlation
 * handle (provider + opaque external id) — NOT an identity-provider account link, federation
 * credential, or any sensitive attribute. `(provider, externalId)` pairs are unique within a
 * single participant record.
 */
export interface ParticipantExternalRef {
  readonly provider: string;
  readonly externalId: string;
}

/**
 * A canonical, tenant-scoped participant record. `participantId` is unique per tenant.
 * Immutable-after-create fields: `createdAt`. Mutable via the service: `displayName`,
 * `givenName`, `familyName`, `email`, `status`, `externalRefs`, `updatedAt`.
 */
export interface ParticipantRecord {
  readonly tenantId: string;
  readonly participantId: string;
  readonly displayName: string;
  readonly givenName?: string;
  readonly familyName?: string;
  /** Normalized (trimmed + lowercased) contact email. NEVER projected into outbox signals. */
  readonly email?: string;
  readonly status: ParticipantStatus;
  readonly externalRefs?: readonly ParticipantExternalRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Read-only projection returned by reads. Identical shape to {@link ParticipantRecord}. */
export type ParticipantView = ParticipantRecord;

/**
 * A canonical, tenant-scoped relationship between an organization and a participant.
 * `relationshipId` is unique per tenant. Immutable-after-create fields: `organizationId`,
 * `participantId`, `relationshipType`, `createdAt`. Mutable via the service: `status`,
 * `startDate`, `endDate`, `updatedAt`.
 */
export interface OrganizationParticipantRecord {
  readonly tenantId: string;
  readonly relationshipId: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly relationshipType: RelationshipType;
  readonly status: RelationshipStatus;
  /** Optional ISO date (YYYY-MM-DD) the relationship began. */
  readonly startDate?: string;
  /** Optional ISO date (YYYY-MM-DD) the relationship ended. */
  readonly endDate?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Read-only projection. Identical shape to {@link OrganizationParticipantRecord}. */
export type OrganizationParticipantView = OrganizationParticipantRecord;

/** Keyset cursor for stable list pagination (createdAt, then id as a tiebreaker). */
export interface ParticipantListCursor {
  readonly createdAt: string;
  readonly id: string;
}

/** Tenant-scoped participant list filter. All predicates are optional and ANDed. */
export interface ParticipantListFilter {
  readonly status?: ParticipantStatus;
  /** Normalized (trimmed + lowercased) email to match exactly. */
  readonly email?: string;
  readonly limit?: number;
  readonly cursor?: ParticipantListCursor;
}

/** A single page of participants with an optional continuation cursor. */
export interface ParticipantListResult {
  readonly items: readonly ParticipantView[];
  readonly nextCursor?: ParticipantListCursor;
}

/** Tenant-scoped organization-participant list filter. All predicates optional and ANDed. */
export interface OrganizationParticipantListFilter {
  readonly organizationId?: string;
  readonly participantId?: string;
  readonly relationshipType?: RelationshipType;
  readonly status?: RelationshipStatus;
  readonly limit?: number;
  readonly cursor?: ParticipantListCursor;
}

/** A single page of organization-participant relationships with an optional continuation cursor. */
export interface OrganizationParticipantListResult {
  readonly items: readonly OrganizationParticipantView[];
  readonly nextCursor?: ParticipantListCursor;
}

export const PARTICIPANT_LIST_DEFAULT_LIMIT = 50;
export const PARTICIPANT_LIST_MAX_LIMIT = 200;

// --- Outbox message types (stable platform contract; NSO-generic) ---------------------------

export const PARTICIPANT_REGISTRY_CREATED_MESSAGE_TYPE = 'participant.registry.created';
export const PARTICIPANT_REGISTRY_UPDATED_MESSAGE_TYPE = 'participant.registry.updated';
export const PARTICIPANT_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE =
  'participant.registry.status_changed';
export const PARTICIPANT_REGISTRY_ORGANIZATION_LINKED_MESSAGE_TYPE =
  'participant.registry.organization_linked';
export const PARTICIPANT_REGISTRY_ORGANIZATION_LINK_STATUS_CHANGED_MESSAGE_TYPE =
  'participant.registry.organization_link_status_changed';

/**
 * Sanitized payload emitted when a participant is created. Carries routing/identity metadata
 * only — NEVER names, email, secrets, raw headers, or payload bytes. Human-readable fields and
 * contact email are intentionally omitted (downstream consumers read the registry by id).
 */
export interface ParticipantRegistryCreatedPayload {
  readonly participantId: string;
  readonly tenantId: string;
  readonly status: ParticipantStatus;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Sanitized payload emitted when a participant's mutable attributes change. */
export interface ParticipantRegistryUpdatedPayload {
  readonly participantId: string;
  readonly tenantId: string;
  readonly status: ParticipantStatus;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Sanitized payload emitted when a participant's status changes. */
export interface ParticipantRegistryStatusChangedPayload {
  readonly participantId: string;
  readonly tenantId: string;
  readonly previousStatus: ParticipantStatus;
  readonly newStatus: ParticipantStatus;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Sanitized payload emitted when a participant is linked to an organization. */
export interface ParticipantRegistryOrganizationLinkedPayload {
  readonly relationshipId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly relationshipType: RelationshipType;
  readonly status: RelationshipStatus;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Sanitized payload emitted when an organization-participant relationship status changes. */
export interface ParticipantRegistryOrganizationLinkStatusChangedPayload {
  readonly relationshipId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly relationshipType: RelationshipType;
  readonly previousStatus: RelationshipStatus;
  readonly newStatus: RelationshipStatus;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

// --- Type guards ----------------------------------------------------------------------------

export function isParticipantStatus(value: unknown): value is ParticipantStatus {
  return typeof value === 'string' && PARTICIPANT_STATUSES.includes(value as ParticipantStatus);
}

export function isRelationshipType(value: unknown): value is RelationshipType {
  return typeof value === 'string' && RELATIONSHIP_TYPES.includes(value as RelationshipType);
}

export function isRelationshipStatus(value: unknown): value is RelationshipStatus {
  return (
    typeof value === 'string' && RELATIONSHIP_STATUSES.includes(value as RelationshipStatus)
  );
}

/** Clamp a requested page size into the allowed range. */
export function clampParticipantListLimit(limit: number | undefined): number {
  if (limit === undefined) return PARTICIPANT_LIST_DEFAULT_LIMIT;
  if (limit < 1) return 1;
  return Math.min(limit, PARTICIPANT_LIST_MAX_LIMIT);
}
