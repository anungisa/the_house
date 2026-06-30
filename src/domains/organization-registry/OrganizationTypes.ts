/**
 * Organization Registry domain types.
 *
 * The Organization Registry models tenant-scoped ORGANIZATIONS and their parent/child
 * hierarchy. It is REFERENCE/DOMAIN STRUCTURE, not a competing lifecycle engine: it never
 * approves affiliation applications, never activates an organization as a substitute for a
 * kernel-approved transition, never mutates governance.entity_state, and never calls the
 * Governance Kernel.
 *
 * NSO-GENERIC: every type/value here is sport-agnostic. National/regional/local/external/
 * applicant organizations only — no sport-specific club/league vocabulary.
 */

/**
 * The kind of organization in a tenant's hierarchy. Generic NSO tiers plus two unparented
 * kinds (external partners and applicant orgs that have not yet been affiliated).
 */
export type OrganizationType = 'national' | 'regional' | 'local' | 'external' | 'applicant';

/** All known organization types (used to fail closed on unknown input). */
export const ORGANIZATION_TYPES: readonly OrganizationType[] = [
  'national',
  'regional',
  'local',
  'external',
  'applicant',
];

/**
 * The operational status of a registry organization. This is REGISTRY reference status — it is
 * NOT a governed lifecycle FSM and carries no kernel semantics. Records are never deleted;
 * `suspended`/`archived` retain the row.
 */
export type OrganizationStatus = 'draft' | 'active' | 'suspended' | 'archived';

/** All known organization statuses (used to fail closed on unknown input). */
export const ORGANIZATION_STATUSES: readonly OrganizationStatus[] = [
  'draft',
  'active',
  'suspended',
  'archived',
];

/**
 * Where a registry record originated. `affiliation_application` marks an organization that was
 * registered as a controlled projection of an APPROVED affiliation application (see the
 * registry service's registration seam) — it is NOT a parallel approval path.
 */
export type OrganizationSource = 'manual' | 'affiliation_application' | 'import' | 'system';

/** All known organization sources (used to fail closed on unknown input). */
export const ORGANIZATION_SOURCES: readonly OrganizationSource[] = [
  'manual',
  'affiliation_application',
  'import',
  'system',
];

/**
 * A canonical, tenant-scoped organization record. `organizationId` is unique per tenant.
 * Immutable-after-create fields: `organizationType`, `source`, `sourceEntityType`,
 * `sourceEntityId`, `createdAt`. Mutable via the service: `displayName`, `legalName`,
 * `parentOrganizationId`, `status`, `updatedAt`.
 */
export interface OrganizationRecord {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly organizationType: OrganizationType;
  readonly displayName: string;
  readonly legalName?: string;
  readonly status: OrganizationStatus;
  readonly parentOrganizationId?: string;
  readonly source: OrganizationSource;
  readonly sourceEntityType?: string;
  readonly sourceEntityId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Read-only projection returned by reads. Identical shape to {@link OrganizationRecord}. */
export type OrganizationView = OrganizationRecord;

/** Keyset cursor for stable list pagination (createdAt, then id as a tiebreaker). */
export interface OrganizationListCursor {
  readonly createdAt: string;
  readonly id: string;
}

/** Tenant-scoped list filter. All predicates are optional and ANDed. */
export interface OrganizationListFilter {
  readonly organizationType?: OrganizationType;
  readonly status?: OrganizationStatus;
  readonly parentOrganizationId?: string;
  readonly limit?: number;
  readonly cursor?: OrganizationListCursor;
}

/** A single page of organizations with an optional continuation cursor. */
export interface OrganizationListResult {
  readonly items: readonly OrganizationView[];
  readonly nextCursor?: OrganizationListCursor;
}

export const ORGANIZATION_LIST_DEFAULT_LIMIT = 50;
export const ORGANIZATION_LIST_MAX_LIMIT = 200;

// --- Outbox message types (stable platform contract; NSO-generic) ---------------------------

export const ORGANIZATION_REGISTRY_CREATED_MESSAGE_TYPE = 'organization.registry.created';
export const ORGANIZATION_REGISTRY_UPDATED_MESSAGE_TYPE = 'organization.registry.updated';
export const ORGANIZATION_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE =
  'organization.registry.status_changed';

/**
 * Sanitized payload emitted when an organization is created. Carries routing/identity metadata
 * only — NEVER secrets, raw headers, or payload bytes. Display/legal names are intentionally
 * omitted (downstream consumers read the registry by id).
 */
export interface OrganizationRegistryCreatedPayload {
  readonly organizationId: string;
  readonly tenantId: string;
  readonly organizationType: OrganizationType;
  readonly status: OrganizationStatus;
  readonly source: OrganizationSource;
  readonly parentOrganizationId?: string;
  readonly sourceEntityType?: string;
  readonly sourceEntityId?: string;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Sanitized payload emitted when an organization's mutable attributes change. */
export interface OrganizationRegistryUpdatedPayload {
  readonly organizationId: string;
  readonly tenantId: string;
  readonly organizationType: OrganizationType;
  readonly status: OrganizationStatus;
  readonly parentOrganizationId?: string;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Sanitized payload emitted when an organization's status changes. */
export interface OrganizationRegistryStatusChangedPayload {
  readonly organizationId: string;
  readonly tenantId: string;
  readonly organizationType: OrganizationType;
  readonly previousStatus: OrganizationStatus;
  readonly newStatus: OrganizationStatus;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

// --- Type guards ----------------------------------------------------------------------------

export function isOrganizationType(value: unknown): value is OrganizationType {
  return typeof value === 'string' && ORGANIZATION_TYPES.includes(value as OrganizationType);
}

export function isOrganizationStatus(value: unknown): value is OrganizationStatus {
  return typeof value === 'string' && ORGANIZATION_STATUSES.includes(value as OrganizationStatus);
}

export function isOrganizationSource(value: unknown): value is OrganizationSource {
  return typeof value === 'string' && ORGANIZATION_SOURCES.includes(value as OrganizationSource);
}

/** Clamp a requested page size into the allowed range. */
export function clampOrganizationListLimit(limit: number | undefined): number {
  if (limit === undefined) return ORGANIZATION_LIST_DEFAULT_LIMIT;
  if (limit < 1) return 1;
  return Math.min(limit, ORGANIZATION_LIST_MAX_LIMIT);
}
