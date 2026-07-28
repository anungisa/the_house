/**
 * Representative-safe DTOs for the Button club-affiliation DRAFT experience (Slice C).
 *
 * These are the ONLY shapes crossing the Button boundary. They deliberately carry the
 * minimum-necessary data: no raw database rows, no governed lifecycle internals, no other actor's
 * private data, no restricted evidence filenames beyond a safe display name, no internal policy
 * facts. Every field is derived and rebuildable.
 *
 * Key distinctions preserved by design (see completeness computation):
 *   requirement displayed ≠ applicable · answered ≠ satisfied · evidence uploaded ≠ associated ≠
 *   accepted · draft saved ≠ transition executed · all-complete ≠ submitted.
 */

import type { RequirementResponseType } from './RequirementCatalog.js';

/** Per-requirement working posture. `complete` is the server's satisfied determination. */
export type RequirementStatus =
  | 'blocked'
  | 'not_started'
  | 'in_progress'
  | 'evidence_required'
  | 'answered'
  | 'evidence_associated';

/** A representative-safe reference to an associated evidence payload (never bytes / storage path). */
export interface DraftEvidenceLinkView {
  readonly linkId: string;
  readonly requirementCode: string;
  readonly evidenceObjectId: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly displayName?: string;
  readonly associatedAt: string;
}

/** One bound requirement projected for the representative, with its version, response, status. */
export interface RequirementView {
  readonly code: string;
  readonly version: number;
  readonly responseType: RequirementResponseType;
  readonly evidenceRequired: boolean;
  readonly titleEn: string;
  readonly guidanceEn: string;
  readonly titleFr: string;
  readonly guidanceFr: string;
  readonly appliesBecause: string;
  /** Opaque structured response value (interpreted by responseType); {} when unanswered. */
  readonly response: Record<string, unknown>;
  readonly evidence: readonly DraftEvidenceLinkView[];
  readonly status: RequirementStatus;
  /** Server-derived: the House considers this requirement satisfied for the draft. */
  readonly complete: boolean;
  /** Requirement codes that must be complete first (empty when none). */
  readonly blockedBy: readonly string[];
}

/** Server-derived completeness summary for the whole application. */
export interface CompletenessSummary {
  readonly totalApplicable: number;
  readonly completedCount: number;
  readonly unresolvedBlockers: readonly string[];
  readonly requiredNextActions: readonly string[];
  /** Whether the draft is eligible for a FUTURE submission action (Slice D). Never submits here. */
  readonly eligibleForSubmission: boolean;
}

/** The lifecycle status label a representative may see (pre-submission is always `draft`). */
export type AffiliationLifecycleStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'active'
  | 'suspended'
  | 'rejected'
  | 'revoked'
  | 'closed'
  | 'archived';

/** Full representative-safe projection of one application returned by the detail endpoint. */
export interface AffiliationApplicationProjection {
  readonly applicationId: string;
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway: string;
  readonly lifecycleStatus: AffiliationLifecycleStatus;
  /** Optimistic-concurrency token (the draft head version) for If-Match on draft writes. */
  readonly concurrencyToken: string;
  readonly lastSavedAt: string;
  readonly requirements: readonly RequirementView[];
  readonly completeness: CompletenessSummary;
}

/** Overview shown before opening a specific application (begin vs resume). */
export interface AffiliationOverview {
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway: string;
  /** The current draft application for this org+season, or null when none exists yet. */
  readonly application: {
    readonly applicationId: string;
    readonly lifecycleStatus: AffiliationLifecycleStatus;
    readonly lastSavedAt: string;
    readonly completeness: CompletenessSummary;
  } | null;
  /** True when the representative may initiate a new application for this org+season. */
  readonly canInitiate: boolean;
}
