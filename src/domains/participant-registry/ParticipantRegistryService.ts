/**
 * Participant Registry service.
 *
 * Owns the business rules for tenant-scoped participants and their organization relationships:
 * boundary validation (fail closed on unknown enum), email normalization, organization existence
 * + same-tenant checks (via a READ-ONLY {@link OrganizationReader}), archived-participant rules,
 * and emission of sanitized registry signals (created / updated / status_changed /
 * organization_linked / organization_link_status_changed) plus operational telemetry. Persistence
 * + atomic outbox enqueue are delegated to a {@link ParticipantRegistryStore}.
 *
 * STRICT SCOPE — this service is REFERENCE-DATA structure, not a lifecycle engine. It does NOT:
 *  - call GovernanceKernel.transition();
 *  - read or mutate governance.entity_state;
 *  - mutate the Organization Registry (it only READS to confirm a same-tenant organization);
 *  - model registration, payments, program enrollment, event participation, eligibility, or any
 *    sensitive attribute;
 *  - bypass RLS or tenant isolation.
 */

import { uuidGenerator, type IdGenerator } from '../../shared/uuid/id.js';
import { systemClock, type Clock } from '../../shared/time/clock.js';
import { NOOP_TELEMETRY } from '../../observability/NoopTelemetry.js';
import type { Telemetry } from '../../observability/Telemetry.js';
import { TelemetryAttributeKeys, TelemetryCounters, TelemetryEvents } from '../../observability/TelemetryEvents.js';
import {
  buildOrganizationLinkStatusChangedOutbox,
  buildOrganizationLinkedOutbox,
  buildParticipantCreatedOutbox,
  buildParticipantStatusChangedOutbox,
  buildParticipantUpdatedOutbox,
  type OrganizationReader,
  type ParticipantRegistryStore,
} from './ParticipantRegistryStore.js';
import {
  archivedParticipantCannotLink,
  optionalEmail,
  optionalExternalRefs,
  optionalIsoDate,
  optionalText,
  organizationNotFoundForLink,
  organizationParticipantNotFound,
  participantNotFound,
  requireDisplayName,
  requireOrganizationId,
  requireParticipantId,
  requireParticipantStatus,
  requireRelationshipStatus,
  requireRelationshipType,
  requireTenantId,
} from './ParticipantRegistryErrors.js';
import {
  type OrganizationParticipantListFilter,
  type OrganizationParticipantListResult,
  type OrganizationParticipantRecord,
  type OrganizationParticipantView,
  type ParticipantExternalRef,
  type ParticipantListFilter,
  type ParticipantListResult,
  type ParticipantRecord,
  type ParticipantStatus,
  type ParticipantView,
  type RelationshipStatus,
  type RelationshipType,
} from './ParticipantTypes.js';

/** Optional correlation/causation + actor metadata carried into outbox + telemetry. */
interface ParticipantActionMeta {
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/** Input to create a new participant. `participantId` is optional (generated when absent). */
export interface CreateParticipantInput extends ParticipantActionMeta {
  readonly tenantId: string;
  readonly participantId?: string;
  readonly displayName: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly email?: string;
  /** Defaults to `draft` when omitted. */
  readonly status?: ParticipantStatus;
  readonly externalRefs?: readonly ParticipantExternalRef[];
}

/** Input to update a participant's mutable profile attributes (NOT status; use changeStatus). */
export interface UpdateParticipantInput extends ParticipantActionMeta {
  readonly tenantId: string;
  readonly participantId: string;
  readonly displayName?: string;
  readonly givenName?: string | null;
  readonly familyName?: string | null;
  readonly email?: string | null;
  readonly externalRefs?: readonly ParticipantExternalRef[] | null;
}

/** Input to change a participant's status. Records never get deleted. */
export interface ChangeParticipantStatusInput extends ParticipantActionMeta {
  readonly tenantId: string;
  readonly participantId: string;
  readonly status: ParticipantStatus;
}

/** Input to link a participant to a same-tenant organization. */
export interface LinkParticipantToOrganizationInput extends ParticipantActionMeta {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly participantId: string;
  readonly relationshipType: RelationshipType;
  /** Optional explicit relationship id (generated when absent). */
  readonly relationshipId?: string;
  /** Defaults to `active` when omitted. */
  readonly status?: RelationshipStatus;
  readonly startDate?: string;
  readonly endDate?: string;
}

/** Input to change an organization-participant relationship's status. */
export interface ChangeOrganizationParticipantStatusInput extends ParticipantActionMeta {
  readonly tenantId: string;
  readonly relationshipId: string;
  readonly status: RelationshipStatus;
  readonly endDate?: string;
}

export interface ParticipantRegistryServiceDeps {
  readonly telemetry?: Telemetry;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  /** Read-only organization existence check (same-tenant). Required to record relationships. */
  readonly organizationReader?: OrganizationReader;
}

export class ParticipantRegistryService {
  private readonly telemetry: Telemetry;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly organizationReader: OrganizationReader | undefined;

