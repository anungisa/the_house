/**
 * Server-derived completeness projection for an affiliation draft.
 *
 * Pure and deterministic. The House — never the browser — decides whether a requirement is
 * satisfied. This preserves the required distinctions: a saved response is `answered`, not
 * automatically satisfied; an evidence-required requirement is only complete once evidence is
 * ASSOCIATED (which is still not ACCEPTANCE); and all-complete is NOT submitted (submission is a
 * governed action delivered in Slice D).
 *
 * Requirement DEPENDENCIES are bounded policy expressed in typed code (NOT a dynamic rule engine):
 * a requirement is `blocked` until each of its prerequisite requirement codes is complete.
 */

import type { ApplicableRequirement } from './RequirementCatalog.js';
import type {
  CompletenessSummary,
  DraftEvidenceLinkView,
  RequirementStatus,
  RequirementView,
} from './AffiliationDraftTypes.js';

/**
 * Bounded prerequisite policy: a requirement code is blocked until every listed code is complete.
 * Prerequisites that are not applicable to the application are ignored (cannot block on absence).
 */
export const REQUIREMENT_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  INSURANCE_CONFIRMATION: ['GOVERNING_DOCUMENT'],
};

/** Inputs the projection needs, keyed by requirement code. */
export interface CompletenessInputs {
  readonly applicable: readonly ApplicableRequirement[];
  readonly responses: ReadonlyMap<string, Record<string, unknown>>;
  readonly evidence: ReadonlyMap<string, readonly DraftEvidenceLinkView[]>;
}

/** A non-empty response object counts as "answered". */
function isAnswered(response: Record<string, unknown> | undefined): boolean {
  return response !== undefined && Object.keys(response).length > 0;
}

/** Base status ignoring blocked dependencies. */
function baseStatus(
  evidenceRequired: boolean,
  answered: boolean,
  hasEvidence: boolean,
): RequirementStatus {
  if (evidenceRequired) {
    if (answered && hasEvidence) return 'evidence_associated';
    if (answered && !hasEvidence) return 'evidence_required';
    if (!answered && hasEvidence) return 'in_progress';
    return 'not_started';
  }
  if (answered) return 'answered';
  return 'not_started';
}

/** True when a base status represents a satisfied requirement. */
function isCompleteStatus(status: RequirementStatus): boolean {
  return status === 'answered' || status === 'evidence_associated';
}

/**
 * Compute the per-requirement views + the application completeness summary from the bound
 * requirements, saved responses, and associated evidence. Deterministic; no side effects.
 */
export function computeCompleteness(inputs: CompletenessInputs): {
  readonly requirements: readonly RequirementView[];
  readonly completeness: CompletenessSummary;
} {
  const applicableCodes = new Set(inputs.applicable.map((a) => a.definition.code));

  // Pass 1: base status/complete ignoring dependencies.
  const base = new Map<string, { status: RequirementStatus; complete: boolean }>();
  for (const { definition } of inputs.applicable) {
    const answered = isAnswered(inputs.responses.get(definition.code));
    const links = inputs.evidence.get(definition.code) ?? [];
    const status = baseStatus(definition.evidenceRequired, answered, links.length > 0);
    base.set(definition.code, { status, complete: isCompleteStatus(status) });
  }

  // Pass 2: resolve blocked state from prerequisite completeness, then build views.
  const requirements: RequirementView[] = [];
  const unresolvedBlockers: string[] = [];
  const requiredNextActions: string[] = [];
  let completedCount = 0;

  for (const { definition, appliesBecause } of inputs.applicable) {
    const deps = REQUIREMENT_DEPENDENCIES[definition.code] ?? [];
    const activeBlockers = deps.filter(
      (dep) => applicableCodes.has(dep) && base.get(dep)?.complete !== true,
    );
    const baseEntry = base.get(definition.code) ?? { status: 'not_started', complete: false };

    const blocked = activeBlockers.length > 0;
    const status: RequirementStatus = blocked ? 'blocked' : baseEntry.status;
    const complete = !blocked && baseEntry.complete;
    if (complete) completedCount += 1;

    if (blocked) {
      unresolvedBlockers.push(definition.code);
      requiredNextActions.push(`Complete ${activeBlockers.join(', ')} before ${definition.code}.`);
    } else if (!complete) {
      requiredNextActions.push(nextActionFor(definition.code, status));
    }

    const response = inputs.responses.get(definition.code) ?? {};
    const evidence = inputs.evidence.get(definition.code) ?? [];
    requirements.push({
      code: definition.code,
      version: definition.version,
      responseType: definition.responseType,
      evidenceRequired: definition.evidenceRequired,
      titleEn: definition.titleEn,
      guidanceEn: definition.guidanceEn,
      titleFr: definition.titleFr,
      guidanceFr: definition.guidanceFr,
      appliesBecause,
      response,
      evidence,
      status,
      complete,
      blockedBy: activeBlockers,
    });
  }

  const totalApplicable = inputs.applicable.length;
  const completeness: CompletenessSummary = {
    totalApplicable,
    completedCount,
    unresolvedBlockers,
    requiredNextActions,
    eligibleForSubmission:
      totalApplicable > 0 && completedCount === totalApplicable && unresolvedBlockers.length === 0,
  };

  return { requirements, completeness };
}

/** Bounded, safe next-action phrase for an incomplete, non-blocked requirement. */
function nextActionFor(code: string, status: RequirementStatus): string {
  switch (status) {
    case 'evidence_required':
      return `Attach the required supporting document for ${code}.`;
    case 'in_progress':
      return `Provide a response for ${code}.`;
    case 'not_started':
    default:
      return `Start ${code}.`;
  }
}
