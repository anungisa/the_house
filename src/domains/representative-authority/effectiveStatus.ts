/**
 * Pure effective-status resolution for representative authority.
 *
 * The stored `status` is only 'active' | 'revoked'. The EFFECTIVE status the Button consumes is
 * DERIVED from the stored status + validity interval + current time, WITHOUT any background
 * mutation:
 *
 *   stored 'revoked'                      -> 'revoked'   (stops granting capability immediately)
 *   stored 'active' & now < validFrom     -> 'pending'   (future grant — NOT yet in effect)
 *   stored 'active' & validUntil <= now   -> 'expired'   (lapsed without mutation)
 *   stored 'active' otherwise             -> 'active'
 *
 * 'pending' is an internal marker only: a future-dated grant is surfaced to NO representative
 * capability and is NOT part of the 3-status Button contract, so the provider OMITS it.
 */

import type {
  EffectiveAuthority,
  EffectiveAuthorityStatus,
  RepresentativeAuthorityRecord,
  ResolvedEffectiveState,
} from './RepresentativeAuthorityTypes.js';

/** Resolve one authority record's effective state against `nowIso` (no mutation). */
export function resolveEffectiveState(
  record: Pick<RepresentativeAuthorityRecord, 'status' | 'validFrom' | 'validUntil'>,
  nowIso: string,
): ResolvedEffectiveState {
  if (record.status === 'revoked') return 'revoked';
  const nowMs = Date.parse(nowIso);
  const fromMs = Date.parse(record.validFrom);
  if (Number.isFinite(fromMs) && nowMs < fromMs) return 'pending';
  if (record.validUntil !== undefined) {
    const untilMs = Date.parse(record.validUntil);
    if (Number.isFinite(untilMs) && nowMs >= untilMs) return 'expired';
  }
  return 'active';
}

/** Strength ordering so duplicate rows for one organization can never widen authority. */
const STRENGTH: Record<EffectiveAuthorityStatus, number> = {
  active: 3,
  expired: 2,
  revoked: 1,
};

/**
 * Resolve a set of authority records for one subject into at most ONE representative-safe
 * {@link EffectiveAuthority} per organization. Future-dated ('pending') grants are omitted. When a
 * subject has multiple observable records for the same organization, the STRONGEST effective status
 * wins (active > expired > revoked) — but never beyond what a single record grants (an active-grant
 * uniqueness rule guarantees at most one live grant per subject+org+type at the database level).
 */
export function resolveEffectiveAuthorities(
  records: readonly RepresentativeAuthorityRecord[],
  nowIso: string,
): readonly EffectiveAuthority[] {
  const byOrg = new Map<string, EffectiveAuthority>();
  for (const record of records) {
    const state = resolveEffectiveState(record, nowIso);
    if (state === 'pending') continue;
    const candidate: EffectiveAuthority = {
      organizationId: record.organizationId,
      status: state,
      ...(state === 'active' && record.validUntil !== undefined
        ? { validUntil: record.validUntil }
        : {}),
    };
    const existing = byOrg.get(record.organizationId);
    if (existing === undefined || STRENGTH[state] > STRENGTH[existing.status]) {
      byOrg.set(record.organizationId, candidate);
    }
  }
  return [...byOrg.values()];
}
