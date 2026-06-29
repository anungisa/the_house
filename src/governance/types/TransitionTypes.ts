/**
 * Governance Kernel transition types (scaffold).
 *
 * These types define the contract for the future GovernanceKernel.transition() path.
 * They are intentionally NSO-GENERIC: no curling-specific or any single-sport field names
 * (no ptsoId/clubId/curlerId). Sport-specific concepts live in sport profiles, fixtures,
 * or domain payloads — never in these platform-core types.
 */

/**
 * Generic scope classification for an actor/context within the NSO hierarchy.
 * Concrete sport profiles map their own terms onto these (e.g. for Curling Canada:
 * national organization, regional governing body = PTSO/MA, local organization = club).
 */
export type ScopeType =
  | 'platform'
  | 'national_organization'
  | 'regional_organization'
  | 'local_organization'
  | 'organization_unit';

/**
 * Who is requesting a transition. Uses generic scope fields only.
 *
 * Forward-compat note: reviewer/approver semantics (e.g. the legacy two-tier
 * PTSO/CC review and approval-tier sign-offs) are expressed via `roles`/`scopeType`
 * plus workflow metadata on the transition request — NOT by adding sport-specific
 * actor fields here.
 */
export interface TransitionActor {
  readonly actorId: string;
  readonly tenantId: string;

  /** Generic organizational scope of the actor. */
  readonly scopeType: ScopeType;
  readonly scopeId?: string;

  /** Optional generic hierarchy references (all NSO-generic). */
  readonly organizationId?: string;
  readonly organizationUnitId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;

  /** Generic role keys used for permission checks (e.g. 'reviewer', 'admin'). */
  readonly roles?: readonly string[];
}

/**
 * Ambient context for a transition. Generic scope fields only.
 */
export interface TransitionContext {
  readonly tenantId: string;

  readonly scopeType: ScopeType;
  readonly scopeId?: string;

  readonly organizationId?: string;
  readonly organizationUnitId?: string;
  readonly nationalOrganizationId?: string;
  readonly regionalOrganizationId?: string;
  readonly localOrganizationId?: string;

  /** Distributed-tracing / lineage identifiers, propagated to the outbox. */
  readonly correlationId?: string;
  readonly causationId?: string;

  /**
   * Forward-compat extension point (placeholder only — not implemented in v1):
   * review substate metadata, approval-tier sign-off context, sport-profile review
   * terminology, and return-for-more-info handling are carried here as opaque metadata
   * WITHOUT expanding the v1 FSM. Do not add real review states in the scaffold.
   */
  readonly workflowMetadata?: Readonly<Record<string, unknown>>;
}

/**
 * Input to a governed transition request.
 */
export interface TransitionInput {
  /** The governed entity type, e.g. 'AffiliationApplication'. */
  readonly entityType: string;
  readonly entityId: string;

  /** The trigger name, e.g. 'submit', 'review_start', 'approve'. */
  readonly trigger: string;

  /** Required idempotency key — enforced by kernel pre-check, txn re-check, and DB unique. */
  readonly idempotencyKey: string;

  readonly actor: TransitionActor;
  readonly context: TransitionContext;

  /** Optional domain payload for guards/evidence. Opaque to the kernel. */
  readonly payload?: Readonly<Record<string, unknown>>;

  /**
   * Optional PRE-COMPUTED evidence payload binding for an evidence-required (high-risk)
   * transition. This is NEVER raw bytes: the kernel never touches blob storage. When a
   * governed transition is accompanied by a stored document, the caller stores the bytes via
   * the evidence storage layer FIRST and passes the resulting {@link EvidencePayloadBinding}
   * (content hash + serialized storage reference) here. The kernel persists it onto the
   * governance evidence metadata it creates. Absent → metadata-only evidence (unchanged
   * behavior). Ignored for transitions that do not require evidence.
   */
  readonly evidence?: EvidencePayloadBinding;
}

/**
 * A pre-computed binding from a stored evidence payload to governance evidence metadata.
 *
 * Produced by the evidence storage layer (never by the kernel). Contains only the digest and
 * a stable, serialized storage reference — never raw bytes and never a live SDK handle. This
 * is the seam that lets governance evidence metadata point at a hash-addressed payload without
 * the Governance Kernel ever depending on Azure Blob.
 */
