/**
 * Organization Registry service.
 *
 * Owns the business rules for tenant-scoped organizations and their parent/child hierarchy:
 * boundary validation (fail closed on unknown enum), parent existence + same-tenant + cycle
 * checks, source-reference rules, and emission of sanitized registry signals (created / updated
 * / status_changed) plus operational telemetry. Persistence + atomic outbox enqueue are delegated
 * to an {@link OrganizationRegistryStore}.
 *
 * STRICT SCOPE — this service is REFERENCE-DATA structure, not a lifecycle engine. It does NOT:
 *  - call GovernanceKernel.transition();
 *  - read or mutate governance.entity_state;
 *  - approve/reject/activate an affiliation application;
 *  - bypass RLS or tenant isolation.
 *
 * The affiliation linkage seam ({@link OrganizationRegistryService.registerOrganizationFromApprovedAffiliationApplication})
 * is a one-way PROJECTION: it records an organization derived from an already-approved
 * affiliation application. It trusts its caller to have confirmed approval (the governed
 * decision stays with the kernel/workflow) and records that provenance immutably.
 */

import { uuidGenerator, type IdGenerator } from '../../shared/uuid/id.js';
import { systemClock, type Clock } from '../../shared/time/clock.js';
import { NOOP_TELEMETRY } from '../../observability/NoopTelemetry.js';
import type { Telemetry } from '../../observability/Telemetry.js';
import { TelemetryAttributeKeys, TelemetryCounters, TelemetryEvents } from '../../observability/TelemetryEvents.js';
import {
  buildOrganizationCreatedOutbox,
  buildOrganizationStatusChangedOutbox,
  buildOrganizationUpdatedOutbox,
  type OrganizationRegistryStore,
} from './OrganizationRegistryStore.js';
import {
  optionalText,
  organizationNotFound,
  organizationParentCycle,
  organizationParentNotFound,
  organizationSourceReferenceRequired,
  requireDisplayName,
  requireOrganizationSource,
  requireOrganizationStatus,
  requireOrganizationType,
  requireTenantId,
} from './OrganizationRegistryErrors.js';
import {
  type OrganizationListFilter,
  type OrganizationListResult,
  type OrganizationRecord,
  type OrganizationStatus,
  type OrganizationType,
  type OrganizationView,
} from './OrganizationTypes.js';

/** Optional correlation/causation + actor metadata carried into outbox + telemetry. */
interface OrganizationActionMeta {
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/** Input to create a new organization. `organizationId` is optional (generated when absent). */
export interface CreateOrganizationInput extends OrganizationActionMeta {
  readonly tenantId: string;
  readonly organizationId?: string;
  readonly organizationType: OrganizationType;
  readonly displayName: string;
  readonly legalName?: string;
  /** Defaults to `draft` when omitted. */
  readonly status?: OrganizationStatus;
  readonly parentOrganizationId?: string;
  /** Defaults to `manual` when omitted. */
  readonly source?: string;
  readonly sourceEntityType?: string;
  readonly sourceEntityId?: string;
}

/** Input to update an organization's mutable attributes (NOT status; use changeStatus). */
export interface UpdateOrganizationInput extends OrganizationActionMeta {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly displayName?: string;
  readonly legalName?: string | null;
  readonly parentOrganizationId?: string | null;
}

/** Input to change an organization's status. Records never get deleted. */
export interface ChangeOrganizationStatusInput extends OrganizationActionMeta {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly status: OrganizationStatus;
}

/** Input to register an organization projected from an APPROVED affiliation application. */
export interface RegisterFromAffiliationInput extends OrganizationActionMeta {
  readonly tenantId: string;
  /** The approved affiliation application id; recorded as the immutable source reference. */
  readonly affiliationApplicationId: string;
  readonly organizationType: OrganizationType;
  readonly displayName: string;
  readonly legalName?: string;
  readonly parentOrganizationId?: string;
  /** Optional explicit organization id (generated when absent). */
  readonly organizationId?: string;
}

export interface OrganizationRegistryServiceDeps {
  readonly telemetry?: Telemetry;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
}

const SOURCE_ENTITY_TYPE_AFFILIATION = 'AffiliationApplication';
const MAX_HIERARCHY_DEPTH = 64;

export class OrganizationRegistryService {
  private readonly telemetry: Telemetry;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(
    private readonly store: OrganizationRegistryStore,
    deps: OrganizationRegistryServiceDeps = {},
  ) {
    this.telemetry = deps.telemetry ?? NOOP_TELEMETRY;
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids ?? uuidGenerator;
  }

