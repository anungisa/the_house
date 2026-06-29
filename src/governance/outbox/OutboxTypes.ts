/**
 * Transactional outbox types (scaffold).
 *
 * The outbox row is written in the SAME database transaction as the governed transition.
 * The processor publishes AFTER commit. Publisher failures before Service Bus accepts a
 * message are Postgres outbox failures (status='failed'), NOT Service Bus DLQ events.
 */

export type OutboxStatus = 'pending' | 'processing' | 'processed' | 'failed';

/**
 * Shape of a persisted outbox row. Mirrors the intended governance.outbox_message table.
 */
export interface OutboxRow {
  readonly id: string;

  readonly tenantId: string;
  readonly messageType: string;
  readonly payload: Readonly<Record<string, unknown>>;

  /** Stable dedupe key — used as the Service Bus MessageId when present. */
  readonly dedupeKey: string;
  readonly correlationId?: string;
  readonly causationId?: string;

  readonly status: OutboxStatus;
  readonly retryCount: number;
  readonly maxRetries: number;

  /** Next eligible attempt time (epoch ms). */
  readonly nextAttemptAt: number;

  /** Lease fields for FOR UPDATE SKIP LOCKED claiming. */
  readonly lockedUntil?: number;
  readonly lockedBy?: string;

  readonly createdAt: number;
}

/**
 * A message ready to be published to the broker. Built from an {@link OutboxRow}.
 *
 * Carries only NSO-generic, non-secret routing/observability metadata. The publisher maps
 * these onto Service Bus message fields and applicationProperties; it knows nothing about
 * any specific domain (e.g. AffiliationApplication).
 */
export interface PublishableMessage {
  /** Service Bus MessageId = dedupeKey when present, else the outbox row id. */
  readonly messageId: string;
  readonly messageType: string;
  /** Owning tenant; surfaced as an application property for routing/observability. */
  readonly tenantId: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  /** Carried as an application property; NOT a Service Bus session id (sessions off in v1). */
  readonly causationId?: string;
  /** Stable dedupe key (when the row had one); surfaced as an application property. */
  readonly dedupeKey?: string;
  /** Outbox row creation time (epoch ms); surfaced as an ISO application property. */
  readonly createdAt?: number;
  /** Current attempt count (outbox retry_count); surfaced as an application property. */
  readonly attempt?: number;
}

export interface PublishResult {
  readonly published: boolean;
  /** Set when publishing failed; distinguishes transient (retryable) from permanent. */
  readonly transient?: boolean;
  readonly errorMessage?: string;
}
