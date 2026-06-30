/**
 * Evidence quarantine store port (hexagonal boundary).
 *
 * The store atomically persists quarantine METADATA and enqueues the supplied outbox message
 * (the transactional-outbox principle: the security event row and its outbox row commit
 * together). It NEVER stores raw payload bytes — there is no byte parameter, by design.
 *
 * Implementations are tenant-scoped: the Pg implementation writes under the tenant's RLS
 * context; the in-memory implementation is for local/demo/test wiring only.
 */

import type { OutboxEnqueueInput } from '../../outbox/OutboxStore.js';
import type {
  EvidenceQuarantineRecord,
  RecordedQuarantineEvent,
} from './EvidenceQuarantineTypes.js';

export interface EvidenceQuarantineStore {
  /**
   * Persist a quarantine event and enqueue its outbox message atomically. Returns the new
   * quarantine event id and the enqueued outbox message id. Never stores raw payload bytes.
   */
  record(
    record: EvidenceQuarantineRecord,
    outbox: OutboxEnqueueInput,
  ): Promise<RecordedQuarantineEvent>;
}
