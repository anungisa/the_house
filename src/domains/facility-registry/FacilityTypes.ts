/**
 * Facility Registry domain types.
 *
 * The Facility Registry models tenant-scoped PLACES (facilities/sites) that belong to an
 * organization in the Organization Registry. It is REFERENCE/DOMAIN STRUCTURE, not a competing
 * lifecycle engine: it never approves anything, never mutates governed lifecycle state, and never
 * calls the Governance Kernel. It depends on the Organization Registry as READ/REFERENCE only —
 * it never mutates organizations.
 *
 * NSO-GENERIC: every type/value here is sport-agnostic. No operational or transactional behavior is
 * modeled (see the architecture doc's out-of-scope section for the exhaustive list intentionally
 * excluded). Records hold only the minimal descriptive fields required to model a facility and its
 * location/contact reference data. No sport-specific place vocabulary is modeled.
 */

/**
 * The operational status of a facility. This is REGISTRY reference status — it is NOT a governed
 * lifecycle FSM and carries no kernel semantics. Records are never deleted; `inactive`/`archived`
 * retain the row.
 */
export type FacilityStatus = 'draft' | 'active' | 'inactive' | 'archived';

/** All known facility statuses (used to fail closed on unknown input). */
export const FACILITY_STATUSES: readonly FacilityStatus[] = [
  'draft',
  'active',
  'inactive',
  'archived',
];

/**
 * The kind of facility. Generic NSO place categories only — no sport-specific place vocabulary.
 * The type is immutable after creation.
 */
export type FacilityType =
  | 'venue'
  | 'training_site'
  | 'office'
  | 'storage_site'
  | 'partner_site'
  | 'other';

/** All known facility types (used to fail closed on unknown input). */
export const FACILITY_TYPES: readonly FacilityType[] = [
  'venue',
  'training_site',
  'office',
  'storage_site',
  'partner_site',
  'other',
];

/**
 * The visibility of a facility record. `internal` is the conservative default; `public` marks a
 * record whose existence may be surfaced to non-privileged experience layers. Visibility is
 * reference metadata only — it grants no access and enforces no policy.
 */
export type FacilityVisibility = 'internal' | 'public';

/** All known facility visibilities (used to fail closed on unknown input). */
export const FACILITY_VISIBILITIES: readonly FacilityVisibility[] = ['internal', 'public'];

/**
 * A canonical, tenant-scoped facility record. `facilityId` is unique per tenant. Immutable-after-
 * create fields: `organizationId`, `facilityType`, `createdAt`. Mutable via the service: `name`,
 * `status`, all address fields, `latitude`, `longitude`, all contact fields, `visibility`,
 * `capabilityTags`, `updatedAt`.
 */
export interface FacilityRecord {
  readonly tenantId: string;
  readonly facilityId: string;
  /** The owning organization (same tenant). Required — a facility is always org-owned in v1. */
  readonly organizationId: string;
  readonly name: string;
  readonly facilityType: FacilityType;
  readonly status: FacilityStatus;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly region?: string;
  readonly postalCode?: string;
  /** ISO 3166-1 alpha-2 country code (uppercased). */
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  /** NEVER projected into outbox signals. */
  readonly contactName?: string;
  /** Normalized (trimmed + lowercased). NEVER projected into outbox signals. */
  readonly contactEmail?: string;
  /** NEVER projected into outbox signals. */
  readonly contactPhone?: string;
  readonly visibility?: FacilityVisibility;
  /** Generic, tenant-defined capability labels (e.g. 'accessible', 'parking'). No sport terms. */
  readonly capabilityTags?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Read-only projection returned by reads. Identical shape to {@link FacilityRecord}. */
export type FacilityView = FacilityRecord;

/** Keyset cursor for stable list pagination (createdAt, then id as a tiebreaker). */
export interface FacilityListCursor {
  readonly createdAt: string;
  readonly id: string;
}

/** Tenant-scoped facility list filter. All predicates are optional and ANDed. */
export interface FacilityListFilter {
  readonly organizationId?: string;
  readonly facilityType?: FacilityType;
  readonly status?: FacilityStatus;
  readonly limit?: number;
  readonly cursor?: FacilityListCursor;
}

/** A single page of facilities with an optional continuation cursor. */
export interface FacilityListResult {
  readonly items: readonly FacilityView[];
  readonly nextCursor?: FacilityListCursor;
}

export const FACILITY_LIST_DEFAULT_LIMIT = 50;
export const FACILITY_LIST_MAX_LIMIT = 200;

// --- Outbox message types (stable platform contract; NSO-generic) ---------------------------

export const FACILITY_REGISTRY_CREATED_MESSAGE_TYPE = 'facility.registry.created';
export const FACILITY_REGISTRY_UPDATED_MESSAGE_TYPE = 'facility.registry.updated';
export const FACILITY_REGISTRY_STATUS_CHANGED_MESSAGE_TYPE = 'facility.registry.status_changed';

/**
 * Sanitized payload emitted when a facility is created. Carries routing/identity metadata only —
 * NEVER the facility name, address fields, contact fields, coordinates, capability tags, secrets,
 * raw headers, or payload bytes. Downstream consumers read the registry by id for descriptive data.
 */
export interface FacilityRegistryCreatedPayload {
  readonly facilityId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly facilityType: FacilityType;
  readonly status: FacilityStatus;
  readonly visibility?: FacilityVisibility;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Sanitized payload emitted when a facility's mutable attributes change. */
export interface FacilityRegistryUpdatedPayload {
  readonly facilityId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly facilityType: FacilityType;
  readonly status: FacilityStatus;
  readonly visibility?: FacilityVisibility;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/** Sanitized payload emitted when a facility's status changes. */
export interface FacilityRegistryStatusChangedPayload {
  readonly facilityId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly facilityType: FacilityType;
  readonly previousStatus: FacilityStatus;
  readonly newStatus: FacilityStatus;
  readonly visibility?: FacilityVisibility;
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}

// --- Type guards ----------------------------------------------------------------------------

export function isFacilityStatus(value: unknown): value is FacilityStatus {
  return typeof value === 'string' && FACILITY_STATUSES.includes(value as FacilityStatus);
}

export function isFacilityType(value: unknown): value is FacilityType {
  return typeof value === 'string' && FACILITY_TYPES.includes(value as FacilityType);
}

export function isFacilityVisibility(value: unknown): value is FacilityVisibility {
  return typeof value === 'string' && FACILITY_VISIBILITIES.includes(value as FacilityVisibility);
}

/** Clamp a requested page size into the allowed range. */
export function clampFacilityListLimit(limit: number | undefined): number {
  if (limit === undefined) return FACILITY_LIST_DEFAULT_LIMIT;
  if (limit < 1) return 1;
  return Math.min(limit, FACILITY_LIST_MAX_LIMIT);
}