  async createOrganization(input: CreateOrganizationInput): Promise<OrganizationView> {
    const tenantId = requireTenantId(input.tenantId);
    const organizationType = requireOrganizationType(input.organizationType);
    const displayName = requireDisplayName(input.displayName);
    const status = input.status !== undefined ? requireOrganizationStatus(input.status) : 'draft';
    const source = this.resolveSource(input.source);
    const legalName = optionalText(input.legalName, 'legalName');
    const sourceEntityType = optionalText(input.sourceEntityType, 'sourceEntityType');
    const sourceEntityId = optionalText(input.sourceEntityId, 'sourceEntityId');
    const parentOrganizationId = optionalText(input.parentOrganizationId, 'parentOrganizationId');
    const organizationId = optionalText(input.organizationId, 'organizationId') ?? this.ids.newId();

    this.assertSourceReferenceRules({
      status,
      source,
      sourceEntityType,
      sourceEntityId,
    });

    if (parentOrganizationId !== undefined) {
      await this.assertValidParent(tenantId, organizationId, parentOrganizationId);
    }

    const now = this.clock.nowIso();
    const record = this.buildRecord({
      tenantId,
      organizationId,
      organizationType,
      displayName,
      legalName,
      status,
      parentOrganizationId,
      source,
      sourceEntityType,
      sourceEntityId,
      createdAt: now,
      updatedAt: now,
    });

    const outbox = buildOrganizationCreatedOutbox(record, {
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    });

    const result = await this.store.create(record, outbox);
    if (result.outcome === 'conflict') {
      // Idempotent replay — no new signal, no duplicate row. Return the existing view.
      return result.view;
    }

    this.telemetry.incrementCounter(TelemetryCounters.organizationRegistryCreated, 1, {
      [TelemetryAttributeKeys.operation]: 'create',
    });
    this.telemetry.recordEvent(TelemetryEvents.organizationRegistryCreated, {
      [TelemetryAttributeKeys.operation]: 'create',
      ...(input.correlationId !== undefined
        ? { [TelemetryAttributeKeys.correlationId]: input.correlationId }
        : {}),
    });
    return result.view;
  }

  async updateOrganization(input: UpdateOrganizationInput): Promise<OrganizationView> {
    const tenantId = requireTenantId(input.tenantId);
    const organizationId = optionalText(input.organizationId, 'organizationId');
    if (organizationId === undefined) {
      throw organizationNotFound(String(input.organizationId));
    }
    const current = await this.store.getById(tenantId, organizationId);
    if (current === undefined) {
      throw organizationNotFound(organizationId);
    }

    const displayName =
      input.displayName !== undefined ? requireDisplayName(input.displayName) : current.displayName;

    // legalName: undefined = unchanged; null = clear; string = set.
    let legalName = current.legalName;
    if (input.legalName === null) legalName = undefined;
    else if (input.legalName !== undefined) legalName = optionalText(input.legalName, 'legalName');

    // parentOrganizationId: undefined = unchanged; null = clear; string = set (validated).
    let parentOrganizationId = current.parentOrganizationId;
    if (input.parentOrganizationId === null) {
      parentOrganizationId = undefined;
    } else if (input.parentOrganizationId !== undefined) {
      parentOrganizationId = optionalText(input.parentOrganizationId, 'parentOrganizationId');
      if (parentOrganizationId !== undefined) {
        await this.assertValidParent(tenantId, organizationId, parentOrganizationId);
      }
    }

    const record = this.buildRecord({
      tenantId,
      organizationId,
      organizationType: current.organizationType,
      displayName,
      legalName,
      status: current.status,
      parentOrganizationId,
      source: current.source,
      sourceEntityType: current.sourceEntityType,
      sourceEntityId: current.sourceEntityId,
      createdAt: current.createdAt,
      updatedAt: this.clock.nowIso(),
    });

    const outbox = buildOrganizationUpdatedOutbox(record, this.outboxMeta(input));
    const result = await this.store.update(record, outbox);
    if (result.outcome === 'not_found') {
      throw organizationNotFound(organizationId);
    }

    this.telemetry.incrementCounter(TelemetryCounters.organizationRegistryUpdated, 1, {
      [TelemetryAttributeKeys.operation]: 'update',
    });
    return result.view;
  }

