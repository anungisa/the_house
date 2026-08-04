/**
 * Governed representative authority — domain types.
 *
 * The representative authority source is a tenant-isolated, persisted, time-aware record of who
 * may act as a representative for which organization. A trusted authentication subject IDENTIFIES
 * the actor; it never, by itself, creates authority. Authority exists ONLY when a governed grant
 * says so, is within its validity window, and has not been revoked.
 *
 * The stored `status` carries only the mutation-driven state ('active' | 'revoked'); the EFFECTIVE
 * status the Button consumes ('active' | 'expired' | 'revoked') is DERIVED at read time from the
 * stored status + validity interval + current time (see effectiveStatus.ts). A future-dated grant
 * is not yet in effect.
 *
 * NSO-GENERIC: every field here is sport-agnostic.
 */

/** The single representative authority type supported in this increment. */
export const CLUB_AFFILIATION_REPRESENTATIVE_AUTHORITY_TYPE = 'club_affiliation_representative';
export type RepresentativeAuthorityType = typeof CLUB_AFFILIATION_REPRESENTATIVE_AUTHORITY_TYPE;

/**
 * The default trusted-identity issuer that names a subject when the edge auth context does not
 * carry an explicit issuer. Grants and lookups agree on this constant so that (tenant, issuer,
 * externalSubject) is a stable identity key. It is NEVER an email or display name.
 */
export const HOUSE_TRUSTED_ISSUER = 'house.trusted';

/** The AUTHORITATIVE, mutation-driven stored status (never 'expired' — that is derived). */
export type StoredAuthorityStatus = 'active' | 'revoked';

/** The EFFECTIVE status resolved for the Button (identical to the ButtonContext AuthorityStatus). */
export type EffectiveAuthorityStatus = 'active' | 'expired' | 'revoked';

/**
 * The internal resolved state, including the non-contract 'pending' (future-dated) marker. A
 * 'pending' grant is NOT surfaced to the Button as a representative capability.
 */
export type ResolvedEffectiveState = EffectiveAuthorityStatus | 'pending';

/** The status of a tenant-scoped identity-provider account linkage. */
export type IdentitySubjectStatus = 'active' | 'unlinked';

/** A tenant-scoped identity-provider account linkage (issuer + subject is the sole lookup key). */
export interface IdentitySubjectRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly issuer: string;
  readonly externalSubject: string;
  readonly participantId?: string;
  readonly status: IdentitySubjectStatus;
  readonly source: string;
  readonly linkedAt: string;
  readonly unlinkedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The governed representative authority head (aggregate) as stored. */
export interface RepresentativeAuthorityRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly identitySubjectId: string;
  readonly organizationId: string;
  readonly authorityType: RepresentativeAuthorityType;
  readonly status: StoredAuthorityStatus;
  readonly validFrom: string;
  readonly validUntil?: string;
  readonly issuedBy: string;
  readonly issuedAt: string;
  readonly revokedBy?: string;
  readonly revokedAt?: string;
  readonly revocationReasonCode?: string;
  readonly sourceReference: string;
  readonly idempotencyKey: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A resolved, representative-SAFE authority projection: the organization the authority is over and
 * its effective status/validity. It NEVER carries the issuer, external subject, identity-subject id,
 * revocation internals, or any audit lineage — those are internal to the authority source.
 */
export interface EffectiveAuthority {
  readonly organizationId: string;
  readonly status: EffectiveAuthorityStatus;
  /** ISO-8601 expiry when the authority is time-bounded; omitted when open-ended. */
  readonly validUntil?: string;
}

/** A representative-safe read of a single authority head (no identity/audit internals). */
export interface RepresentativeAuthorityView {
  readonly authorityId: string;
  readonly organizationId: string;
  readonly authorityType: RepresentativeAuthorityType;
  /** Resolved effective state (may be 'pending' for a future-dated grant in an admin read). */
  readonly status: ResolvedEffectiveState;
  readonly validFrom: string;
  readonly validUntil?: string;
  readonly version: number;
}
