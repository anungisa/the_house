/**
 * In-memory {@link EvidenceQuarantineStore} — LOCAL/DEMO/TEST ONLY.
 *
 * Records quarantine metadata in process and enqueues the outbox message through the supplied
 * {@link OutboxStore}. It NEVER receives or stores raw payload bytes. This wiring is not
 * durable and is not a second evidence store; production uses {@link PgEvidenceQuarantineStore}.
 */

import { systemClock, type Clock } from '../../../shared/time/clock.js';
import type { OutboxEnqueueInput, OutboxStore } from '../../outbox/OutboxStore.js';
import type { EvidenceQuarantineStore } from './EvidenceQuarantineStore.js';
import type {
  EvidenceQuarantineRecord,
  QuarantineStatus,
  RecordedQuarantineEvent,
} from './EvidenceQuarantineTypes.js';

/** A recorded quarantine event as held in memory (sanitized metadata only; never bytes). */
export interface StoredQuarantineEvent extends EvidenceQuarantineRecord {
  readonly quarantineStatus: QuarantineStatus;
  readonly createdAt: string;
}

export interface InMemoryEvidenceQuarantineStoreDeps {
  readonly clock?: Clock;
}

export class InMemoryEvidenceQuarantineStore implements EvidenceQuarantineStore {
  private readonly events: StoredQuarantineEvent[] = [];
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
    this.events.push({
      ...record,
      quarantineStatus: 'recorded',
      createdAt: this.clock.nowIso(),
    });
    return { quarantineEventId: record.quarantineEventId, outboxMessageId };
  }

  /** Inspection helper (tests/local). Returns a defensive copy; never the payload bytes. */
  list(): readonly StoredQuarantineEvent[] {
    return [...this.events];
  }
}