  async changeOrganizationStatus(input: ChangeOrganizationStatusInput): Promise<OrganizationView> {
    const tenantId = requireTenantId(input.tenantId);
    const organizationId = optionalText(input.organizationId, 'organizationId');
    if (organizationId === undefined) {
      throw organizationNotFound(String(input.organizationId));
    }
    const newStatus = requireOrganizationStatus(input.status);
    const current = await this.store.getById(tenantId, organizationId);
    if (current === undefined) {
      throw organizationNotFound(organizationId);
    }

    // Idempotent no-op: status already at target. No mutation, no signal.
    if (current.status === newStatus) {
      return current;
    }

    const record = this.buildRecord({
      tenantId,
      organizationId,
      organizationType: current.organizationType,
      displayName: current.displayName,
      legalName: current.legalName,
      status: newStatus,
      parentOrganizationId: current.parentOrganizationId,
      source: current.source,
      sourceEntityType: current.sourceEntityType,
      sourceEntityId: current.sourceEntityId,
      createdAt: current.createdAt,
      updatedAt: this.clock.nowIso(),
    });

    const outbox = buildOrganizationStatusChangedOutbox(record, current.status, this.outboxMeta(input));
    const result = await this.store.update(record, outbox);
    if (result.outcome === 'not_found') {
      throw organizationNotFound(organizationId);
    }

    this.telemetry.incrementCounter(TelemetryCounters.organizationRegistryUpdated, 1, {
      [TelemetryAttributeKeys.operation]: 'status_change',
    });
    this.telemetry.recordEvent(TelemetryEvents.organizationRegistryStatusChanged, {
      [TelemetryAttributeKeys.operation]: 'status_change',
      ...(input.correlationId !== undefined
        ? { [TelemetryAttributeKeys.correlationId]: input.correlationId }
        : {}),
    });
    return result.view;
  }

  /**
   * Controlled projection seam: register an organization derived from an APPROVED affiliation
   * application. This is NOT an approval path — it neither calls the kernel nor mutates governed
   * state. It trusts the caller to have confirmed the application is approved/active (the governed
   * decision stays in the kernel/workflow) and records `affiliation_application` provenance with
   * the application id as an immutable, required source reference. The resulting org is `active`.
   */
  async registerOrganizationFromApprovedAffiliationApplication(
    input: RegisterFromAffiliationInput,
  ): Promise<OrganizationView> {
    const affiliationApplicationId =
      typeof input.affiliationApplicationId === 'string'
        ? input.affiliationApplicationId.trim()
        : '';
    if (affiliationApplicationId === '') {
      throw organizationSourceReferenceRequired(
        'affiliationApplicationId is required to register an organization from an approved affiliation application.',
      );
    }
    return this.createOrganization({
      tenantId: input.tenantId,
      organizationType: input.organizationType,
      displayName: input.displayName,
      status: 'active',
      source: 'affiliation_application',
      sourceEntityType: SOURCE_ENTITY_TYPE_AFFILIATION,
      sourceEntityId: affiliationApplicationId,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
      ...(input.parentOrganizationId !== undefined
        ? { parentOrganizationId: input.parentOrganizationId }
        : {}),
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
      ...(input.causationId !== undefined ? { causationId: input.causationId } : {}),
    });
  }

  async getOrganization(
    tenantId: string,
    organizationId: string,
  ): Promise<OrganizationView | undefined> {
    const t = requireTenantId(tenantId);
    const id = optionalText(organizationId, 'organizationId');
    const view = id !== undefined ? await this.store.getById(t, id) : undefined;
    this.telemetry.incrementCounter(TelemetryCounters.organizationRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
    });
    return view;
  }