export interface EvidencePayloadBinding {
  /** Lowercase hex SHA-256 digest of the stored payload → persisted to `content_hash`. */
  readonly contentHash: string;
  /** Stable serialized storage reference (JSON string) → persisted to `storage_ref`. */
  readonly storageRef: string;
}

export type TransitionStatus =
  | 'executed'
  | 'rejected'
  | 'approval_required'
  | 'idempotent_replay';

/**
 * Deterministic result of a governed transition attempt.
 */
export interface TransitionResult {
  readonly status: TransitionStatus;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;

  readonly fromState?: string;
  readonly toState?: string;

  /** Populated when status is 'rejected' (e.g. guard failure, permission denial). */
  readonly reasonCode?: string;
  readonly reasonMessage?: string;

  /** Guard outcomes recorded for the attempted transition. */
  readonly guardResults?: readonly GuardEvaluationResult[];

  /** Id of the created transition_request when approval is required. */
  readonly transitionRequestId?: string;

  /**
   * Id of the review workflow instance created alongside an approval-required
   * transition_request (two-tier review METADATA). Present only when a workflow planner
   * produced a plan for the transition.
   */
  readonly workflowInstanceId?: string;

  /** Id of the appended state_transition (immutable journal) for an executed transition. */
  readonly stateTransitionId?: string;

  /** Id of the appended audit_event for an executed transition. */
  readonly auditEventId?: string;

  /** Id of the created evidence_object when an executed transition required evidence. */
  readonly evidenceObjectId?: string;

  /** Stable idempotency echo so replays can be recognized by callers. */
  readonly idempotencyKey: string;
}

/**
 * Input passed to a guard handler during evaluation. Read-only by contract.
 */
export interface GuardEvaluationInput {
  readonly guardCode: string;
  /** Per-binding parameters from governance.transition_guard.parameters. */
  readonly parameters: Readonly<Record<string, unknown>>;

  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly fromState: string;
  readonly toState: string;

  readonly actor: TransitionActor;
  readonly context: TransitionContext;
  readonly payload?: Readonly<Record<string, unknown>>;
}

/**
 * Result of evaluating a single guard.
 */
export interface GuardEvaluationResult {
  readonly guardCode: string;
  readonly passed: boolean;
  /** Explicit, human-readable failure message when `passed` is false. */
  readonly message?: string;
}

/**
 * A named, read-only guard handler. Registered in the GuardRegistry.
 * Handlers must be side-effect-free (read-only), testable, and dependency-injected/
 * repository-backed. Unknown guard codes must fail closed at the registry level.
 */
export type GuardHandler = (
  input: GuardEvaluationInput,
) => Promise<GuardEvaluationResult> | GuardEvaluationResult;

/**
 * A message enqueued in the transactional outbox during a transition.
 * Published only AFTER commit by the outbox processor.
 */
export interface OutboxMessage {
  readonly id: string;
  /** Stable dedupe key (used as the Service Bus MessageId when present). */
  readonly dedupeKey: string;
  readonly messageType: string;
  readonly payload: Readonly<Record<string, unknown>>;

  readonly tenantId: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

/**
 * Immutable evidence METADATA created for high-risk transitions
 * (approve, reject, suspend, reinstate, revoke, close, archive).
 * Stores references/hashes — never blob content.
 */
export interface EvidenceObjectMetadata {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;

  readonly tenantId: string;

  /** Reference to externally-stored evidence (e.g. URI) and an integrity hash. */
  readonly reference?: string;
  readonly contentHash?: string;

  readonly createdByActorId: string;
  readonly createdAtIso: string;
}

/**
 * Append-only audit event input written inside the transition transaction.
 */
export interface AuditEventInput {
  readonly entityType: string;
  readonly entityId: string;
  readonly trigger: string;
  readonly action: string;

  readonly tenantId: string;
  readonly actorId: string;

  readonly fromState?: string;
  readonly toState?: string;

  readonly correlationId?: string;
  readonly causationId?: string;

  /** Additional NSO-generic, non-sensitive context. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
