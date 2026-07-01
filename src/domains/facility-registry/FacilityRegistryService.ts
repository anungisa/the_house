/**
 * Facility Registry service.
 *
 * Owns the business rules for tenant-scoped facilities: boundary validation (fail closed on unknown
 * enum), field normalization, organization existence + same-tenant checks (via a READ-ONLY
 * {@link OrganizationReader}), and emission of sanitized registry signals (created / updated /
 * status_changed) plus operational telemetry. Persistence + atomic outbox enqueue are delegated to
 * a {@link FacilityRegistryStore}.
 *
 * STRICT SCOPE — this service is REFERENCE-DATA structure, not a lifecycle engine. It does NOT:
 *  - request or execute governed lifecycle transitions;
 *  - read or mutate governed lifecycle state;
 *  - mutate the Organization Registry (it only READS to confirm a same-tenant organization);
 *  - model any operational or transactional behavior beyond reference data (see the architecture
 *    doc's out-of-scope section for the exhaustive list intentionally excluded from this slice);
 *  - bypass RLS or tenant isolation.
 */

import { uuidGenerator, type IdGenerator } from '../../shared/uuid/id.js';
import { systemClock, type Clock } from '../../shared/time/clock.js';
import { NOOP_TELEMETRY } from '../../observability/NoopTelemetry.js';
import type { Telemetry } from '../../observability/Telemetry.js';
import {
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryEvents,
} from '../../observability/TelemetryEvents.js';
import {
  buildFacilityCreatedOutbox,
  buildFacilityStatusChangedOutbox,
  buildFacilityUpdatedOutbox,
  type OrganizationReader,
  type FacilityRegistryStore,
} from './FacilityRegistryStore.js';
import {
  facilityNotFound,
  facilityOrganizationNotFound,
  optionalCapabilityTags,
  optionalCountryCode,
  optionalEmail,
  optionalLatitude,
  optionalLongitude,
  optionalText,
  optionalVisibility,
  requireFacilityId,
  requireFacilityStatus,
  requireFacilityType,
  requireName,
  requireOrganizationId,
  requireTenantId,
} from './FacilityRegistryErrors.js';
import {
  type FacilityListFilter,
  type FacilityListResult,
  type FacilityRecord,
  type FacilityStatus,
  type FacilityType,
  type FacilityView,
  type FacilityVisibility,
} from './FacilityTypes.js';

/** Optional correlation/causation + actor metadata carried into outbox + telemetry. */
interface FacilityActionMeta {
  readonly actorUserId?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/** Input to create a new facility. `facilityId` is optional (generated when absent). */
export interface CreateFacilityInput extends FacilityActionMeta {
  readonly tenantId: string;
  readonly facilityId?: string;
  readonly organizationId: string;
  readonly name: string;
  readonly facilityType: FacilityType;
  /** Defaults to `draft` when omitted. */
  readonly status?: FacilityStatus;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly visibility?: FacilityVisibility;
  readonly capabilityTags?: readonly string[];
}

/** Input to update a facility's mutable descriptive attributes (NOT status; use changeStatus). */
export interface UpdateFacilityInput extends FacilityActionMeta {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly name?: string;
  readonly addressLine1?: string | null;
  readonly addressLine2?: string | null;
  readonly locality?: string | null;
  readonly region?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly contactName?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
  readonly visibility?: FacilityVisibility | null;
  readonly capabilityTags?: readonly string[] | null;
}

/** Input to change a facility's status. Records never get deleted. */
export interface ChangeFacilityStatusInput extends FacilityActionMeta {
  readonly tenantId: string;
  readonly facilityId: string;
  readonly status: FacilityStatus;
}

export interface FacilityRegistryServiceDeps {
  readonly telemetry?: Telemetry;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  /** Read-only organization existence check (same-tenant). Required to create a facility. */
  readonly organizationReader?: OrganizationReader;
}

export class FacilityRegistryService {
  private readonly telemetry: Telemetry;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly organizationReader: OrganizationReader | undefined;