  async listOrganizations(
    tenantId: string,
    filter: OrganizationListFilter = {},
  ): Promise<OrganizationListResult> {
    const t = requireTenantId(tenantId);
    const result = await this.store.list(t, filter);
    this.telemetry.incrementCounter(TelemetryCounters.organizationRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
    });
    return result;
  }

  // --- internals ----------------------------------------------------------------------------

  private resolveSource(source: string | undefined): OrganizationRecord['source'] {
    if (source === undefined) return 'manual';
    // Fail closed on unknown source.
    return requireOrganizationSource(source);
  }

  private assertSourceReferenceRules(args: {
    readonly status: OrganizationStatus;
    readonly source: OrganizationRecord['source'];
    readonly sourceEntityType: string | undefined;
    readonly sourceEntityId: string | undefined;
  }): void {
    // When a source-entity TYPE is provided, its ID must also be recorded (and vice versa).
    if (args.sourceEntityType !== undefined && args.sourceEntityId === undefined) {
      throw organizationSourceReferenceRequired(
        'sourceEntityId is required when sourceEntityType is provided.',
      );
    }
    if (args.sourceEntityId !== undefined && args.sourceEntityType === undefined) {
      throw organizationSourceReferenceRequired(
        'sourceEntityType is required when sourceEntityId is provided.',
      );
    }
    // An ACTIVE organization sourced from an affiliation application must carry its source id,
    // so the registry record is always traceable back to the approved application.
    if (args.source === 'affiliation_application' && args.status === 'active' && args.sourceEntityId === undefined) {
      throw organizationSourceReferenceRequired(
        'An active affiliation-sourced organization must record its sourceEntityId.',
      );
    }
  }

  /** Verify the parent exists for this tenant and that linking it introduces no cycle. */
  private async assertValidParent(
    tenantId: string,
    organizationId: string,
    parentOrganizationId: string,
  ): Promise<void> {
    if (parentOrganizationId === organizationId) {
      throw organizationParentCycle(organizationId, parentOrganizationId);
    }
    let cursor: string | undefined = parentOrganizationId;
    let depth = 0;
    const visited = new Set<string>();
    while (cursor !== undefined) {
      if (depth++ > MAX_HIERARCHY_DEPTH || visited.has(cursor)) {
        // Defensive: a pre-existing cycle in stored data must not loop forever.
        throw organizationParentCycle(organizationId, parentOrganizationId);
      }
      visited.add(cursor);
      const ancestor: OrganizationView | undefined = await this.store.getById(tenantId, cursor);
      if (ancestor === undefined) {
        // The immediate parent missing means an invalid parent; a missing deeper ancestor means
        // a broken chain — either way the immediate parent check is what callers assert on.
        if (cursor === parentOrganizationId) {
          throw organizationParentNotFound(parentOrganizationId);
        }
        return;
      }
      if (ancestor.organizationId === organizationId) {
        throw organizationParentCycle(organizationId, parentOrganizationId);
      }
      cursor = ancestor.parentOrganizationId;
    }
  }

  private buildRecord(fields: {
    readonly tenantId: string;
    readonly organizationId: string;
    readonly organizationType: OrganizationType;
    readonly displayName: string;
    readonly legalName: string | undefined;
    readonly status: OrganizationStatus;
    readonly parentOrganizationId: string | undefined;
    readonly source: OrganizationRecord['source'];
    readonly sourceEntityType: string | undefined;
    readonly sourceEntityId: string | undefined;
    readonly createdAt: string;
    readonly updatedAt: string;
  }): OrganizationRecord {
    return {
      tenantId: fields.tenantId,
      organizationId: fields.organizationId,
      organizationType: fields.organizationType,
      displayName: fields.displayName,
      status: fields.status,
      source: fields.source,
      createdAt: fields.createdAt,
      updatedAt: fields.updatedAt,
      ...(fields.legalName !== undefined ? { legalName: fields.legalName } : {}),
      ...(fields.parentOrganizationId !== undefined
        ? { parentOrganizationId: fields.parentOrganizationId }
        : {}),
      ...(fields.sourceEntityType !== undefined ? { sourceEntityType: fields.sourceEntityType } : {}),
      ...(fields.sourceEntityId !== undefined ? { sourceEntityId: fields.sourceEntityId } : {}),
    };
  }

  private outboxMeta(input: OrganizationActionMeta): {
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
