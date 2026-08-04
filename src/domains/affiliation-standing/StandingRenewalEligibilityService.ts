/**
 * StandingRenewalEligibilityService — the server-derived answer to a representative's question:
 * "Can this standing be renewed, for which season, and can I start or resume the renewal?"
 *
 * This service is READ-ONLY. It NEVER mutates governed standing state and NEVER invokes the kernel
 * (renew / renew_active stay with the Governance Kernel and the segregated standing_renewal
 * authority). It composes the standing base read model ({@link StandingReviewService}) with:
 *  - the governed renewal-window policy (graceDays from the persisted guard binding — the SAME
 *    parameter the kernel guard uses, never a re-declared literal);
 *  - the governed season catalog (later, accepting target seasons by persisted dates);
 *  - the governed jurisdiction resolution (an organization with no resolving jurisdiction cannot
 *    initiate — mirroring new affiliation);
 *  - the existing renewal attribution link (an in-progress renewal).
 *
 * The result is a representative-SAFE projection ({@link StandingRenewalView}): it exposes a posture,
 * a generic reason code, the renewal pathway, and the selectable target seasons — never guard
 * names, transition ids, the grace-days value, role names, jurisdiction lineage, or DB internals.
 */

import type { SeasonLocale, SeasonPhase } from '../season-catalog/index.js';
import type { StandingReviewRecord } from './StandingReviewService.js';
import type { StandingRenewalPolicyReader } from './StandingRenewalPolicyReader.js';
import type { RenewalApplicationLinkReader } from './RenewalApplicationLinkStore.js';

const DAY_MS = 86_400_000;

/** Governed renewal posture for a standing. */
export type StandingRenewalPosture =
  | 'not_eligible'
  | 'eligible'
  | 'in_progress'
  | 'reconciliation_required';

/** The renewal pathway a representative would follow (never the new_affiliation pathway). */
export type StandingRenewalPathway = 'continuity' | 'renewal_with_remediation';

/** Representative-safe reason codes (generic; no governed-policy disclosure). */
export type StandingRenewalReasonCode =
  | 'renewal_window_not_open'
  | 'no_target_season'
  | 'jurisdiction_unavailable'
  | 'lifecycle_not_renewable'
  | 'lifecycle_reconciliation_required';

/** A selectable governed target season (representative-safe; no row ids/internal fields). */
export interface RenewalTargetSeasonView {
  readonly id: string;
  readonly label: string;
  readonly phase: SeasonPhase;
  readonly acceptingApplications: boolean;
}

/** The representative-safe standing-renewal projection. */
export interface StandingRenewalView {
  readonly posture: StandingRenewalPosture;
  readonly reasonCode?: StandingRenewalReasonCode;
  readonly pathway?: StandingRenewalPathway;
  readonly targetSeasons: readonly RenewalTargetSeasonView[];
  readonly renewalApplicationId?: string;
}

/** Narrow read port over the standing base read model (satisfied by {@link StandingReviewService}). */
export interface StandingRecordReader {
  getStanding(
    tenantId: string,
    standingId: string,
    organizationIds: readonly string[],
  ): Promise<StandingReviewRecord | undefined>;
}

/** Narrow read port over the governed season catalog target-season selection. */
export interface RenewalTargetSeasonReader {
  renewalTargetSeasons(
    tenantId: string,
    sourceSeasonId: string,
    nowIso: string,
    locale: SeasonLocale,
  ): Promise<readonly RenewalTargetSeasonView[]>;
}

/**
 * Governed jurisdiction gate: does the organization resolve to a governing jurisdiction right now?
 * Fails closed (false) on unresolved / ambiguous / broken hierarchy.
 */
export interface RenewalJurisdictionGate {
  resolves(tenantId: string, organizationId: string, nowIso: string): Promise<boolean>;
}

export interface StandingRenewalEligibilityDeps {
  readonly standing: StandingRecordReader;
  readonly policy: StandingRenewalPolicyReader;
  readonly seasons: RenewalTargetSeasonReader;
  readonly jurisdiction: RenewalJurisdictionGate;
  readonly links: RenewalApplicationLinkReader;
}

function view(
  posture: StandingRenewalPosture,
  extra: Omit<StandingRenewalView, 'posture' | 'targetSeasons'> & {
    targetSeasons?: readonly RenewalTargetSeasonView[];
  } = {},
): StandingRenewalView {
  return {
    posture,
    targetSeasons: extra.targetSeasons ?? [],
    ...(extra.reasonCode !== undefined ? { reasonCode: extra.reasonCode } : {}),
    ...(extra.pathway !== undefined ? { pathway: extra.pathway } : {}),
    ...(extra.renewalApplicationId !== undefined
      ? { renewalApplicationId: extra.renewalApplicationId }
      : {}),
  };
}