  constructor(
    private readonly store: FacilityRegistryStore,
    deps: FacilityRegistryServiceDeps = {},
  ) {
    this.telemetry = deps.telemetry ?? NOOP_TELEMETRY;
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids ?? uuidGenerator;
    this.organizationReader = deps.organizationReader;
  }

  async createFacility(input: CreateFacilityInput): Promise<FacilityView> {
    const tenantId = requireTenantId(input.tenantId);
    const organizationId = requireOrganizationId(input.organizationId);
    const name = requireName(input.name);
    const facilityType = requireFacilityType(input.facilityType);
    const status = input.status !== undefined ? requireFacilityStatus(input.status) : 'draft';
    const facilityId = optionalText(input.facilityId, 'facilityId') ?? this.ids.newId();

    const attrs = this.normalizeAttributes(input);

    // The organization must exist for the SAME tenant (read-only reference check; RLS makes a
    // cross-tenant organization invisible, so it resolves to "not found").
    await this.assertOrganizationExists(tenantId, organizationId);

    const now = this.clock.nowIso();
    const record = this.buildFacility({
      tenantId,
      facilityId,
      organizationId,
      name,
      facilityType,
      status,
      createdAt: now,
      updatedAt: now,
      ...attrs,
    });

    const outbox = buildFacilityCreatedOutbox(record, this.outboxMeta(input));
    const result = await this.store.create(record, outbox);
    if (result.outcome === 'conflict') {
      // Idempotent replay — no new signal, no duplicate row.
      return result.view;
    }

    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryCreated, 1, {
      [TelemetryAttributeKeys.operation]: 'create',
    });
    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'create',
    });
    this.telemetry.recordEvent(TelemetryEvents.facilityRegistryCreated, {
      [TelemetryAttributeKeys.operation]: 'create',
      ...(input.correlationId !== undefined
        ? { [TelemetryAttributeKeys.correlationId]: input.correlationId }
        : {}),
    });
    return result.view;
  }

  async updateFacility(input: UpdateFacilityInput): Promise<FacilityView> {
    const tenantId = requireTenantId(input.tenantId);
    const facilityId = requireFacilityId(input.facilityId);
    const current = await this.store.getById(tenantId, facilityId);
    if (current === undefined) {
      throw facilityNotFound(facilityId);
    }

    const name = input.name !== undefined ? requireName(input.name) : current.name;
    const merged = this.mergeMutableAttributes(current, input);

    const record = this.buildFacility({
      tenantId,
      facilityId,
      organizationId: current.organizationId,
      name,
      facilityType: current.facilityType,
      status: current.status,
      createdAt: current.createdAt,
      updatedAt: this.clock.nowIso(),
      ...merged,
    });

    const outbox = buildFacilityUpdatedOutbox(record, this.outboxMeta(input));
    const result = await this.store.update(record, outbox);
    if (result.outcome === 'not_found') {
      throw facilityNotFound(facilityId);
    }

    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryUpdated, 1, {
      [TelemetryAttributeKeys.operation]: 'update',
    });
    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'update',
    });
    return result.view;
  }

  async changeFacilityStatus(input: ChangeFacilityStatusInput): Promise<FacilityView> {
    const tenantId = requireTenantId(input.tenantId);
    const facilityId = requireFacilityId(input.facilityId);
    const newStatus = requireFacilityStatus(input.status);
    const current = await this.store.getById(tenantId, facilityId);
    if (current === undefined) {
      throw facilityNotFound(facilityId);
    }

    // Idempotent no-op: status already at target. No mutation, no signal.
    if (current.status === newStatus) {
      return current;
    }

    const record = this.buildFacility({
      tenantId,
      facilityId,
      organizationId: current.organizationId,
      name: current.name,
      facilityType: current.facilityType,
      status: newStatus,
      createdAt: current.createdAt,
      updatedAt: this.clock.nowIso(),
      ...this.currentAttributes(current),
    });

    const outbox = buildFacilityStatusChangedOutbox(record, current.status, this.outboxMeta(input));
    const result = await this.store.update(record, outbox);
    if (result.outcome === 'not_found') {
      throw facilityNotFound(facilityId);
    }

    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryStatusChanged, 1, {
      [TelemetryAttributeKeys.operation]: 'status_change',
    });
    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'status_change',
    });
    this.telemetry.recordEvent(TelemetryEvents.facilityRegistryStatusChanged, {
      [TelemetryAttributeKeys.operation]: 'status_change',
      ...(input.correlationId !== undefined
        ? { [TelemetryAttributeKeys.correlationId]: input.correlationId }
        : {}),
    });
    return result.view;
  }

  async getFacility(tenantId: string, facilityId: string): Promise<FacilityView | undefined> {
    const t = requireTenantId(tenantId);
    const id = optionalText(facilityId, 'facilityId');
    const view = id !== undefined ? await this.store.getById(t, id) : undefined;
    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'detail',
    });
    return view;
  }

  async listFacilities(
    tenantId: string,
    filter: FacilityListFilter = {},
  ): Promise<FacilityListResult> {
    const t = requireTenantId(tenantId);
    const result = await this.store.list(t, filter);
    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list',
    });
    return result;
  }

  async listFacilitiesForOrganization(
    tenantId: string,
    organizationId: string,
    filter: FacilityListFilter = {},
  ): Promise<FacilityListResult> {
    const t = requireTenantId(tenantId);
    const orgId = requireOrganizationId(organizationId);
    const result = await this.store.list(t, { ...filter, organizationId: orgId });
    this.telemetry.incrementCounter(TelemetryCounters.facilityRegistryRead, 1, {
      [TelemetryAttributeKeys.operation]: 'list_for_organization',
    });
    return result;
  }

  // --- internals ----------------------------------------------------------------------------

  /** Confirm a same-tenant organization exists via the read-only reader; fail closed otherwise. */
  private async assertOrganizationExists(tenantId: string, organizationId: string): Promise<void> {
    if (this.organizationReader === undefined) {
      // Without a reader we cannot prove the organization exists for this tenant — fail closed.
      throw facilityOrganizationNotFound(organizationId);
    }
    const org = await this.organizationReader.getById(tenantId, organizationId);
    if (org === undefined) {
      throw facilityOrganizationNotFound(organizationId);
    }
  }

  /** Normalize the optional descriptive attributes on a create input. */
  private normalizeAttributes(input: CreateFacilityInput): OptionalAttributes {
    return this.pickAttributes({
      addressLine1: optionalText(input.addressLine1, 'addressLine1'),
      addressLine2: optionalText(input.addressLine2, 'addressLine2'),
      locality: optionalText(input.locality, 'locality'),
      region: optionalText(input.region, 'region'),
      postalCode: optionalText(input.postalCode, 'postalCode'),
      countryCode: optionalCountryCode(input.countryCode),
      latitude: optionalLatitude(input.latitude),
      longitude: optionalLongitude(input.longitude),
      contactName: optionalText(input.contactName, 'contactName'),
      contactEmail: optionalEmail(input.contactEmail, 'contactEmail'),
      contactPhone: optionalText(input.contactPhone, 'contactPhone'),
      visibility: optionalVisibility(input.visibility),
      capabilityTags: optionalCapabilityTags(input.capabilityTags),
    });
  }

  /**
   * Merge an update input's tri-state fields against the current record. `null` clears a field,
   * `undefined` leaves it unchanged, and a provided value replaces it (after normalization).
   */
  private mergeMutableAttributes(
    current: FacilityView,
    input: UpdateFacilityInput,
  ): OptionalAttributes {
    return this.pickAttributes({
      addressLine1: mergeText(current.addressLine1, input.addressLine1, 'addressLine1'),
      addressLine2: mergeText(current.addressLine2, input.addressLine2, 'addressLine2'),
      locality: mergeText(current.locality, input.locality, 'locality'),
      region: mergeText(current.region, input.region, 'region'),
      postalCode: mergeText(current.postalCode, input.postalCode, 'postalCode'),
      countryCode:
        input.countryCode === null
          ? undefined
          : input.countryCode !== undefined
            ? optionalCountryCode(input.countryCode)
            : current.countryCode,
      latitude:
        input.latitude === null
          ? undefined
          : input.latitude !== undefined
            ? optionalLatitude(input.latitude)
            : current.latitude,
      longitude:
        input.longitude === null
          ? undefined
          : input.longitude !== undefined
            ? optionalLongitude(input.longitude)
            : current.longitude,
      contactName: mergeText(current.contactName, input.contactName, 'contactName'),
      contactEmail:
        input.contactEmail === null
          ? undefined
          : input.contactEmail !== undefined
            ? optionalEmail(input.contactEmail, 'contactEmail')
            : current.contactEmail,
      contactPhone: mergeText(current.contactPhone, input.contactPhone, 'contactPhone'),
      visibility:
        input.visibility === null
          ? undefined
          : input.visibility !== undefined
            ? optionalVisibility(input.visibility)
            : current.visibility,
      capabilityTags:
        input.capabilityTags === null
          ? undefined
          : input.capabilityTags !== undefined
            ? optionalCapabilityTags(input.capabilityTags)
            : current.capabilityTags,
    });
  }

  /** Snapshot the mutable attributes of a current record (used by a status change). */
  private currentAttributes(current: FacilityView): OptionalAttributes {
    return this.pickAttributes({
      addressLine1: current.addressLine1,
      addressLine2: current.addressLine2,
      locality: current.locality,
      region: current.region,
      postalCode: current.postalCode,
      countryCode: current.countryCode,
      latitude: current.latitude,
      longitude: current.longitude,
      contactName: current.contactName,
      contactEmail: current.contactEmail,
      contactPhone: current.contactPhone,
      visibility: current.visibility,
      capabilityTags: current.capabilityTags,
    });
  }

  /** Drop keys whose value is undefined so exactOptionalPropertyTypes stays satisfied. */
  private pickAttributes(attrs: OptionalAttributes): OptionalAttributes {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined) out[key] = value;
    }
    return out as OptionalAttributes;
  }

  private buildFacility(
    fields: {
      readonly tenantId: string;
      readonly facilityId: string;
      readonly organizationId: string;
      readonly name: string;
      readonly facilityType: FacilityType;
      readonly status: FacilityStatus;
      readonly createdAt: string;
      readonly updatedAt: string;
    } & OptionalAttributes,
  ): FacilityRecord {
    return {
      tenantId: fields.tenantId,
      facilityId: fields.facilityId,
      organizationId: fields.organizationId,
      name: fields.name,
      facilityType: fields.facilityType,
      status: fields.status,
      createdAt: fields.createdAt,
      updatedAt: fields.updatedAt,
      ...(fields.addressLine1 !== undefined ? { addressLine1: fields.addressLine1 } : {}),
      ...(fields.addressLine2 !== undefined ? { addressLine2: fields.addressLine2 } : {}),
      ...(fields.locality !== undefined ? { locality: fields.locality } : {}),
      ...(fields.region !== undefined ? { region: fields.region } : {}),
      ...(fields.postalCode !== undefined ? { postalCode: fields.postalCode } : {}),
      ...(fields.countryCode !== undefined ? { countryCode: fields.countryCode } : {}),
      ...(fields.latitude !== undefined ? { latitude: fields.latitude } : {}),
      ...(fields.longitude !== undefined ? { longitude: fields.longitude } : {}),
      ...(fields.contactName !== undefined ? { contactName: fields.contactName } : {}),
      ...(fields.contactEmail !== undefined ? { contactEmail: fields.contactEmail } : {}),
      ...(fields.contactPhone !== undefined ? { contactPhone: fields.contactPhone } : {}),
      ...(fields.visibility !== undefined ? { visibility: fields.visibility } : {}),
      ...(fields.capabilityTags !== undefined ? { capabilityTags: fields.capabilityTags } : {}),
    };
  }

  private outboxMeta(input: FacilityActionMeta): {
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

/** The optional, mutable descriptive attributes shared across build/merge helpers. */
interface OptionalAttributes {
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly visibility?: FacilityVisibility;
  readonly capabilityTags?: readonly string[];
}

/** Tri-state text merge: null clears, undefined keeps current, a value normalizes + replaces. */
function mergeText(
  current: string | undefined,
  next: string | null | undefined,
  field: string,
): string | undefined {
  if (next === null) return undefined;
  if (next === undefined) return current;
  return optionalText(next, field);
}
