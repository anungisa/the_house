/**
 * In-memory {@link EvidenceQuarantineStore} — LOCAL/DEMO/TEST ONLY.
 *
 * Records quarantine metadata in process and enqueues the outbox message through the supplied
 * {@link OutboxStore}. It NEVER receives or stores raw payload bytes. This wiring is not
 * durable and is not a second evidence store; production uses {@link PgEvidenceQuarantineStore}.
 *
 * It also serves the operator review surface (list/detail/disposition) with the SAME validation
 * and outbox semantics as the Pg store, so adapter/service unit tests are fully hermetic.
 */

import { systemClock, type Clock } from '../../../shared/time/clock.js';
import type { OutboxEnqueueInput, OutboxStore } from '../../outbox/OutboxStore.js';
import {
  buildQuarantineDispositionOutbox,
  type EvidenceQuarantineStore,
  type RecordQuarantineDispositionOutcome,
  type RecordQuarantineDispositionStoreInput,
} from './EvidenceQuarantineStore.js';
import {
  dispositionTargetStatus,
  isAllowedQuarantineTransition,
  QUARANTINE_LIST_DEFAULT_LIMIT,
  QUARANTINE_LIST_MAX_LIMIT,
  type EvidenceQuarantineRecord,
  type QuarantineEventView,
  type QuarantineListFilter,
  type QuarantineListResult,
  type QuarantineStatus,
  type RecordedQuarantineEvent,
} from './EvidenceQuarantineTypes.js';

/** A recorded quarantine event as held in memory (sanitized metadata only; never bytes). */
interface StoredQuarantineRow extends EvidenceQuarantineRecord {
  quarantineStatus: QuarantineStatus;
  reviewedByUserId?: string;
  reviewedAt?: string;
  dispositionReason?: string;
  readonly createdAt: string;
  updatedAt: string;
}

/** Backwards-compatible read-only view of a stored event (used by the legacy `list()` helper). */
export interface StoredQuarantineEvent extends EvidenceQuarantineRecord {
  readonly quarantineStatus: QuarantineStatus;
  readonly createdAt: string;
}

export interface InMemoryEvidenceQuarantineStoreDeps {
  readonly clock?: Clock;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return QUARANTINE_LIST_DEFAULT_LIMIT;
  if (limit < 1) return 1;
  return Math.min(limit, QUARANTINE_LIST_MAX_LIMIT);
}

function toView(row: StoredQuarantineRow): QuarantineEventView {
  return {
    quarantineEventId: row.quarantineEventId,
    tenantId: row.tenantId,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    contentHash: row.contentHash,
    scanStatus: row.scanStatus,
    scanner: row.scanner,
    quarantineStatus: row.quarantineStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.evidenceObjectId !== undefined ? { evidenceObjectId: row.evidenceObjectId } : {}),
    ...(row.sourceFilename !== undefined ? { sourceFilename: row.sourceFilename } : {}),
    ...(row.signatureVersion !== undefined ? { signatureVersion: row.signatureVersion } : {}),
    ...(row.threatName !== undefined ? { threatName: row.threatName } : {}),
    ...(row.reason !== undefined ? { reason: row.reason } : {}),
    ...(row.uploadActorUserId !== undefined ? { uploadActorUserId: row.uploadActorUserId } : {}),
    ...(row.requestId !== undefined ? { requestId: row.requestId } : {}),
    ...(row.correlationId !== undefined ? { correlationId: row.correlationId } : {}),
    ...(row.reviewedByUserId !== undefined ? { reviewedByUserId: row.reviewedByUserId } : {}),
    ...(row.reviewedAt !== undefined ? { reviewedAt: row.reviewedAt } : {}),
    ...(row.dispositionReason !== undefined ? { dispositionReason: row.dispositionReason } : {}),
  };
}

export class InMemoryEvidenceQuarantineStore implements EvidenceQuarantineStore {
  private readonly events: StoredQuarantineRow[] = [];
  private readonly clock: Clock;

