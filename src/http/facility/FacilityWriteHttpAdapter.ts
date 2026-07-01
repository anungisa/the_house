/**
 * Facility Registry WRITE HTTP adapter — phase 1: create + update.
 *
 * Protocol-pure mutation handlers over the validated {@link FacilityRegistryService}:
 *  - `POST /v1/facilities` — create a facility.
 *  - `PATCH /v1/facilities/:facilityId` — update a facility's safe descriptive fields.
 *
 * A facility STATUS transition (`POST /v1/facilities/:facilityId/status-transitions`) is REFERENCE
 * DATA, not a governed lifecycle FSM, and is a deliberately SEPARATE future pass — it is NOT served
 * here, and no `facility.status.write` action exists yet.
 *
 * Architectural boundaries (DO NOT violate):
 *  - All mutations go THROUGH {@link FacilityRegistryService}. The adapter never writes to a store
 *    directly, never enqueues an outbox message itself (the service/Pg store owns the transactional
 *    outbox), never touches governance.entity_state, and never invokes the Governance Kernel. It
 *    never mutates the Organization Registry — the service only READS it (same-tenant existence).
 *  - Tenant comes EXCLUSIVELY from the resolved {@link AuthContext} (the `x-house-*` trusted
 *    headers). The body never carries identity; a cross-tenant facility is invisible (RLS), so a
 *    write against another tenant's facility returns 404 — never revealing cross-tenant existence.
 *  - Authorization is centralized: create + update use the `facility.write` action (a reference-data
 *    write, NOT a governed lifecycle transition, and NOT implying the future `facility.status.write`
 *    or `facility.read`). Denials emit the sanitized `authz.denied` signal.
 *
 * IDEMPOTENCY: create REQUIRES a client-supplied `facilityId` and an `Idempotency-Key` header. A
 * duplicate `facilityId` for the tenant is rejected with 409 via a narrow read pre-check (the
 * service treats a duplicate as an idempotent replay and never throws, so the adapter supplies the
 * deterministic 409 for the common sequential duplicate; the rare concurrent case resolves to a safe
 * replay of the existing row). The idempotency key is propagated as outbox correlation lineage only.
 * PATCH is deterministic and does not require an idempotency key.
 *
 * PRIVACY: a response carries the facility's descriptive attributes (authorized same-tenant
 * read-back). Those attributes NEVER appear in telemetry or outbox signals.
 */

import { randomUUID } from 'node:crypto';

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { assertAuthorized, AuthorizationAction } from '../../authz/index.js';
import {
  NOOP_TELEMETRY,
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryResult,
  type Telemetry,
} from '../../observability/index.js';
import type { AuthContextResolver } from '../auth/AuthContextResolver.js';
import { DemoAuthContextResolver } from '../auth/DemoAuthContextResolver.js';
import { requireTenant, resolveFacilityAuth } from './facilityHttpAuth.js';
import { toFacilityDto, type FacilityReadHttpResult } from './FacilityReadHttpAdapter.js';
import {
  FACILITY_CREATE_BODY_KEYS,
  FACILITY_UPDATE_BODY_KEYS,
  type FacilityCreateHttpRequest,
  type FacilityUpdateHttpRequest,
  type FacilityWriteResponseBody,
} from './FacilityWriteHttpDtos.js';
import type {
  CreateFacilityInput,
  FacilityRegistryService,
  UpdateFacilityInput,
} from '../../domains/facility-registry/FacilityRegistryService.js';
import {
  isFacilityStatus,
  isFacilityType,
  FACILITY_STATUSES,
  FACILITY_TYPES,
  type FacilityVisibility,
  type FacilityView,
} from '../../domains/facility-registry/FacilityTypes.js';

/** Default resolver mirrors the read adapter: demo identity unless one is supplied. */
const DEFAULT_DEMO_RESOLVER: AuthContextResolver = new DemoAuthContextResolver();

/** Lowercased HTTP header carrying the create idempotency token. */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * Narrow read port used for the create duplicate pre-check, so a duplicate `facilityId`
 * deterministically maps to 409 rather than a silent service-level idempotent replay. Both the
 * in-memory and Pg registry stores satisfy this — it is a structural subset of the registry store.
 */
export interface FacilityExistenceReader {
  getById(tenantId: string, facilityId: string): Promise<FacilityView | undefined>;
}

/** Dependencies for the write adapter: the registry service, a read port, and optional telemetry. */
export interface FacilityWriteHttpDeps {
  /** The validated domain command boundary. ALL mutations go through this. */
  readonly service: FacilityRegistryService;
  /** Read port for the create duplicate pre-check. Same store as the service persists through. */
  readonly readStore: FacilityExistenceReader;
  /**
   * Optional telemetry sink. Emits a `facility.registry.write.count` counter tagged with the
   * operation (`create`/`update`) and result (`success`/`failure`). Never carries identifiers,
   * headers, names, addresses, contact fields, coordinates, capability tags, body bytes, or secrets.
   */
  readonly telemetry?: Telemetry;
}