  constructor(
    private readonly store: ParticipantRegistryStore,
    deps: ParticipantRegistryServiceDeps = {},
  ) {
    this.telemetry = deps.telemetry ?? NOOP_TELEMETRY;
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids ?? uuidGenerator;
    this.organizationReader = deps.organizationReader;
  }

  async createParticipant(input: CreateParticipantInput): Promise<ParticipantView> {
    const tenantId = requireTenantId(input.tenantId);
    const displayName = requireDisplayName(input.displayName);
    const status = input.status !== undefined ? requireParticipantStatus(input.status) : 'draft';
    const givenName = optionalText(input.givenName, 'givenName');
    const familyName = optionalText(input.familyName, 'familyName');
    const email = optionalEmail(input.email);
    const externalRefs = optionalExternalRefs(input.externalRefs);
    const participantId = optionalText(input.participantId, 'participantId') ?? this.ids.newId();

    const now = this.clock.nowIso();
    const record = this.buildParticipant({
      tenantId,
      participantId,
      displayName,
      givenName,
      familyName,
      email,
      status,
      externalRefs,
      createdAt: now,
      updatedAt: now,
    });

    const outbox = buildParticipantCreatedOutbox(record, this.outboxMeta(input));
    const result = await this.store.createParticipant(record, outbox);
    if (result.outcome === 'conflict') {
      // Idempotent replay — no new signal, no duplicate row.
      return result.view;
    }

    this.telemetry.incrementCounter(TelemetryCounters.participantRegistryCreated, 1, {
      [TelemetryAttributeKeys.operation]: 'create',
    });
    this.telemetry.recordEvent(TelemetryEvents.participantRegistryCreated, {
      [TelemetryAttributeKeys.operation]: 'create',
      ...(input.correlationId !== undefined
        ? { [TelemetryAttributeKeys.correlationId]: input.correlationId }
        : {}),
    });
    return result.view;
  }

  async updateParticipant(input: UpdateParticipantInput): Promise<ParticipantView> {
    const tenantId = requireTenantId(input.tenantId);
    const participantId = requireParticipantId(input.participantId);
    const current = await this.store.getParticipantById(tenantId, participantId);
    if (current === undefined) {
      throw participantNotFound(participantId);
    }

    const displayName =
      input.displayName !== undefined ? requireDisplayName(input.displayName) : current.displayName;

    // null = clear; undefined = unchanged; string = set.
    let givenName = current.givenName;
    if (input.givenName === null) givenName = undefined;
    else if (input.givenName !== undefined) givenName = optionalText(input.givenName, 'givenName');

    let familyName = current.familyName;
    if (input.familyName === null) familyName = undefined;
    else if (input.familyName !== undefined) familyName = optionalText(input.familyName, 'familyName');

    let email = current.email;
    if (input.email === null) email = undefined;
    else if (input.email !== undefined) email = optionalEmail(input.email);

    let externalRefs = current.externalRefs;
    if (input.externalRefs === null) externalRefs = undefined;
    else if (input.externalRefs !== undefined) externalRefs = optionalExternalRefs(input.externalRefs);

    const record = this.buildParticipant({
      tenantId,
      participantId,
      displayName,
      givenName,
      familyName,
      email,
      status: current.status,
      externalRefs,
      createdAt: current.createdAt,
      updatedAt: this.clock.nowIso(),
    });

    const outbox = buildParticipantUpdatedOutbox(record, this.outboxMeta(input));
    const result = await this.store.updateParticipant(record, outbox);
    if (result.outcome === 'not_found') {
      throw participantNotFound(participantId);
    }

    this.telemetry.incrementCounter(TelemetryCounters.participantRegistryUpdated, 1, {
      [TelemetryAttributeKeys.operation]: 'update',
    });
    return result.view;
  }