  constructor(
    private readonly outbox: OutboxStore,
    deps: InMemoryEvidenceQuarantineStoreDeps = {},
  ) {
    this.clock = deps.clock ?? systemClock;
  }

  async record(
    record: EvidenceQuarantineRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<RecordedQuarantineEvent> {
    const outboxMessageId = await this.outbox.enqueue(outbox);
    const now = this.clock.nowIso();
    this.events.push({ ...record, quarantineStatus: 'recorded', createdAt: now, updatedAt: now });
    return { quarantineEventId: record.quarantineEventId, outboxMessageId };
  }

  /** Legacy inspection helper (tests/local). Returns a defensive copy; never the payload bytes. */
  listAll(): readonly StoredQuarantineEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  list(tenantId: string, filter: QuarantineListFilter): Promise<QuarantineListResult> {
    const f = filter;
    const limit = clampLimit(f.limit);
    const sorted = this.events
      .filter((e) => e.tenantId === tenantId)
      .filter((e) =>
        f.quarantineStatus !== undefined ? e.quarantineStatus === f.quarantineStatus : true,
      )
      .filter((e) => (f.scanStatus !== undefined ? e.scanStatus === f.scanStatus : true))
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.quarantineEventId.localeCompare(b.quarantineEventId)
          : a.createdAt.localeCompare(b.createdAt),
      );
    const cursor = f.cursor;
    const afterCursor =
      cursor !== undefined
        ? sorted.filter(
            (e) =>
              e.createdAt > cursor.createdAt ||
              (e.createdAt === cursor.createdAt && e.quarantineEventId > cursor.id),
          )
        : sorted;
    const page = afterCursor.slice(0, limit);
    const items = page.map(toView);
    const last = page[page.length - 1];
    const hasMore = afterCursor.length > limit && last !== undefined;
    return Promise.resolve({
      items,
      ...(hasMore && last !== undefined
        ? { nextCursor: { createdAt: last.createdAt, id: last.quarantineEventId } }
        : {}),
    });
  }

  getById(tenantId: string, quarantineEventId: string): Promise<QuarantineEventView | undefined> {
    const row = this.events.find(
      (e) => e.tenantId === tenantId && e.quarantineEventId === quarantineEventId,
    );
    return Promise.resolve(row !== undefined ? toView(row) : undefined);
  }

  async recordDisposition(
    input: RecordQuarantineDispositionStoreInput,
  ): Promise<RecordQuarantineDispositionOutcome> {
    const row = this.events.find(
      (e) => e.tenantId === input.tenantId && e.quarantineEventId === input.quarantineEventId,
    );
    if (row === undefined) return { outcome: 'not_found' };

    const previousStatus = row.quarantineStatus;
    const newStatus = dispositionTargetStatus(input.disposition);
    if (!isAllowedQuarantineTransition(previousStatus, newStatus)) {
      return { outcome: 'illegal_transition', currentStatus: previousStatus };
    }

    const outboxInput = buildQuarantineDispositionOutbox({
      row: {
        quarantineEventId: row.quarantineEventId,
        tenantId: row.tenantId,
        contentHash: row.contentHash,
        scanStatus: row.scanStatus,
        scanner: row.scanner,
        ...(row.threatName !== undefined ? { threatName: row.threatName } : {}),
      },
      disposition: input.disposition,
      previousStatus,
      actorUserId: input.actorUserId,
      maxRetries: input.maxRetries,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
      ...(input.correlationId !== undefined ? { correlationId: input.correlationId } : {}),
    });
    const outboxMessageId = await this.outbox.enqueue(outboxInput);

    row.quarantineStatus = newStatus;
    row.reviewedByUserId = input.actorUserId;
    row.reviewedAt = this.clock.nowIso();
    row.updatedAt = row.reviewedAt;
    if (input.reason !== undefined) row.dispositionReason = input.reason;

    return {
      outcome: 'applied',
      quarantineEventId: row.quarantineEventId,
      previousStatus,
      newStatus,
      outboxMessageId,
    };
  }
}
