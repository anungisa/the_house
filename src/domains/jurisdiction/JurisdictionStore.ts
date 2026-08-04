/**
 * Governed jurisdiction store port + command/outcome shapes + stable dedupe keys.
 *
 * A jurisdiction catalog row lives through governed commands (createDraft → publish → retire); an
 * assignment edge lives through (assign → replace / revoke). Each command is a governed transition:
 * the store mutates the head (catalog row / assignment), appends an append-only event, writes a
 * `governance.audit_event`, and enqueues a transactional outbox message — ALL inside ONE
 * tenant-scoped transaction. Business validation and error mapping live in
 * {@link JurisdictionCatalogService}; the store returns a deterministic outcome. Domain code never
 * mutates `status` outside this store.
 */

import type { OutboxCorrelation } from '../participant-registry/ParticipantRegistryStore.js';
import type {
  JurisdictionAssignmentRecord,
  JurisdictionInheritanceMode,
  JurisdictionLevel,
  JurisdictionRecord,
} from './JurisdictionTypes.js';

export const JURISDICTION_CREATED_MESSAGE_TYPE = 'jurisdiction.created';
export const JURISDICTION_REVISED_MESSAGE_TYPE = 'jurisdiction.revised';
export const JURISDICTION_PUBLISHED_MESSAGE_TYPE = 'jurisdiction.published';
export const JURISDICTION_RETIRED_MESSAGE_TYPE = 'jurisdiction.retired';
export const JURISDICTION_ASSIGNED_MESSAGE_TYPE = 'jurisdiction.assigned';
export const JURISDICTION_ASSIGNMENT_REPLACED_MESSAGE_TYPE = 'jurisdiction.assignment_replaced';
export const JURISDICTION_ASSIGNMENT_REVOKED_MESSAGE_TYPE = 'jurisdiction.assignment_revoked';

/** Stable per-command dedupe key: one message per (message type, idempotency key). */
export function jurisdictionDedupeKey(messageType: string, idempotencyKey: string): string {
  return `${messageType}:${idempotencyKey}`;
}

/** Metadata carried onto audit/outbox lineage for a command. */
export type JurisdictionCommandMeta = {
  readonly actorUserId?: string;
} & OutboxCorrelation;

/** Fields shared by every governed jurisdiction command. */
interface JurisdictionCommandBase {
  readonly tenantId: string;
  readonly idempotencyKey: string;
  readonly meta?: JurisdictionCommandMeta;
}

// ---- Catalog commands ------------------------------------------------------------------------

/** Create a new DRAFT jurisdiction. Fails closed if the code already exists. */
export interface CreateJurisdictionDraftCommand extends JurisdictionCommandBase {
  readonly code: string;
  readonly level: JurisdictionLevel;
  readonly labelEn: string;
  readonly labelFr: string;
  readonly parentJurisdictionCode?: string;
  readonly countryCode?: string;
  readonly subdivisionCode?: string;
  readonly sourceReference?: string;
  readonly createdBy?: string;
}

export type CreateJurisdictionDraftOutcome =
  | { readonly outcome: 'created'; readonly record: JurisdictionRecord }
  | { readonly outcome: 'replayed'; readonly record: JurisdictionRecord }
  | { readonly outcome: 'conflict'; readonly record: JurisdictionRecord }
  /** A referenced parent jurisdiction code has no same-tenant catalog row. */
  | { readonly outcome: 'parent_not_found' };

/** Revise DRAFT metadata (labels / level / descriptors / parent). Only permitted while `draft`. */
export interface ReviseJurisdictionDraftCommand extends JurisdictionCommandBase {
  readonly code: string;
  readonly labelEn?: string;
  readonly labelFr?: string;
  readonly level?: JurisdictionLevel;
  readonly countryCode?: string;
  readonly subdivisionCode?: string;
  /** `null` clears the parent; a string sets it (by code); omitted leaves it unchanged. */
  readonly parentJurisdictionCode?: string | null;
  readonly expectedVersion?: number;
  readonly updatedBy?: string;
}

/** Publish a completed draft (draft → published). */
export interface PublishJurisdictionCommand extends JurisdictionCommandBase {
  readonly code: string;
  readonly expectedVersion?: number;
  readonly publishedBy?: string;
}

/** Retire a jurisdiction (→ retired). A retired jurisdiction never backs a new active assignment. */
export interface RetireJurisdictionCommand extends JurisdictionCommandBase {
  readonly code: string;
  readonly reasonCode?: string;
  readonly expectedVersion?: number;
  readonly actedBy?: string;
}

