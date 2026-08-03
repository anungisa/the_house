/**
 * Representative authority store port + command/outcome shapes + stable dedupe keys.
 *
 * The store owns the transactional write path: it persists the authority head, appends the
 * append-only authority event, writes the governance audit event, and enqueues the transactional
 * outbox message — all inside ONE tenant-scoped transaction. Business validation and error mapping
 * live in {@link RepresentativeAuthorityService}; the store reports a deterministic outcome.
 */

import type { OutboxCorrelation } from '../participant-registry/ParticipantRegistryStore.js';
import type {
  IdentitySubjectRecord,
  RepresentativeAuthorityRecord,
  RepresentativeAuthorityType,
} from './RepresentativeAuthorityTypes.js';

export const AUTHORITY_GRANTED_MESSAGE_TYPE = 'authority.representative.granted';
export const AUTHORITY_REVOKED_MESSAGE_TYPE = 'authority.representative.revoked';

/** Stable grant dedupe key (idempotency-key scoped: retries of one grant collapse). */
export function authorityGrantedDedupeKey(idempotencyKey: string): string {
  return `${AUTHORITY_GRANTED_MESSAGE_TYPE}:${idempotencyKey}`;
}

/** Stable revoke dedupe key (idempotency-key scoped: retries of one revoke collapse). */
export function authorityRevokedDedupeKey(idempotencyKey: string): string {
  return `${AUTHORITY_REVOKED_MESSAGE_TYPE}:${idempotencyKey}`;
}

/** Metadata carried onto audit/outbox lineage for a command. */
export type AuthorityCommandMeta = {
  readonly actorUserId?: string;
} & OutboxCorrelation;

/** A governed grant command (creates or replays an active representative authority). */
export interface GrantAuthorityCommand {
  readonly tenantId: string;
  /** Trusted identity issuer that names the subject (never email/display name). */
  readonly issuer: string;
  /** The issuer-scoped subject identifier for the actor (never email/display name). */
  readonly externalSubject: string;
  /** Optional participant linkage for the identity subject. */
  readonly participantId?: string;
  readonly organizationId: string;
  readonly authorityType: RepresentativeAuthorityType;
  /** Grant becomes effective at/after this instant (defaults to now at the DB when omitted). */
  readonly validFrom?: string;
  /** Optional expiry; when set the grant lapses (derived 'expired') at/after this instant. */
  readonly validUntil?: string;
  readonly issuedBy: string;
  readonly sourceReference: string;
  readonly idempotencyKey: string;
  readonly meta?: AuthorityCommandMeta;
}

export type GrantAuthorityOutcome =
  | { readonly outcome: 'granted'; readonly record: RepresentativeAuthorityRecord }
  | { readonly outcome: 'replayed'; readonly record: RepresentativeAuthorityRecord }
  | { readonly outcome: 'conflict'; readonly record: RepresentativeAuthorityRecord };

/** A governed revoke command (terminates a live authority; idempotent once revoked). */
export interface RevokeAuthorityCommand {
  readonly tenantId: string;
  readonly authorityId: string;
  readonly revokedBy: string;
  readonly revocationReasonCode?: string;
  /** Optional optimistic-concurrency guard against the head version. */
  readonly expectedVersion?: number;
  readonly idempotencyKey: string;
  readonly meta?: AuthorityCommandMeta;
}

export type RevokeAuthorityOutcome =
  | { readonly outcome: 'revoked'; readonly record: RepresentativeAuthorityRecord }
  | { readonly outcome: 'replayed'; readonly record: RepresentativeAuthorityRecord }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'version_conflict'; readonly record: RepresentativeAuthorityRecord };

/**
 * Persistence port for the representative authority source. All reads and writes are tenant-scoped
 * and RLS-enforced; cross-tenant rows simply do not resolve.
 */
export interface RepresentativeAuthorityStore {
  /** Create or idempotently replay a governed active grant. */
  grant(command: GrantAuthorityCommand): Promise<GrantAuthorityOutcome>;

  /** Revoke a live authority (idempotent once revoked). */
  revoke(command: RevokeAuthorityCommand): Promise<RevokeAuthorityOutcome>;

  /** Read a single authority head by id (tenant-scoped). */
  getAuthorityById(
    tenantId: string,
    authorityId: string,
  ): Promise<RepresentativeAuthorityRecord | undefined>;

  /**
   * List every authority head observable for a trusted identity subject, keyed on
   * (tenant, issuer, externalSubject) with an ACTIVE identity linkage. An unlinked identity
   * resolves to no authority. Effective status is derived by the caller.
   */
  listAuthoritiesForSubject(
    tenantId: string,
    issuer: string,
    externalSubject: string,
    authorityType: RepresentativeAuthorityType,
  ): Promise<readonly RepresentativeAuthorityRecord[]>;

  /** Read a tenant-scoped identity subject linkage (for admin/read paths). */
  getIdentitySubject(
    tenantId: string,
    issuer: string,
    externalSubject: string,
  ): Promise<IdentitySubjectRecord | undefined>;
}
