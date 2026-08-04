/**
 * Governed jurisdiction resolution — domain types.
 *
 * A jurisdiction is a PERSISTED, tenant-isolated, governed fact with an explicit lifecycle
 * (draft / published / retired). An organization is bound to a jurisdiction through a governed
 * ASSIGNMENT edge (primary, direct / inheritable, active / revoked, with a validity window). An
 * organization TYPE grants NO jurisdiction; a descendant inherits an ancestor's inheritable
 * jurisdiction only when it has no direct assignment — and that inheritance is DERIVED at read
 * time, never stored.
 *
 * A representative NEVER sees drafts, source references, assignment ids, parent lineage, audit
 * actors, versions, or reason codes: {@link JurisdictionView} is the only representative-safe
 * projection, and only a `resolved` {@link JurisdictionResolution} exposes one.
 */

/** Governed jurisdiction lifecycle state. */
export type JurisdictionStatus = 'draft' | 'published' | 'retired';

/** The bounded set of jurisdiction levels (country-generic; no province list is hardcoded). */
export type JurisdictionLevel = 'national' | 'subdivision' | 'local' | 'custom';

/** Governed assignment lifecycle state. */
export type JurisdictionAssignmentStatus = 'active' | 'revoked';

/**
 * Whether a jurisdiction assignment applies only to the bound organization (`direct`) or is
 * inherited by descendant organizations that have no direct assignment (`inheritable`).
 */
export type JurisdictionInheritanceMode = 'direct' | 'inheritable';

/** The only assignment kind in v1: the organization's single governing jurisdiction. */
export type JurisdictionAssignmentType = 'primary';

/** Representative locale for bilingual label selection. */
export type JurisdictionLocale = 'en' | 'fr';

/** Append-only jurisdiction catalog event types (parity with the migration CHECK). */
export type JurisdictionEventType = 'created' | 'revised' | 'published' | 'retired';

/** Append-only assignment event types (parity with the migration CHECK). */
export type JurisdictionAssignmentEventType = 'assigned' | 'replaced' | 'revoked';

/** The governed jurisdiction catalog head (aggregate). */
export interface JurisdictionRecord {
  readonly id: string;
  readonly tenantId: string;
  /** Stable, tenant-unique key echoed by the browser + bound onto application context. */
  readonly code: string;
  readonly level: JurisdictionLevel;
  readonly labelEn: string;
  readonly labelFr: string;
  readonly status: JurisdictionStatus;
  readonly version: number;
  readonly parentJurisdictionId?: string;
  readonly countryCode?: string;
  readonly subdivisionCode?: string;
  readonly sourceReference?: string;
  readonly idempotencyKey?: string;
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The governed organization -> jurisdiction assignment head (aggregate). */
export interface JurisdictionAssignmentRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly jurisdictionId: string;
  readonly assignmentType: JurisdictionAssignmentType;
  readonly inheritanceMode: JurisdictionInheritanceMode;
  readonly status: JurisdictionAssignmentStatus;
  readonly validFrom: string;
  readonly validUntil?: string;
  readonly version: number;
  readonly sourceReference?: string;
  readonly idempotencyKey?: string;
  readonly assignedBy?: string;
  readonly assignedAt: string;
  readonly revokedBy?: string;
  readonly revokedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * The representative-safe jurisdiction projection. `code` is the stable key; `label` is already
 * localized (the caller supplies the locale). NEVER carries a source reference, assignment id,
 * parent lineage, actor, version, or reason code.
 */
export interface JurisdictionView {
  readonly code: string;
  readonly label: string;
  readonly level: JurisdictionLevel;
}

/**
 * The outcome of resolving an organization's governing jurisdiction at a given instant.
 * ONLY `resolved` exposes a {@link JurisdictionView}. The specific non-resolved reason
 * (`unresolved` / `ambiguous` / `invalid_hierarchy`) is an INTERNAL distinction: every non-resolved
 * outcome collapses to the same safe "unavailable for affiliation context" posture at the surface,
 * so hierarchy/existence facts are never disclosed to the representative.
 */
export type JurisdictionResolution =
  | { readonly outcome: 'resolved'; readonly jurisdiction: JurisdictionView }
  /** No governed assignment (direct or inherited) resolves for this organization right now. */
  | { readonly outcome: 'unresolved' }
  /** More than one assignment resolves at the same precedence — fail closed rather than guess. */
  | { readonly outcome: 'ambiguous' }
  /** The governed organization hierarchy is broken or cyclic — fail closed. */
  | { readonly outcome: 'invalid_hierarchy' };

/** Select the label for a locale (fr falls to the French label; anything else to English). */
export function pickJurisdictionLabel(
  record: Pick<JurisdictionRecord, 'labelEn' | 'labelFr'>,
  locale: JurisdictionLocale,
): string {
  return locale === 'fr' ? record.labelFr : record.labelEn;
}

/** Build the representative-safe view from a catalog head at a locale. */
export function toJurisdictionView(
  record: Pick<JurisdictionRecord, 'code' | 'level' | 'labelEn' | 'labelFr'>,
  locale: JurisdictionLocale,
): JurisdictionView {
  return { code: record.code, label: pickJurisdictionLabel(record, locale), level: record.level };
}