export class StandingRenewalEligibilityService {
  constructor(private readonly deps: StandingRenewalEligibilityDeps) {}

  /**
   * Evaluate renewal eligibility for a standing the representative is authorized to see. Returns
   * `undefined` when the standing does not exist for the tenant OR is outside the supplied
   * organization scope (the caller renders an opaque 404 — no existence disclosure).
   */
  async evaluate(input: {
    readonly tenantId: string;
    readonly standingId: string;
    readonly organizationIds: readonly string[];
    readonly nowIso: string;
    readonly locale?: SeasonLocale;
  }): Promise<StandingRenewalView | undefined> {
    const record = await this.deps.standing.getStanding(
      input.tenantId,
      input.standingId,
      input.organizationIds,
    );
    if (record === undefined) return undefined;
    return this.evaluateForRecord(input.tenantId, record, input.nowIso, input.locale ?? 'en');
  }

  /**
   * Evaluate renewal eligibility for an already-loaded, already-authorized standing record. The
   * initiation endpoint uses this after it has re-authorized the standing, so the posture it acts
   * on is derived from the SAME record it will attribute the renewal to.
   */
  async evaluateForRecord(
    tenantId: string,
    record: StandingReviewRecord,
    nowIso: string,
    locale: SeasonLocale = 'en',
  ): Promise<StandingRenewalView> {
    // An existing renewal attribution always takes precedence: the renewal is already underway.
    const links = await this.deps.links.findByStanding(tenantId, record.standingId);
    if (links.length > 0) {
      return view('in_progress', { renewalApplicationId: links[0]!.renewalApplicationId });
    }
    return this.evaluateLifecycle(tenantId, record, nowIso, locale);
  }

  private async evaluateLifecycle(
    tenantId: string,
    record: StandingReviewRecord,
    nowIso: string,
    locale: SeasonLocale,
  ): Promise<StandingRenewalView> {
    const nowMs = Date.parse(nowIso);
    const untilMs = Date.parse(record.effectiveUntil);

    if (record.lifecycleState === 'active') {
      if (!Number.isFinite(untilMs) || !Number.isFinite(nowMs)) {
        return view('not_eligible', { reasonCode: 'lifecycle_not_renewable' });
      }
      // Active but the clock has passed the effective end without a recorded expiry: the governed
      // lifecycle must be reconciled by the kernel before a renewal can start.
      if (nowMs >= untilMs) {
        return view('reconciliation_required', { reasonCode: 'lifecycle_reconciliation_required' });
      }
      const { graceDays } = await this.deps.policy.getRenewalPolicy();
      const windowOpensAt = untilMs - graceDays * DAY_MS;
      if (nowMs < windowOpensAt) {
        return view('not_eligible', { reasonCode: 'renewal_window_not_open' });
      }
      return this.eligibleOrGated(tenantId, record, nowIso, locale, 'continuity');
    }

    if (record.lifecycleState === 'lapsed') {
      return this.eligibleOrGated(tenantId, record, nowIso, locale, 'renewal_with_remediation');
    }

    // pending / suspended / terminated / unopened / anything else: not renewable by a representative.
    return view('not_eligible', { reasonCode: 'lifecycle_not_renewable' });
  }

  /** Final gate: requires ≥1 governed later accepting season AND a resolving jurisdiction. */
  private async eligibleOrGated(
    tenantId: string,
    record: StandingReviewRecord,
    nowIso: string,
    locale: SeasonLocale,
    pathway: StandingRenewalPathway,
  ): Promise<StandingRenewalView> {
    const targetSeasons = await this.deps.seasons.renewalTargetSeasons(
      tenantId,
      record.season,
      nowIso,
      locale,
    );
    if (targetSeasons.length === 0) {
      return view('not_eligible', { reasonCode: 'no_target_season' });
    }
    const jurisdictionResolves = await this.deps.jurisdiction.resolves(
      tenantId,
      record.organizationId,
      nowIso,
    );
    if (!jurisdictionResolves) {
      return view('not_eligible', { reasonCode: 'jurisdiction_unavailable' });
    }
    return view('eligible', { pathway, targetSeasons });
  }
}