/** Coerce an unknown JSON body into a plain object (reject arrays/null/primitives). */
function asObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

/** Reject any body key outside the CLOSED allow-list (fails closed on unexpected/sensitive fields). */
function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `Unknown field '${key}' is not allowed for ${label}.`,
      );
    }
  }
}

/** Read the required, non-blank `Idempotency-Key` header for a create. Throws 400 when absent. */
function requireIdempotencyKey(headers: Readonly<Record<string, string | undefined>>): string {
  const raw = headers[IDEMPOTENCY_KEY_HEADER];
  if (raw === undefined || raw.trim() === '') {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Idempotency-Key header is required.');
  }
  return raw.trim();
}

/** Map a write error code to an HTTP status. */
function facilityWriteAppErrorStatus(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.INVALID_INPUT:
      return 400;
    case ErrorCode.UNAUTHENTICATED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.PERMISSION_DENIED:
      return 403;
    case ErrorCode.FACILITY_NOT_FOUND:
    case ErrorCode.FACILITY_ORGANIZATION_NOT_FOUND:
      return 404;
    case ErrorCode.FACILITY_ALREADY_EXISTS:
      return 409;
    default:
      return 500;
  }
}

/** Translate any error into a safe HTTP result; unknown errors collapse to an opaque 500. */
export function facilityWriteErrorToHttpResult(
  err: unknown,
  requestId: string,
): FacilityReadHttpResult {
  if (err instanceof AppError) {
    return {
      status: facilityWriteAppErrorStatus(err.code),
      body: { status: 'error', code: err.code, message: err.message, requestId },
    };
  }
  return {
    status: 500,
    body: { status: 'error', code: 'INTERNAL', message: 'Internal server error.', requestId },
  };
}

/**
 * Handle `POST /v1/facilities` — create a facility.
 *
 * Flow: resolve identity (tenant from auth, never the body) → enforce `facility.write` → require
 * the `Idempotency-Key` header → validate the CLOSED create body (require client-supplied
 * `facilityId`, `organizationId`, `name`, `facilityType`; fail closed on an unknown enum) →
 * duplicate pre-check (409 on an existing id for the tenant) →
 * {@link FacilityRegistryService.createFacility} (which validates same-tenant organization
 * existence → 404) → project to the safe DTO. The service owns the transactional outbox; the
 * adapter enqueues nothing itself.
 */
export async function handleFacilityCreate(
  deps: FacilityWriteHttpDeps,
  req: FacilityCreateHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<FacilityReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveFacilityAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.FacilityWrite, telemetry);

    const idempotencyKey = requireIdempotencyKey(req.headers);

    const obj = asObjectBody(req.body);
    rejectUnknownKeys(obj, FACILITY_CREATE_BODY_KEYS, 'facility create');

    const facilityIdRaw = obj['facilityId'];
    if (typeof facilityIdRaw !== 'string' || facilityIdRaw.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'facilityId is required.');
    }
    const facilityId = facilityIdRaw.trim();

    const organizationIdRaw = obj['organizationId'];
    if (typeof organizationIdRaw !== 'string' || organizationIdRaw.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'organizationId is required.');
    }

    const nameRaw = obj['name'];
    if (typeof nameRaw !== 'string' || nameRaw.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'name is required.');
    }

    if (!isFacilityType(obj['facilityType'])) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `facilityType must be one of: ${FACILITY_TYPES.join(', ')}.`,
      );
    }

    const statusRaw = obj['status'];
    if (statusRaw !== undefined && !isFacilityStatus(statusRaw)) {
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `status must be one of: ${FACILITY_STATUSES.join(', ')}.`,
      );
    }

    // Duplicate pre-check: an existing id for THIS tenant is a deterministic 409 (the service would
    // otherwise treat it as an idempotent replay and never throw).
    const existing = await deps.readStore.getById(tenantId, facilityId);
    if (existing !== undefined) {
      throw new AppError(
        ErrorCode.FACILITY_ALREADY_EXISTS,
        'A facility with this id already exists.',
      );
    }

    const input: CreateFacilityInput = {
      tenantId,
      facilityId,
      organizationId: organizationIdRaw.trim(),
      name: nameRaw,
      facilityType: obj['facilityType'],
      ...(statusRaw !== undefined ? { status: statusRaw } : {}),
      ...(obj['addressLine1'] !== undefined ? { addressLine1: obj['addressLine1'] as string } : {}),
      ...(obj['addressLine2'] !== undefined ? { addressLine2: obj['addressLine2'] as string } : {}),
      ...(obj['locality'] !== undefined ? { locality: obj['locality'] as string } : {}),
      ...(obj['region'] !== undefined ? { region: obj['region'] as string } : {}),
      ...(obj['postalCode'] !== undefined ? { postalCode: obj['postalCode'] as string } : {}),
      ...(obj['countryCode'] !== undefined ? { countryCode: obj['countryCode'] as string } : {}),
      ...(obj['latitude'] !== undefined ? { latitude: obj['latitude'] as number } : {}),
      ...(obj['longitude'] !== undefined ? { longitude: obj['longitude'] as number } : {}),
      ...(obj['contactName'] !== undefined ? { contactName: obj['contactName'] as string } : {}),
      ...(obj['contactEmail'] !== undefined ? { contactEmail: obj['contactEmail'] as string } : {}),
      ...(obj['contactPhone'] !== undefined ? { contactPhone: obj['contactPhone'] as string } : {}),
      ...(obj['visibility'] !== undefined
        ? { visibility: obj['visibility'] as FacilityVisibility }
        : {}),
      ...(obj['capabilityTags'] !== undefined
        ? { capabilityTags: obj['capabilityTags'] as readonly string[] }
        : {}),
      correlationId: idempotencyKey,
      requestId,
    };

    const view = await deps.service.createFacility(input);

    const body: FacilityWriteResponseBody = {
      status: 'ok',
      facility: toFacilityDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'create',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 201, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'create',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return facilityWriteErrorToHttpResult(err, requestId);
  }
}

