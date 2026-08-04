/**
 * Affiliation DRAFT persistence port (Slice C).
 *
 * Owns the representative's pre-submission working set in the `affiliation` schema: the
 * application head fact row, the draft head (optimistic-concurrency version), the immutable
 * requirement-version bindings, saved responses, associated evidence links, and the append-only
 * change history. It NEVER writes governed lifecycle state (governance.entity_state) and NEVER
 * invokes the kernel — those belong to submission (Slice D).
 *
 * All methods are tenant-scoped. Implementations MUST fail closed on missing tenant context and
 * enforce optimistic concurrency deterministically (version check under a row lock).
 */

/** Immutable application identity + scope facts needed by the draft experience. */
export interface DraftApplicationHead {
  readonly applicationId: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway: string;
  readonly applicantUserId?: string;
}

/** The draft head: optimistic-concurrency version + save bookkeeping. */
export interface DraftHead {
  readonly applicationId: string;
  readonly version: number;
  readonly lastSavedAt: string;
  readonly lastSavingActor?: string;
}

/** An immutable requirement-version binding recorded at initiation. */
export interface BoundRequirementRow {
  readonly requirementCode: string;
  readonly requirementVersion: number;
  readonly appliesBecause: string;
}

/**
 * Governed renewal attribution context. Present ONLY when a `renewal`-pathway application is being
 * initiated for a specific standing. It carries the server-resolved source facts (never
 * browser-trusted) plus idempotency/lineage. The store uses it to physically attribute the new
 * application to the standing (`affiliation_standing.renewal_application_link`) inside the SAME
 * transaction, and to fail closed when a `renewal` pathway arrives WITHOUT it.
 */
export interface RenewalInitiationContext {
  readonly standingId: string;
  readonly sourceStandingVersion: number;
  readonly sourceSeasonId: string;
  readonly targetSeasonId: string;
  readonly idempotencyKey: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/** A saved response value keyed by requirement code. */
export interface StoredResponseRow {
  readonly requirementCode: string;
  readonly value: Record<string, unknown>;
}

/** A stored evidence association (representative-safe reference only). */
export interface StoredEvidenceLinkRow {
  readonly linkId: string;
  readonly requirementCode: string;
  readonly evidenceObjectId: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly displayName?: string;
  readonly associatedAt: string;
}

/** Input to initiate (or resume) an application idempotently. */
export interface InitiateApplicationInput {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly seasonId: string;
  readonly pathway: string;
  readonly actor: string;
  readonly bindings: readonly BoundRequirementRow[];
  /**
   * Governed renewal attribution. REQUIRED when `pathway === 'renewal'` (the store fails closed
   * otherwise) and MUST be absent for any other pathway. When present and a NEW application is
   * created, the store also writes the renewal link, audit event, and outbox message atomically.
   */
  readonly renewal?: RenewalInitiationContext;
}

/** A response value to upsert during a draft save. */
export interface DraftResponseUpsert {
  readonly requirementCode: string;
  readonly value: Record<string, unknown>;
}

/** Input to save draft responses under an optimistic-concurrency check. */
export interface SaveDraftInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly expectedVersion: number;
  readonly actor: string;
  readonly responses: readonly DraftResponseUpsert[];
}

/** Result of an optimistic-concurrency draft mutation. */
export type DraftMutationResult =
  | { readonly ok: true; readonly newVersion: number; readonly lastSavedAt: string }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'not_editable' | 'outside_correction_scope' }
  | { readonly ok: false; readonly reason: 'version_conflict'; readonly currentVersion: number };

/** Input to associate an existing evidence payload reference with a bound requirement. */
export interface AddEvidenceLinkInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly requirementCode: string;
  readonly evidenceObjectId: string;
  readonly contentHash: string;
  readonly contentType: string;
  readonly displayName?: string;
  readonly actor: string;
}

/** Result of adding an evidence association. */
export type AddEvidenceLinkResult =
  | { readonly ok: true; readonly link: StoredEvidenceLinkRow; readonly newVersion: number }
  | {
      readonly ok: false;
      readonly reason:
        | 'not_found'
        | 'unknown_requirement'
        | 'not_editable'
        | 'outside_correction_scope';
    };

/** Input to remove a draft evidence association (never deletes a governed evidence object). */
export interface RemoveEvidenceLinkInput {
  readonly tenantId: string;
  readonly applicationId: string;
  readonly linkId: string;
  readonly actor: string;
}

/** Result of removing an evidence association. */
export type RemoveEvidenceLinkResult =
  | { readonly ok: true; readonly newVersion: number }
  | {
      readonly ok: false;
      readonly reason: 'not_found' | 'not_editable' | 'outside_correction_scope';
    };

/** A full read of an application's draft working set. */
export interface DraftSnapshot {
  readonly head: DraftApplicationHead;
  readonly draft: DraftHead;
  readonly bindings: readonly BoundRequirementRow[];
  readonly responses: readonly StoredResponseRow[];
  readonly evidence: readonly StoredEvidenceLinkRow[];
}

export interface AffiliationDraftStore {
  /** Return the existing draft application for a subject (tenant+org+season+pathway), or undefined. */
  findApplicationBySubject(
    tenantId: string,
    organizationId: string,
    seasonId: string,
    pathway: string,
  ): Promise<DraftApplicationHead | undefined>;

  /**
   * Initiate a new draft application OR return the existing one for the same subject. Idempotent:
   * a repeated call for the same (tenant, org, season, pathway) returns the SAME application and
   * never creates a second. Binds the supplied requirement versions and seeds the draft head.
   */
  initiateApplication(
    input: InitiateApplicationInput,
  ): Promise<{ readonly head: DraftApplicationHead; readonly created: boolean }>;

  /** Read the full draft working set, or undefined when the application does not exist for tenant. */
  getSnapshot(tenantId: string, applicationId: string): Promise<DraftSnapshot | undefined>;

  /** Save responses under an optimistic-concurrency (version) check. */
  saveDraft(input: SaveDraftInput): Promise<DraftMutationResult>;

  /** Associate an existing evidence payload reference with a bound requirement. */
  addEvidenceLink(input: AddEvidenceLinkInput): Promise<AddEvidenceLinkResult>;

  /** Remove a draft evidence association (deletes ONLY the link row). */
  removeEvidenceLink(input: RemoveEvidenceLinkInput): Promise<RemoveEvidenceLinkResult>;
}
