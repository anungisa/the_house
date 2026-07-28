/**
 * Versioned affiliation requirement catalog — institutional reference data.
 *
 * The catalog is INSTITUTIONAL (not tenant-owned): the same versioned, bilingual requirement
 * definitions apply to every tenant in v1. It is persisted in `affiliation.requirement_definition`
 * (migration 0016) and mirrored here as the authoritative seed. A requirement is IMMUTABLE per
 * (code, version): an institutional revision introduces a NEW version, and an application that was
 * already bound to an older version keeps that version (see {@link RequirementApplicabilityResolver}
 * + the application_requirement binding).
 *
 * Applicability is resolved by the named TypeScript {@link resolveApplicableRequirements} handler
 * against a BOUNDED set of dimensions (org type / jurisdiction / pathway / season). This is NOT a
 * dynamic JSON expression rule engine: the JSON only declares bounded membership arrays; all logic
 * lives in typed code.
 */

/** The bounded set of response controls a requirement can use. */
export type RequirementResponseType =
  | 'acknowledgement'
  | 'short_text'
  | 'long_text'
  | 'structured_contact'
  | 'document_reference'
  | 'confirmation';

/** Bounded applicability descriptor. An omitted/empty dimension means "applies to all values". */
export interface RequirementApplicability {
  readonly orgTypes?: readonly string[];
  readonly jurisdictions?: readonly string[];
  readonly pathways?: readonly string[];
  readonly seasons?: readonly string[];
}

/** One immutable, versioned, bilingual requirement definition. */
export interface RequirementDefinition {
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly responseType: RequirementResponseType;
  readonly evidenceRequired: boolean;
  readonly titleEn: string;
  readonly guidanceEn: string;
  readonly titleFr: string;
  readonly guidanceFr: string;
  readonly applicability: RequirementApplicability;
  readonly effectiveSeason?: string;
  readonly institutionalSource: string;
  readonly active: boolean;
}

/** The context dimensions an application is resolved against. */
export interface RequirementResolutionContext {
  readonly orgType: string;
  readonly jurisdiction: string;
  readonly pathway: string;
  readonly season: string;
}

/** A requirement resolved as applicable to a context, with a human-readable reason. */
export interface ApplicableRequirement {
  readonly definition: RequirementDefinition;
  readonly appliesBecause: string;
}

/**
 * The authoritative v1 catalog seed. MUST stay in lock-step with the seed in migration 0016.
 * NSO-generic naming only — no sport-specific terms.
 */
export const DEFAULT_AFFILIATION_REQUIREMENT_CATALOG: readonly RequirementDefinition[] = [
  {
    id: 'ORG_PROFILE_CONFIRMATION@1',
    code: 'ORG_PROFILE_CONFIRMATION',
    version: 1,
    responseType: 'acknowledgement',
    evidenceRequired: false,
    titleEn: 'Confirm organization profile',
    guidanceEn:
      "Confirm that the organization's registered name, jurisdiction, and primary address on file are current and accurate.",
    titleFr: "Confirmer le profil de l'organisation",
    guidanceFr:
      "Confirmez que le nom enregistré, la juridiction et l'adresse principale de l'organisation au dossier sont à jour et exacts.",
    applicability: {
      orgTypes: ['national', 'regional', 'local'],
      pathways: ['new_affiliation', 'renewal'],
    },
    institutionalSource: 'National Affiliation Policy',
    active: true,
  },
  {
    id: 'PRIMARY_CONTACT_DETAILS@1',
    code: 'PRIMARY_CONTACT_DETAILS',
    version: 1,
    responseType: 'structured_contact',
    evidenceRequired: false,
    titleEn: 'Primary affiliation contact',
    guidanceEn:
      'Provide the name, role, email, and phone number of the primary contact responsible for this affiliation.',
    titleFr: "Personne-ressource principale de l'affiliation",
    guidanceFr:
      "Indiquez le nom, le rôle, le courriel et le numéro de téléphone de la personne-ressource principale responsable de cette affiliation.",
    applicability: {
      orgTypes: ['national', 'regional', 'local'],
      pathways: ['new_affiliation', 'renewal'],
    },
    institutionalSource: 'National Affiliation Policy',
    active: true,
  },
  {
    id: 'GOVERNING_DOCUMENT@1',
    code: 'GOVERNING_DOCUMENT',
    version: 1,
    responseType: 'document_reference',
    evidenceRequired: true,
    titleEn: 'Governing document',
    guidanceEn:
      "Attach the organization's current governing document (constitution or bylaws). A supporting document is required.",
    titleFr: 'Document constitutif',
    guidanceFr:
      "Joignez le document constitutif actuel de l'organisation (constitution ou règlements). Un document justificatif est requis.",
    applicability: {
      orgTypes: ['regional', 'local'],
      pathways: ['new_affiliation', 'renewal'],
    },
    institutionalSource: 'National Affiliation Policy',
    active: true,
  },
  {
    id: 'INSURANCE_CONFIRMATION@1',
    code: 'INSURANCE_CONFIRMATION',
    version: 1,
    responseType: 'confirmation',
    evidenceRequired: true,
    titleEn: 'Insurance confirmation',
    guidanceEn:
      'Confirm valid liability insurance for the affiliation season and attach the certificate of insurance.',
    titleFr: "Confirmation d'assurance",
    guidanceFr:
      "Confirmez une assurance responsabilité valide pour la saison d'affiliation et joignez le certificat d'assurance.",
    applicability: {
      orgTypes: ['local'],
      pathways: ['new_affiliation', 'renewal'],
    },
    institutionalSource: 'National Affiliation Policy',
    active: true,
  },
];

/** True when `value` satisfies a bounded dimension: an omitted/empty list is a wildcard. */
function dimensionMatches(value: string, allowed?: readonly string[]): boolean {
  if (allowed === undefined || allowed.length === 0) return true;
  return allowed.includes(value);
}

/**
 * Resolve which catalog requirements APPLY to a context. Named, deterministic, side-effect-free.
 * A requirement applies when it is active, every declared bounded dimension matches, and any
 * `effectiveSeason` equals the context season. Returns the applicable requirements plus a bounded
 * human-readable `appliesBecause` reason (institutional source + pathway + org type) — never a raw
 * internal policy fact.
 */
export function resolveApplicableRequirements(
  catalog: readonly RequirementDefinition[],
  context: RequirementResolutionContext,
): readonly ApplicableRequirement[] {
  const applicable: ApplicableRequirement[] = [];
  for (const definition of catalog) {
    if (!definition.active) continue;
    if (definition.effectiveSeason !== undefined && definition.effectiveSeason !== context.season) {
      continue;
    }
    const { applicability } = definition;
    if (
      dimensionMatches(context.orgType, applicability.orgTypes) &&
      dimensionMatches(context.jurisdiction, applicability.jurisdictions) &&
      dimensionMatches(context.pathway, applicability.pathways) &&
      dimensionMatches(context.season, applicability.seasons)
    ) {
      applicable.push({
        definition,
        appliesBecause: `${definition.institutionalSource} — applies to ${context.orgType} organizations for ${context.pathway}.`,
      });
    }
  }
  return applicable;
}

/** Return the single active definition for a (code, version), or undefined. */
export function findRequirementVersion(
  catalog: readonly RequirementDefinition[],
  code: string,
  version: number,
): RequirementDefinition | undefined {
  return catalog.find((d) => d.code === code && d.version === version);
}