/**
 * Handle `PATCH /v1/facilities/:facilityId` — update a facility's safe descriptive fields.
 *
 * Flow: resolve identity → enforce `facility.write` → validate the CLOSED update body (`null`
 * clears, omitted leaves unchanged, a value sets; AT LEAST ONE field required; `status`,
 * `facilityType`, `organizationId`, and `facilityId` are rejected as unknown keys) →
 * {@link FacilityRegistryService.updateFacility} → project to the safe DTO. A missing or
 * cross-tenant facility returns 404 (never reveals cross-tenant existence). The service owns
 * field normalization and the transactional outbox.
 */
export async function handleFacilityUpdate(
  deps: FacilityWriteHttpDeps,
  req: FacilityUpdateHttpRequest,
  requestId: string = randomUUID(),
  resolver: AuthContextResolver = DEFAULT_DEMO_RESOLVER,
): Promise<FacilityReadHttpResult> {
  const telemetry = deps.telemetry ?? NOOP_TELEMETRY;
  try {
    const auth = await resolveFacilityAuth(resolver, req.headers);
    const tenantId = requireTenant(auth);
    assertAuthorized(auth, AuthorizationAction.FacilityWrite, telemetry);

    if (req.facilityId.trim() === '') {
      throw new AppError(ErrorCode.INVALID_INPUT, 'facilityId path parameter is required.');
    }
    const facilityId = req.facilityId.trim();

    const obj = asObjectBody(req.body);
    rejectUnknownKeys(obj, FACILITY_UPDATE_BODY_KEYS, 'facility update');
    if (Object.keys(obj).length === 0) {
      throw new AppError(ErrorCode.INVALID_INPUT, 'At least one updatable field is required.');
    }

    const input: UpdateFacilityInput = {
      tenantId,
      facilityId,
      ...('name' in obj ? { name: obj['name'] as string } : {}),
      ...('addressLine1' in obj ? { addressLine1: obj['addressLine1'] as string | null } : {}),
      ...('addressLine2' in obj ? { addressLine2: obj['addressLine2'] as string | null } : {}),
      ...('locality' in obj ? { locality: obj['locality'] as string | null } : {}),
      ...('region' in obj ? { region: obj['region'] as string | null } : {}),
      ...('postalCode' in obj ? { postalCode: obj['postalCode'] as string | null } : {}),
      ...('countryCode' in obj ? { countryCode: obj['countryCode'] as string | null } : {}),
      ...('latitude' in obj ? { latitude: obj['latitude'] as number | null } : {}),
      ...('longitude' in obj ? { longitude: obj['longitude'] as number | null } : {}),
      ...('contactName' in obj ? { contactName: obj['contactName'] as string | null } : {}),
      ...('contactEmail' in obj ? { contactEmail: obj['contactEmail'] as string | null } : {}),
      ...('contactPhone' in obj ? { contactPhone: obj['contactPhone'] as string | null } : {}),
      ...('visibility' in obj
        ? { visibility: obj['visibility'] as FacilityVisibility | null }
        : {}),
      ...('capabilityTags' in obj
        ? { capabilityTags: obj['capabilityTags'] as readonly string[] | null }
        : {}),
      requestId,
    };

    const view = await deps.service.updateFacility(input);

    const body: FacilityWriteResponseBody = {
      status: 'ok',
      facility: toFacilityDto(view),
      requestId,
    };
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'update',
      [TelemetryAttributeKeys.result]: TelemetryResult.success,
    });
    return { status: 200, body };
  } catch (err) {
    telemetry.incrementCounter(TelemetryCounters.facilityRegistryWrite, 1, {
      [TelemetryAttributeKeys.operation]: 'update',
      [TelemetryAttributeKeys.result]: TelemetryResult.failure,
    });
    return facilityWriteErrorToHttpResult(err, requestId);
  }
}
