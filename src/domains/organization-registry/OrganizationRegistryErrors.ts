/**
 * Organization Registry boundary validation helpers.
 *
 * Hand-written, dependency-free validation (no schema library). All failures use the stable
 * {@link ErrorCode} contract so callers branch on `code`, never message text. Validation fails
 * CLOSED on the first problem and on any unknown enum value.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import {
  isOrganizationSource,
  isOrganizationStatus,
  isOrganizationType,
  type OrganizationSource,
  type OrganizationStatus,
  type OrganizationType,
} from './OrganizationTypes.js';

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

export function requireDisplayName(value: unknown): string {
  if (isBlank(value)) {
    fail('displayName is required.');
  }
  return (value as string).trim();
}

export function requireOrganizationType(value: unknown): OrganizationType {
  if (!isOrganizationType(value)) {
    fail(`organizationType is invalid; expected one of national|regional|local|external|applicant.`, {
      organizationType: value,
    });
  }
  return value;
}

export function requireOrganizationStatus(value: unknown): OrganizationStatus {
  if (!isOrganizationStatus(value)) {
    fail(`status is invalid; expected one of draft|active|suspended|archived.`, { status: value });
  }
  return value;
}

export function requireOrganizationSource(value: unknown): OrganizationSource {
  if (!isOrganizationSource(value)) {
    fail(`source is invalid; expected one of manual|affiliation_application|import|system.`, {
      source: value,
    });
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

export function organizationNotFound(organizationId: string): AppError {
  return new AppError(ErrorCode.ORGANIZATION_NOT_FOUND, 'Organization not found for tenant.', {
    details: { organizationId },
  });
}

export function organizationParentNotFound(parentOrganizationId: string): AppError {
  return new AppError(
    ErrorCode.ORGANIZATION_PARENT_NOT_FOUND,
    'Parent organization not found for tenant (parents must belong to the same tenant).',
    { details: { parentOrganizationId } },
  );
}

export function organizationParentCycle(organizationId: string, parentOrganizationId: string): AppError {
  return new AppError(
    ErrorCode.ORGANIZATION_PARENT_CYCLE,
    'Parent relationship would introduce a hierarchy cycle.',
    { details: { organizationId, parentOrganizationId } },
  );
}

export function organizationSourceReferenceRequired(message: string): AppError {
  return new AppError(ErrorCode.ORGANIZATION_SOURCE_REFERENCE_REQUIRED, message);
}