  async changeParticipantStatus(input: ChangeParticipantStatusInput): Promise<ParticipantView> {
    const tenantId = requireTenantId(input.tenantId);
    const participantId = requireParticipantId(input.participantId);
    const newStatus = requireParticipantStatus(input.status);
    const current = await this.store.getParticipantById(tenantId, participantId);
    if (current === undefined) {
      throw participantNotFound(participantId);
    }

    // Idempotent no-op: status already at target. No mutation, no signal.
    if (current.status === newStatus) {
      return current;
    }

    const record = this.buildParticipant({
      tenantId,
      participantId,
      displayName: current.displayName,
      givenName: current.givenName,
      familyName: current.familyName,
      email: current.email,
      status: newStatus,
      externalRefs: current.externalRefs,
      createdAt: current.createdAt,
      updatedAt: this.clock.nowIso(),
    });

    const outbox = buildParticipantStatusChangedOutbox(record, current.status, this.outboxMeta(input));
    const result = await this.store.updateParticipant(record, outbox);
    if (result.outcome === 'not_found') {
      throw participantNotFound(participantId);
    }

    this.telemetry.incrementCounter(TelemetryCounters.participantRegistryStatusChanged, 1, {
      [TelemetryAttributeKeys.operation]: 'status_change',
    });
    this.telemetry.recordEvent(TelemetryEvents.participantRegistryStatusChanged, {
      [TelemetryAttributeKeys.operation]: 'status_change',
      ...(input.correlationId !== undefined
        ? { [TelemetryAttributeKeys.correlationId]: input.correlationId }
        : {}),
    });
    return result.view;
  }

  async linkParticipantToOrganization(
    input: LinkParticipantToOrganizationInput,
  ): Promise<OrganizationParticipantView> {
    const tenantId = requireTenantId(input.tenantId);
    const organizationId = requireOrganizationId(input.organizationId);
    const participantId = requireParticipantId(input.participantId);
    const relationshipType = requireRelationshipType(input.relationshipType);
    const status =
      input.status !== undefined ? requireRelationshipStatus(input.status) : 'active';
    const startDate = optionalIsoDate(input.startDate, 'startDate');
    const endDate = optionalIsoDate(input.endDate, 'endDate');

    // The participant must exist for this tenant.
    const participant = await this.store.getParticipantById(tenantId, participantId);
    if (participant === undefined) {
      throw participantNotFound(participantId);
    }
    // An archived participant cannot receive a NEW active relationship.
    if (participant.status === 'archived' && status === 'active') {
      throw archivedParticipantCannotLink(participantId);
    }
    // The organization must exist for the SAME tenant (read-only reference check; RLS makes a
    // cross-tenant organization invisible, so it resolves to "not found").
    await this.assertOrganizationExists(tenantId, organizationId);

    // Keep linking idempotent: an existing non-ended relationship of the same type is returned.
    const active = await this.store.findActiveOrganizationLink(
      tenantId,
      organizationId,
      participantId,
      relationshipType,
    );
    if (active !== undefined) {
      return active;
    }

    const relationshipId = optionalText(input.relationshipId, 'relationshipId') ?? this.ids.newId();
    const now = this.clock.nowIso();
    const record = this.buildLink({
      tenantId,
      relationshipId,
      organizationId,
      participantId,
      relationshipType,
      status,
      startDate,
      endDate,
      createdAt: now,
      updatedAt: now,
    });

    const outbox = buildOrganizationLinkedOutbox(record, this.outboxMeta(input));
    const result = await this.store.createOrganizationLink(record, outbox);
    if (result.outcome === 'conflict') {
      return result.view;
    }

    this.telemetry.incrementCounter(TelemetryCounters.participantRegistryOrganizationLinked, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_link',
    });
    this.telemetry.recordEvent(TelemetryEvents.participantRegistryOrganizationLinked, {
      [TelemetryAttributeKeys.operation]: 'organization_link',
      ...(input.correlationId !== undefined
        ? { [TelemetryAttributeKeys.correlationId]: input.correlationId }
        : {}),
    });
    return result.view;
  }

