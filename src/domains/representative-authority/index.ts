/**
 * Governed representative authority — public barrel.
 *
 * The tenant-isolated, persisted, time-aware House authority source. A trusted identity IDENTIFIES
 * the actor; authority exists ONLY when a governed grant is persisted, in-window, and un-revoked.
 */

export {
  CLUB_AFFILIATION_REPRESENTATIVE_AUTHORITY_TYPE,
  HOUSE_TRUSTED_ISSUER,
  type EffectiveAuthority,
  type EffectiveAuthorityStatus,
  type IdentitySubjectRecord,
  type IdentitySubjectStatus,
  type RepresentativeAuthorityRecord,
  type RepresentativeAuthorityType,
  type RepresentativeAuthorityView,
  type ResolvedEffectiveState,
  type StoredAuthorityStatus,
} from './RepresentativeAuthorityTypes.js';

export {
  resolveEffectiveAuthorities,
  resolveEffectiveState,
} from './effectiveStatus.js';

export {
  AUTHORITY_GRANTED_MESSAGE_TYPE,
  AUTHORITY_REVOKED_MESSAGE_TYPE,
  authorityGrantedDedupeKey,
  authorityRevokedDedupeKey,
  type AuthorityCommandMeta,
  type GrantAuthorityCommand,
  type GrantAuthorityOutcome,
  type RepresentativeAuthorityStore,
  type RevokeAuthorityCommand,
  type RevokeAuthorityOutcome,
} from './RepresentativeAuthorityStore.js';

export {
  AUTHORITY_OUTBOX_MAX_RETRIES,
  PgRepresentativeAuthorityStore,
} from './PgRepresentativeAuthorityStore.js';

export { RepresentativeAuthorityService } from './RepresentativeAuthorityService.js';
