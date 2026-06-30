/**
 * Participant Registry boundary validation helpers.
 *
 * Hand-written, dependency-free validation (no schema library). All failures use the stable
 * {@link ErrorCode} contract so callers branch on `code`, never message text. Validation fails
 * CLOSED on the first problem and on any unknown enum value.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import {
  isParticipantStatus,
  isRelationshipStatus,
  isRelationshipType,
  type ParticipantExternalRef,
  type ParticipantStatus,
  type RelationshipStatus,
  type RelationshipType,
} from './ParticipantTypes.js';

/**
 * Conservative email syntax check. Deliberately strict-but-simple: a single `@`, a non-empty
 * local part, and a domain with at least one dot and no whitespace. This is a boundary guard,
 * not a deliverability check.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function requireParticipantId(value: unknown): string {
  if (isBlank(value)) {
    fail('participantId is required.');
  }
  return (value as string).trim();
}

export function requireRelationshipId(value: unknown): string {
  if (isBlank(value)) {
    fail('relationshipId is required.');
  }
  return (value as string).trim();
}

export function requireOrganizationId(value: unknown): string {
  if (isBlank(value)) {
    fail('organizationId is required.');
  }
  return (value as string).trim();
}

export function requireDisplayName(value: unknown): string {
  if (isBlank(value)) {
    fail('displayName is required.');
  }
  return (value as string).trim();
}

export function requireParticipantStatus(value: unknown): ParticipantStatus {
  if (!isParticipantStatus(value)) {
    fail('status is invalid; expected one of draft|active|suspended|archived.', { status: value });
  }
  return value;
}

export function requireRelationshipType(value: unknown): RelationshipType {
  if (!isRelationshipType(value)) {
    fail('relationshipType is invalid; expected one of member|staff|volunteer|official|contact|other.', {
      relationshipType: value,
    });
  }
  return value;
}

export function requireRelationshipStatus(value: unknown): RelationshipStatus {
  if (!isRelationshipStatus(value)) {
    fail('status is invalid; expected one of active|suspended|ended.', { status: value });
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

/**
 * Normalize an optional contact email. Returns undefined when absent. When present, the value
 * is trimmed + lowercased and must satisfy a conservative syntax check; otherwise it fails
 * CLOSED with {@link ErrorCode.PARTICIPANT_INVALID_EMAIL}.
 */
export function optionalEmail(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(ErrorCode.PARTICIPANT_INVALID_EMAIL, 'email must be a non-empty string when provided.');
  }
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized)) {
    throw new AppError(ErrorCode.PARTICIPANT_INVALID_EMAIL, 'email is not a valid address.', {
      details: { email: normalized },
    });
  }
  return normalized;
}

/** Optional ISO date (YYYY-MM-DD) normalizer. Returns undefined when absent, fails when malformed. */
export function optionalIsoDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    fail(`${field} must be an ISO date (YYYY-MM-DD) when provided.`, { [field]: value });
  }
  return (value as string).trim();
}

/**
 * Validate and normalize an optional set of external references. Each entry requires a
 * non-blank `provider` and `externalId`; duplicate `(provider, externalId)` pairs within the
 * same participant fail CLOSED. Returns undefined when absent.
 */
export function optionalExternalRefs(value: unknown): readonly ParticipantExternalRef[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    fail('externalRefs must be an array when provided.');
  }
  const seen = new Set<string>();
  const refs: ParticipantExternalRef[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) {
      fail('externalRefs entries must be objects with provider and externalId.');
    }
    const record = entry as Record<string, unknown>;
    if (isBlank(record['provider'])) {
      fail('externalRefs[].provider is required.');
    }
    if (isBlank(record['externalId'])) {
      fail('externalRefs[].externalId is required.');
    }
    const provider = (record['provider'] as string).trim();
    const externalId = (record['externalId'] as string).trim();
    const key = `${provider}\u0000${externalId}`;
    if (seen.has(key)) {
      fail('externalRefs contains a duplicate (provider, externalId) pair.', { provider, externalId });
    }
    seen.add(key);
    refs.push({ provider, externalId });
  }
  return refs;
}

export function participantNotFound(participantId: string): AppError {
  return new AppError(ErrorCode.PARTICIPANT_NOT_FOUND, 'Participant not found for tenant.', {
    details: { participantId },
  });
}

export function organizationNotFoundForLink(organizationId: string): AppError {
  return new AppError(
    ErrorCode.ORGANIZATION_NOT_FOUND,
    'Organization not found for tenant (relationships must reference a same-tenant organization).',
    { details: { organizationId } },
  );
}

export function archivedParticipantCannotLink(participantId: string): AppError {
  return new AppError(
    ErrorCode.PARTICIPANT_ARCHIVED_NO_ACTIVE_LINK,
    'An archived participant cannot receive a new active organization relationship.',
    { details: { participantId } },
  );
}

export function organizationParticipantNotFound(relationshipId: string): AppError {
  return new AppError(
    ErrorCode.ORGANIZATION_PARTICIPANT_NOT_FOUND,
    'Organization-participant relationship not found for tenant.',
    { details: { relationshipId } },
  );
}
