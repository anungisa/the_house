# Outbox failures vs. Service Bus dead-letter — investigation guide

This note disambiguates two distinct failure surfaces in The House v2 messaging path and
defines how to investigate each. Conflating them leads to wrong-headed remediation.

## Two different failure surfaces

### 1. Outbox publish failure (BEFORE the broker accepts the message)

The transactional outbox processor (`OutboxWorker`) claims a `governance.outbox_message`
row and calls `OutboxPublisher.publish()`. If publishing fails **before Azure Service Bus
acknowledges receipt** (connection error, throttling, auth failure, serialization error,
timeout awaiting the broker ack), **nothing reached Service Bus**.

- This is a **Postgres outbox condition**, NOT a Service Bus dead-letter (DLQ) event.
- Transient failures: the row returns to `status = 'pending'`, `retry_count` is incremented,
  and `next_attempt_at` is scheduled using **true full jitter**
  (`cap = min(maxDelayMs, baseDelayMs * 2^attempt)`, `delay = random int in [0, cap]`).
- Permanent failures, or transient failures past `max_retries`: the row is set to
  `status = 'failed'` with the `error` recorded. **Rows are never auto-deleted.**

There is **no Service Bus DLQ entry** for these, because the broker never accepted the
message.

### 2. Service Bus dead-letter (AFTER the broker accepted the message)

Once Service Bus has accepted a message, ordinary broker dead-lettering applies to the
**downstream consumer**: max delivery count exceeded, explicit dead-letter by the consumer,
TTL expiry, or session/subscription rule errors. These land in the entity's `$DeadLetterQueue`.

This surface is owned by the **consumer side**, not by the outbox processor.

## Where to look

| Symptom | Surface | Where to investigate |
| --- | --- | --- |
| Messages "stuck" / not published | Outbox (pre-broker) | `governance.outbox_message` rows with `status IN ('pending','failed')`, `retry_count`, `error`, `next_attempt_at`, `locked_until` |
| Repeated publish errors, growing retry counts | Outbox (pre-broker) | Outbox `error` column + processor logs; check broker connectivity/throttling |
| Consumer keeps failing a delivered message | Service Bus DLQ | Entity `$DeadLetterQueue`; `DeadLetterReason`, `DeadLetterErrorDescription` |

### Outbox triage query

```sql
-- Failed / stalled outbox rows (set tenant context first; processor uses worker role)
SELECT id, message_type, status, retry_count, max_retries,
       next_attempt_at, locked_until, locked_by, error, created_at
  FROM governance.outbox_message
 WHERE status IN ('failed', 'pending')
 ORDER BY created_at DESC
 LIMIT 100;
```

## What to capture when investigating a Service Bus DLQ message

Capture the following before remediating (do **not** auto-delete DLQ messages):

- `DeadLetterReason`
- `DeadLetterErrorDescription`
- `MessageId` (equals the outbox `dedupe_key` when set, else the outbox row id)
- `CorrelationId` (propagated from the originating transition `correlation_id`)
- `causationId` application property (the originating `state_transition.id`)
- Delivery count
- Enqueued time / dead-lettered time
- Message body metadata (entity type, entity id, trigger, from/to state) — NOT secrets

These fields let you correlate a dead-lettered message back to the exact governed
transition (`state_transition`), audit event, and outbox row.

## v1 invariants

- **Azure Service Bus sessions are NOT enabled in v1.** `causationId` is carried as an
  ordinary application property, never as a `SessionId`. Asserted by
  `V1_SERVICE_BUS_USES_SESSIONS === false` and a unit test.
- A publish failure before broker acceptance is **always** a Postgres outbox condition.
- No automatic deletion of failed outbox rows or dead-lettered messages — both require
  deliberate operator review and replay.

## Replay guidance (manual, deliberate)

- **Outbox `failed` row:** after fixing the root cause, reset `status = 'pending'`,
  `retry_count = 0`, `next_attempt_at = now()` for the specific row(s). Idempotency holds
  because the broker `MessageId` = stable `dedupe_key`, and the downstream consumer is
  expected to dedupe on it.
- **Service Bus DLQ message:** resubmit from the DLQ to the main entity once the consumer
  defect is fixed. The stable `MessageId` preserves end-to-end de-duplication.
