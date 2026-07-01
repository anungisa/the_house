/**
 * Facility Registry boundary validation helpers.
 *
 * Hand-written, dependency-free validation (no schema library). All failures use the stable
 * {@link ErrorCode} contract so callers branch on `code`, never message text. Validation fails
 * CLOSED on the first problem and on any unknown enum value.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import {
  isFacilityStatus,
  isFacilityType,
  isFacilityVisibility,
  type FacilityStatus,
  type FacilityType,
  type FacilityVisibility,
} from './FacilityTypes.js';

/**
 * Conservative email syntax check. Deliberately strict-but-simple: a single `@`, a non-empty
 * local part, and a domain with at least one dot and no whitespace. This is a boundary guard, not
 * a deliverability check.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Conservative ISO 3166-1 alpha-2 shape check (two ASCII letters). */
const COUNTRY_CODE_PATTERN = /^[A-Za-z]{2}$/;

/** Upper bound on the number of capability tags on a single facility record. */
const MAX_CAPABILITY_TAGS = 32;

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

function fail(message: string, details?: Record<string, unknown>): never {
  throw new AppError(
    ErrorCode.INVALID_INPUT,
    message,
    details !== undefined ? { details } : undefined,
  );
}

export function requireTenantId(value: unknown): string {
  if (isBlank(value)) {
    fail('tenantId is required.');
  }
  return (value as string).trim();
}

export function requireFacilityId(value: unknown): string {
  if (isBlank(value)) {
    fail('facilityId is required.');
  }
  return (value as string).trim();
}

export function requireOrganizationId(value: unknown): string {
  if (isBlank(value)) {
    fail('organizationId is required.');
  }
  return (value as string).trim();
}

export function requireName(value: unknown): string {
  if (isBlank(value)) {
    fail('name is required.');
  }
  return (value as string).trim();
}

export function requireFacilityType(value: unknown): FacilityType {
  if (!isFacilityType(value)) {
    fail('facilityType is invalid; expected one of venue|training_site|office|storage_site|partner_site|other.', {
      facilityType: value,
    });
  }
  return value;
}

export function requireFacilityStatus(value: unknown): FacilityStatus {
  if (!isFacilityStatus(value)) {
    fail('status is invalid; expected one of draft|active|inactive|archived.', { status: value });
  }
  return value;
}

/** Optional non-blank string normalizer. Returns undefined when absent, fails when blank-but-present. */
export function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (isBlank(value)) {
    fail(`${field} must be a non-empty string when provided.`);
  }
  return (value as string).trim();
}

/** Optional visibility normalizer. Returns undefined when absent; fails closed on unknown value. */
export function optionalVisibility(value: unknown): FacilityVisibility | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isFacilityVisibility(value)) {
    fail('visibility is invalid; expected one of internal|public.', { visibility: value });
  }
  return value;
}

/** Optional ISO 3166-1 alpha-2 country code normalizer (uppercased). */
export function optionalCountryCode(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !COUNTRY_CODE_PATTERN.test(value.trim())) {
    fail('countryCode must be a 2-letter ISO 3166-1 alpha-2 code when provided.', {
      countryCode: value,
    });
  }
  return value.trim().toUpperCase();
}

/**
 * Normalize an optional contact email. Returns undefined when absent. When present, the value is
 * trimmed + lowercased and must satisfy a conservative syntax check; otherwise it fails CLOSED.
 */
export function optionalEmail(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${field} must be a non-empty string when provided.`);
  }
  const normalized = (value as string).trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    fail(`${field} is not a valid address.`, { [field]: normalized });
  }
  return normalized;
}

/** Optional latitude normalizer. Must be a finite number within [-90, 90]. */
export function optionalLatitude(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -90 || value > 90) {
    fail('latitude must be a finite number within [-90, 90] when provided.', { latitude: value });
  }
  return value;
}

/** Optional longitude normalizer. Must be a finite number within [-180, 180]. */
export function optionalLongitude(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -180 || value > 180) {
    fail('longitude must be a finite number within [-180, 180] when provided.', {
      longitude: value,
    });
  }
  return value;
}

/**
 * Validate and normalize an optional set of capability tags. Each entry must be a non-blank
 * string; entries are trimmed and de-duplicated; the count is bounded. Returns undefined when
 * absent.
 */
export function optionalCapabilityTags(value: unknown): readonly string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    fail('capabilityTags must be an array when provided.');
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value as unknown[]) {
    if (isBlank(entry)) {
      fail('capabilityTags entries must be non-empty strings.');
    }
    const tag = (entry as string).trim();
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  if (tags.length > MAX_CAPABILITY_TAGS) {
    fail(`capabilityTags may contain at most ${MAX_CAPABILITY_TAGS} entries.`, {
      count: tags.length,
    });
  }
  return tags;
}

export function facilityNotFound(facilityId: string): AppError {
  return new AppError(ErrorCode.FACILITY_NOT_FOUND, 'Facility not found for tenant.', {
    details: { facilityId },
  });
}

export function facilityOrganizationNotFound(organizationId: string): AppError {
  return new AppError(
    ErrorCode.FACILITY_ORGANIZATION_NOT_FOUND,
    'Organization not found for tenant (a facility must reference a same-tenant organization).',
    { details: { organizationId } },
  );
}
