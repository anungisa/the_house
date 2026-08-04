/**
 * StandingRenewalPolicyReader — the SINGLE source of the renewal-window grace parameter.
 *
 * The renewal grace window (how far BEFORE a standing's effective end date an active standing may
 * begin an early renewal) is a governed policy: it lives on the persisted binding of the
 * `STANDING_RENEWAL_WINDOW_OPEN` guard to the `renew_active` transition of the AffiliationStanding
 * state machine (governance.transition_guard.parameters -> graceDays). The Governance Kernel's
 * guard reads it there at transition time.
 *
 * The Button's renewal ELIGIBILITY view must answer "is this standing inside the renewal window?"
 * using the EXACT SAME parameter — never a literal `30` re-declared in an adapter or the frontend.
 * This reader obtains graceDays from the governed binding so Button eligibility policy IS the
 * Kernel renewal policy. If the binding is missing (a misconfigured system), it FAILS CLOSED by
 * throwing — eligibility must not invent a window.
 *
 * The governance policy tables (state_machine, transition_definition, transition_guard) are GLOBAL
 * reference data (tenant_id IS NULL, no RLS), so this reader needs no tenant context.
 */

import { queryRaw } from '../../db/pool.js';
import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import { AFFILIATION_STANDING_ENTITY_TYPE } from './index.js';

/** The governed renewal-window policy, sourced from the persisted guard binding. */
export interface StandingRenewalPolicy {
  /** Days before `effective_until` that the early-renewal window opens (from graceDays binding). */
  readonly graceDays: number;
}

/** Read-only port exposing the governed renewal-window policy. */
export interface StandingRenewalPolicyReader {
  getRenewalPolicy(): Promise<StandingRenewalPolicy>;
}

/** The governed trigger + guard whose binding parameter defines the renewal window. */
const RENEW_ACTIVE_TRIGGER = 'renew_active';
const RENEWAL_WINDOW_GUARD = 'STANDING_RENEWAL_WINDOW_OPEN';

/**
 * PostgreSQL reader: obtains graceDays from the persisted renew_active /
 * STANDING_RENEWAL_WINDOW_OPEN binding on the latest AffiliationStanding state machine.
 */
export class PgStandingRenewalPolicyReader implements StandingRenewalPolicyReader {
  async getRenewalPolicy(): Promise<StandingRenewalPolicy> {
    const rows = await queryRaw<{ grace_days: string | null }>(
      `SELECT tg.parameters ->> 'graceDays' AS grace_days
         FROM governance.state_machine sm
         JOIN governance.transition_definition td ON td.state_machine_id = sm.id
         JOIN governance.transition_guard tg ON tg.transition_definition_id = td.id
        WHERE sm.entity_type = $1
          AND td.trigger = $2
          AND tg.guard_code = $3
        ORDER BY sm.version DESC
        LIMIT 1`,
      [AFFILIATION_STANDING_ENTITY_TYPE, RENEW_ACTIVE_TRIGGER, RENEWAL_WINDOW_GUARD],
    );

    const raw = rows[0]?.grace_days;
    const graceDays = raw === null || raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    if (!Number.isFinite(graceDays) || graceDays < 0) {
      throw new AppError(
        ErrorCode.CONFIG_ERROR,
        'Standing renewal policy is unavailable: the renew_active / STANDING_RENEWAL_WINDOW_OPEN ' +
          'binding does not define a valid graceDays parameter.',
      );
    }
    return { graceDays };
  }
}

/** In-memory reader for unit tests (mirrors the governed binding parameter). */
export class InMemoryStandingRenewalPolicyReader implements StandingRenewalPolicyReader {
  constructor(private readonly policy: StandingRenewalPolicy) {}
  getRenewalPolicy(): Promise<StandingRenewalPolicy> {
    return Promise.resolve(this.policy);
  }
}