  async changeOrganizationParticipantStatus(
    input: ChangeOrganizationParticipantStatusInput,
  ): Promise<OrganizationParticipantView> {
    const tenantId = requireTenantId(input.tenantId);
    const relationshipId = optionalText(input.relationshipId, 'relationshipId');
    if (relationshipId === undefined) {
      throw organizationParticipantNotFound(String(input.relationshipId));
    }
    const newStatus = requireRelationshipStatus(input.status);
    const endDate = optionalIsoDate(input.endDate, 'endDate');
    const current = await this.store.getOrganizationLinkById(tenantId, relationshipId);
    if (current === undefined) {
      throw organizationParticipantNotFound(relationshipId);
    }

    // Idempotent no-op: status already at target with no new endDate. No mutation, no signal.
    if (current.status === newStatus && endDate === undefined) {
      return current;
    }

    const record = this.buildLink({
      tenantId,
      relationshipId,
      organizationId: current.organizationId,
      participantId: current.participantId,
      relationshipType: current.relationshipType,
      status: newStatus,
      startDate: current.startDate,
      endDate: endDate ?? current.endDate,
      createdAt: current.createdAt,
      updatedAt: this.clock.nowIso(),
    });

    const outbox = buildOrganizationLinkStatusChangedOutbox(record, current.status, this.outboxMeta(input));
    const result = await this.store.updateOrganizationLink(record, outbox);
    if (result.outcome === 'not_found') {
      throw organizationParticipantNotFound(relationshipId);
    }

    this.telemetry.incrementCounter(TelemetryCounters.participantRegistryOrganizationLinked, 1, {
      [TelemetryAttributeKeys.operation]: 'organization_link_status_change',
    });
    return result.view;
  }

  async getParticipant(tenantId: string, participantId: string): Promise<ParticipantView | undefined> {
    const t = requireTenantId(tenantId);
    const id = optionalText(participantId, 'participantId');
    const view = id !== undefined ? await this.store.getParticipantById(t, id) : undefined;
    this.telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
    });
    return view;
  }

  async listParticipants(
    tenantId: string,
    filter: ParticipantListFilter = {},
  ): Promise<ParticipantListResult> {
    const t = requireTenantId(tenantId);
    const result = await this.store.listParticipants(t, filter);
    this.telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
    });
    return result;
  }

  async listOrganizationParticipants(
    tenantId: string,
    filter: OrganizationParticipantListFilter = {},
  ): Promise<OrganizationParticipantListResult> {
    const t = requireTenantId(tenantId);
    const result = await this.store.listOrganizationParticipants(t, filter);
    this.telemetry.incrementCounter(TelemetryCounters.participantRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list_relationships',
    });
    return result;
  }

  // --- internals ----------------------------------------------------------------------------

  /** Confirm a same-tenant organization exists via the read-only reader; fail closed otherwise. */
  private async assertOrganizationExists(tenantId: string, organizationId: string): Promise<void> {
    if (this.organizationReader === undefined) {
      // Without a reader we cannot prove the organization exists for this tenant — fail closed.
      throw organizationNotFoundForLink(organizationId);
    }
    const org = await this.organizationReader.getById(tenantId, organizationId);
    if (org === undefined) {
      throw organizationNotFoundForLink(organizationId);
    }
  }

  private buildParticipant(fields: {
    readonly tenantId: string;
    readonly participantId: string;
    readonly displayName: string;
    readonly givenName: string | undefined;
    readonly familyName: string | undefined;
    readonly email: string | undefined;
    readonly status: ParticipantStatus;
    readonly externalRefs: readonly ParticipantExternalRef[] | undefined;
    readonly createdAt: string;
    readonly updatedAt: string;
  }): ParticipantRecord {
    return {
      tenantId: fields.tenantId,
      participantId: fields.participantId,
      displayName: fields.displayName,
      status: fields.status,
      createdAt: fields.createdAt,
      updatedAt: fields.updatedAt,
      ...(fields.givenName !== undefined ? { givenName: fields.givenName } : {}),
      ...(fields.familyName !== undefined ? { familyName: fields.familyName } : {}),
      ...(fields.email !== undefined ? { email: fields.email } : {}),
      ...(fields.externalRefs !== undefined ? { externalRefs: fields.externalRefs } : {}),
    };
  }

  private buildLink(fields: {
    readonly tenantId: string;
    readonly relationshipId: string;
    readonly organizationId: string;
    readonly participantId: string;
    readonly relationshipType: RelationshipType;
    readonly status: RelationshipStatus;
    readonly startDate: string | undefined;
    readonly endDate: string | undefined;
    readonly createdAt: string;
    readonly updatedAt: string;
  }): OrganizationParticipantRecord {
    return {
      tenantId: fields.tenantId,
      relationshipId: fields.relationshipId,
      organizationId: fields.organizationId,
      participantId: fields.participantId,
      relationshipType: fields.relationshipType,
      status: fields.status,
      createdAt: fields.createdAt,
      updatedAt: fields.updatedAt,
      ...(fields.startDate !== undefined ? { startDate: fields.startDate } : {}),
      ...(fields.endDate !== undefined ? { endDate: fields.endDate } : {}),
    };
  }

  private outboxMeta(input: ParticipantActionMeta): {
    actorUserId?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  } {
    return {
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    };
  }
}