/**
 * Deterministic outcome for a lifecycle transition on an EXISTING jurisdiction head.
 * - `applied`: committed. `replayed`: idempotent retry. `not_found`: no head for (tenant, code).
 * - `version_conflict`: optimistic `expectedVersion` mismatch. `invalid_state`: state forbids it.
 * - `parent_not_found`: a revise set a parent code with no same-tenant catalog row.
 */
export type JurisdictionMutationOutcome =
  | { readonly outcome: 'applied'; readonly record: JurisdictionRecord }
  | { readonly outcome: 'replayed'; readonly record: JurisdictionRecord }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'version_conflict'; readonly record: JurisdictionRecord }
  | { readonly outcome: 'invalid_state'; readonly record: JurisdictionRecord }
  | { readonly outcome: 'parent_not_found'; readonly record: JurisdictionRecord };

// ---- Assignment commands ---------------------------------------------------------------------

/** Assign a PUBLISHED jurisdiction as an organization's primary jurisdiction. */
export interface AssignPrimaryJurisdictionCommand extends JurisdictionCommandBase {
  readonly organizationId: string;
  readonly jurisdictionCode: string;
  readonly inheritanceMode: JurisdictionInheritanceMode;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly sourceReference?: string;
  readonly assignedBy?: string;
}

/** Replace an organization's active primary assignment with a new one (revoke + assign atomically). */
export interface ReplacePrimaryJurisdictionCommand extends JurisdictionCommandBase {
  readonly organizationId: string;
  readonly jurisdictionCode: string;
  readonly inheritanceMode: JurisdictionInheritanceMode;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly reasonCode?: string;
  readonly sourceReference?: string;
  /** Optimistic guard on the CURRENT active assignment being replaced. */
  readonly expectedVersion?: number;
  readonly actedBy?: string;
}

/** Revoke an organization's active primary assignment (→ revoked). */
export interface RevokeJurisdictionAssignmentCommand extends JurisdictionCommandBase {
  readonly organizationId: string;
  readonly reasonCode?: string;
  readonly expectedVersion?: number;
  readonly actedBy?: string;
}

/**
 * Deterministic outcome for an assignment command.
 * - `assigned`/`replaced`/`revoked`: committed. `replayed`: idempotent retry.
 * - `conflict`: an active primary already exists (assign) or optimistic version mismatch.
 * - `not_found`: no active assignment to replace/revoke, or the organization does not exist.
 * - `jurisdiction_unavailable`: the referenced jurisdiction is unknown, a draft, or retired.
 */
export type JurisdictionAssignmentOutcome =
  | { readonly outcome: 'assigned'; readonly record: JurisdictionAssignmentRecord }
  | { readonly outcome: 'replaced'; readonly record: JurisdictionAssignmentRecord }
  | { readonly outcome: 'revoked'; readonly record: JurisdictionAssignmentRecord }
  | { readonly outcome: 'replayed'; readonly record: JurisdictionAssignmentRecord }
  | { readonly outcome: 'conflict'; readonly record?: JurisdictionAssignmentRecord }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'jurisdiction_unavailable' };

/**
 * Persistence port for the governed jurisdiction catalog + assignment edge. All reads/writes are
 * tenant-scoped and RLS-enforced; cross-tenant rows simply do not resolve.
 */
export interface JurisdictionStore {
  // Catalog commands.
  createDraft(command: CreateJurisdictionDraftCommand): Promise<CreateJurisdictionDraftOutcome>;
  reviseDraft(command: ReviseJurisdictionDraftCommand): Promise<JurisdictionMutationOutcome>;
  publish(command: PublishJurisdictionCommand): Promise<JurisdictionMutationOutcome>;
  retire(command: RetireJurisdictionCommand): Promise<JurisdictionMutationOutcome>;

  // Assignment commands.
  assignPrimary(command: AssignPrimaryJurisdictionCommand): Promise<JurisdictionAssignmentOutcome>;
  replacePrimary(command: ReplacePrimaryJurisdictionCommand): Promise<JurisdictionAssignmentOutcome>;
  revoke(command: RevokeJurisdictionAssignmentCommand): Promise<JurisdictionAssignmentOutcome>;

  // Reads (resolver + service).
  /** All PUBLISHED jurisdictions for a tenant (catalog source). */
  listPublishedForTenant(tenantId: string): Promise<readonly JurisdictionRecord[]>;
  /** Resolve a single jurisdiction head by its stable code, regardless of status. */
  getByCode(tenantId: string, code: string): Promise<JurisdictionRecord | undefined>;
  /** Resolve a single jurisdiction head by row id. */
  getJurisdictionById(tenantId: string, id: string): Promise<JurisdictionRecord | undefined>;
  /** ACTIVE primary assignments for an organization (resolver precedence source). */
  activeAssignmentsForOrganization(
    tenantId: string,
    organizationId: string,
  ): Promise<readonly JurisdictionAssignmentRecord[]>;
}
