/**
 * Evidence quarantine store port (hexagonal boundary).
 *
 * The store atomically persists quarantine METADATA and enqueues the supplied outbox message
 * (the transactional-outbox principle: the security event row and its outbox row commit
 * together). It NEVER stores raw payload bytes — there is no byte parameter, by design.
 *
 * Beyond recording a blocked upload, the store also serves the operator REVIEW surface:
 *  - read-only list/detail of quarantine events (tenant-scoped), and
 *  - an atomic DISPOSITION (reviewed/released/discarded) that, under a row lock, validates the
 *    status transition, advances the event, and enqueues a disposition outbox event in the
 *    SAME transaction. Disposition NEVER stores bytes, NEVER creates governed evidence, NEVER
 *    mutates governance.entity_state, and NEVER calls the kernel.
 *
 * Implementations are tenant-scoped: the Pg implementation writes under the tenant's RLS
 * context; the in-memory implementation is for local/demo/test wiring only.
 */

import type { OutboxEnqueueInput } from '../../outbox/OutboxStore.js';
import {
  dispositionMessageType,
  dispositionTargetStatus,
  type EvidenceQuarantineDispositionPayload,
  type EvidenceQuarantineRecord,
  type QuarantineDisposition,
  type QuarantineEventView,
  type QuarantineListFilter,
  type QuarantineListResult,
  type QuarantineScanStatus,
  type QuarantineStatus,
  type RecordedQuarantineEvent,
} from './EvidenceQuarantineTypes.js';

/**
 * Input for recording a disposition. The store assembles the sanitized outbox payload from the
 * locked row (it has authoritative `contentHash`/`scanStatus`/`scanner`/`previousStatus`); the
 * caller supplies only the operator-provided context.
 */
export interface RecordQuarantineDispositionStoreInput {
  readonly tenantId: string;
  readonly quarantineEventId: string;
  readonly disposition: QuarantineDisposition;
  /** The security operator recording the disposition (never the uploader). */
  readonly actorUserId: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  /** Outbox max retries applied to the emitted disposition event. */
  readonly maxRetries: number;
}

/** Discriminated outcome of a disposition attempt (validated under a row lock). */
export type RecordQuarantineDispositionOutcome =
  | {
      readonly outcome: 'applied';
      readonly quarantineEventId: string;
      readonly previousStatus: QuarantineStatus;
      readonly newStatus: QuarantineStatus;
      readonly outboxMessageId: string;
    }
  | { readonly outcome: 'not_found' }
  | { readonly outcome: 'illegal_transition'; readonly currentStatus: QuarantineStatus };

/** Sanitized row fields a store needs to build the disposition outbox event. */
export interface QuarantineOutboxRowContext {
  readonly quarantineEventId: string;
  readonly tenantId: string;
  readonly contentHash: string;
  readonly scanStatus: QuarantineScanStatus;
  readonly scanner: string;
  readonly threatName?: string;
}

/**
 * Build the sanitized disposition outbox enqueue input from a locked row. Shared by every
 * store implementation so the message type, dedupe key, and payload shape are identical
 * everywhere. The payload NEVER includes the uploader id, source filename, raw bytes, or
 * headers — only routing/observability metadata plus the acting operator id.
 */
export function buildQuarantineDispositionOutbox(input: {
  readonly row: QuarantineOutboxRowContext;
  readonly disposition: QuarantineDisposition;
  readonly previousStatus: QuarantineStatus;
  readonly actorUserId: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly maxRetries: number;
}): OutboxEnqueueInput {
  const messageType = dispositionMessageType(input.disposition);
  const newStatus = dispositionTargetStatus(input.disposition);
  const payload = {
    quarantineEventId: input.row.quarantineEventId,
    tenantId: input.row.tenantId,
    contentHash: input.row.contentHash,
    scanStatus: input.row.scanStatus,
    scanner: input.row.scanner,
    previousStatus: input.previousStatus,
    newStatus,
    actorUserId: input.actorUserId,
    ...(input.row.threatName !== undefined ? { threatName: input.row.threatName } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
  } satisfies EvidenceQuarantineDispositionPayload;

  return {
    tenantId: input.row.tenantId,
    messageType,
    payload,
    dedupeKey: `${messageType}:${input.row.quarantineEventId}`,
    maxRetries: input.maxRetries,
    ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
  };
}

export interface EvidenceQuarantineStore {
  /**
   * Persist a quarantine event and enqueue its outbox message atomically. Returns the new
   * quarantine event id and the enqueued outbox message id. Never stores raw payload bytes.
   */
  record(
    record: EvidenceQuarantineRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<RecordedQuarantineEvent>;

  /** List quarantine events for a tenant, filtered + keyset-paginated (read-only). */
  list(tenantId: string, filter: QuarantineListFilter): Promise<QuarantineListResult>;

  /** Fetch a single quarantine event for a tenant; undefined when it does not exist. */
  getById(tenantId: string, quarantineEventId: string): Promise<QuarantineEventView | undefined>;

  /**
   * Atomically validate + apply an operator disposition (reviewed/released/discarded) and
   * enqueue the disposition outbox event in the SAME transaction. Validation (existence,
   * legal transition) happens under a row lock; the outcome is discriminated. Never stores
   * bytes, never touches governed lifecycle tables.
   */
  recordDisposition(
    input: RecordQuarantineDispositionStoreInput,
  ): Promise<RecordQuarantineDispositionOutcome>;
}
