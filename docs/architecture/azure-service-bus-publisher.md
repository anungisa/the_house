# Azure Service Bus outbox publisher

## Purpose

Replace the no-op Service Bus publisher with a **real** Azure Service Bus implementation of
the `OutboxPublisher` port, while preserving the existing transactional-outbox abstraction
and full unit-testability. This pass covers **only** publishing already-claimed outbox
messages to a broker.

What this pass is **not**: a worker runtime host/timer, a dead-letter (DLQ) processor, a
downstream consumer, production deployment/IaC, or production auth. Those remain future work
(see [Not covered](#not-covered-future-work)).

## Relationship to the transactional outbox

The governed write path is unchanged:

```
GovernanceKernel.transition()
  └─ (one DB transaction) state + journal + audit + evidence + ENQUEUE outbox_message row
        commit
OutboxWorker.processBatch()   ← background loop
  ├─ recoverExpiredLeases()
  ├─ claimBatch()             (FOR UPDATE SKIP LOCKED + lease, via SECURITY DEFINER fns)
  ├─ publisher.publish(msg)   ← AzureServiceBusPublisher (this pass)
  └─ markProcessed / reschedule / markFailed
```

The publisher is a **leaf**: it takes one `PublishableMessage` and sends one Service Bus
message. It does not decide retries, does not touch Postgres, and does not know about any
domain.

### Why the publisher does not claim or mark rows

Claiming, leasing, marking processed, rescheduling with backoff, and marking failed are the
**OutboxWorker's** responsibility (and, under the hood, the `PgOutboxStore` SECURITY DEFINER
functions — see [outbox-worker-role.md](outbox-worker-role.md)). Keeping the publisher free
of that logic means:

- the retry/backoff policy (true full jitter) lives in exactly one place;
- the publisher is a pure mapping + send, trivially unit-testable with a fake;
- RLS and the worker-role model are untouched — the publisher never queries governed tables.

A publish failure **before** the broker accepts a message is a failed/pending **Postgres
outbox row**, not a Service Bus DLQ event. (DLQ applies only after the broker accepts a
message and a downstream consumer dead-letters it — future work.)

## Configuration

Service Bus is **disabled by default**. Local and test runtimes never require a broker or a
connection string.

| Env var | Default | Required when | Notes |
| --- | --- | --- | --- |
| `SERVICE_BUS_ENABLED` | `false` | — | Master switch. `true`/`false`/`1`/`0`. |
| `SERVICE_BUS_CONNECTION_STRING` | `""` | enabled | Secret. Never commit; never logged. |
| `SERVICE_BUS_PUBLISH_TARGET` | `queue` | — | `queue` or `topic`; invalid values fail closed. |
| `SERVICE_BUS_QUEUE_NAME` | `""` | enabled + target=queue | |
| `SERVICE_BUS_TOPIC_NAME` | `""` | enabled + target=topic | |

Validation (`loadConfig` in [../../src/config/index.ts](../../src/config/index.ts)) fails
closed **only when enabled**: a disabled config requires nothing. An invalid publish target or
a non-boolean enabled flag is always rejected.

## Queue vs. topic — v1 decision

**v1 publishes to a single queue (`SERVICE_BUS_PUBLISH_TARGET=queue`).** The outbox currently
carries point-to-point governance events with a single intended processor; a queue is the
simplest correct operational target and supports broker-side duplicate detection keyed on our
stable `MessageId`.

Topic mode is fully supported by config and the publisher (set `publishTarget=topic` +
`SERVICE_BUS_TOPIC_NAME`) for when fan-out to multiple independent subscribers is actually
needed. Designing the subscription/fan-out topology is **future work** and intentionally out
of scope here.

## Message mapping

Built by `AzureServiceBusPublisher.toServiceBusMessage`
([../../src/governance/outbox/AzureServiceBusPublisher.ts](../../src/governance/outbox/AzureServiceBusPublisher.ts)):

| Service Bus field | Source | Notes |
| --- | --- | --- |
| `body` | `message.body` (outbox payload) | Passed through unchanged. |
| `messageId` | `message.messageId` (dedupeKey or outbox row id) | **Stable across retries** so broker duplicate detection (if enabled) collapses idempotent retries. |
| `contentType` | `application/json` | Constant. |
| `subject` | `message.messageType` | Event type / label. |
| `correlationId` | `message.correlationId` | Set only when present. |
| `applicationProperties` | see below | NSO-generic routing/observability metadata only. |
| `sessionId` | **never set** | v1 does not use sessions (`V1_SERVICE_BUS_USES_SESSIONS = false`). |

`applicationProperties`: `outboxMessageId`, `eventType`, `tenantId` (always);
`correlationId`, `causationId`, `dedupeKey`, `createdAt` (ISO), `attempt` (when present).

The publisher carries **no secrets**, no raw SQL/driver errors, and no tenant data beyond the
intended payload + generic routing metadata. `aggregateType`/`aggregateId` are intentionally
omitted: they are not available generically on the outbox row, and the publisher must not
parse domain-specific structure out of `messageType`.

## Retry behavior remains in the OutboxWorker

`publish()` returns a controlled `PublishResult`. A transport/SDK failure is caught and
surfaced as `{ published: false, transient: true, errorMessage }` with a **sanitized**
message — the publisher never throws raw vendor errors at the worker and never marks the row.
The `OutboxWorker` then applies its own policy: reschedule with **true full jitter** until
`maxRetries`, then mark failed. See [outbox-worker-role.md](outbox-worker-role.md) and
[../../src/workers/outbox/backoff.ts](../../src/workers/outbox/backoff.ts).

## Selecting the publisher (factory)

`createOutboxPublisher(config, deps?)`
([../../src/governance/outbox/OutboxPublisherFactory.ts](../../src/governance/outbox/OutboxPublisherFactory.ts)):

- disabled → `NoopServiceBusPublisher` (loud no-op; no client built, no connection string read);
- enabled → `AzureServiceBusPublisher` bound to the configured queue/topic.

The real client is built by `createAzureServiceBusClient`
([../../src/governance/outbox/azureServiceBusClient.ts](../../src/governance/outbox/azureServiceBusClient.ts)) —
the **only** module that imports `@azure/service-bus`. Tests inject a fake `createClient`, so
the vendor SDK is never loaded in unit tests and no secrets are needed.

## How to test locally without Azure

```bash
npm test    # AzureServiceBusPublisher + factory + config tests use fakes only
```

The unit tests exercise mapping, stable MessageId, content type, application properties,
controlled failure handling, sender/client close, factory selection, and an end-to-end
`OutboxWorker` + fake client run — all without a broker. Leave `SERVICE_BUS_ENABLED=false`
(the default); the local/demo API runtime (`npm run dev:api`) continues to require **no**
Service Bus.

## How to enable against Azure Service Bus

> A real broker is required. This was **not** run against Azure in this pass.

1. Create a Service Bus namespace and a **queue** (sessions disabled — v1 does not use them).
2. Provide config via your secret manager (do **not** commit a `.env`):
   ```bash
   SERVICE_BUS_ENABLED=true
   SERVICE_BUS_CONNECTION_STRING="Endpoint=sb://<ns>.servicebus.windows.net/;SharedAccessKeyName=...;SharedAccessKey=..."
   SERVICE_BUS_PUBLISH_TARGET=queue
   SERVICE_BUS_QUEUE_NAME=<your-queue>
   ```
3. Wire the publisher where a worker host runs the loop: build it with
   `createOutboxPublisher(loadConfig())` and pass it to `OutboxWorker`. **This pass does not
   start a worker host** — that is the recommended next pass.

Managed identity is intentionally deferred: v1 is connection-string based, but the factory
boundary makes it straightforward to add a credential-based client later without changing the
publisher or worker.

## Security notes

- **Never commit connection strings.** Supply them via a secret manager (e.g. Azure Key
  Vault) in deployed environments; `.env.example` ships empty values only.
- **Service Bus is not required for local/test.** Disabled is the default and fails open to a
  loud no-op publisher, never a hidden success.
- The **worker-role / RLS model is unchanged.** The publisher never reads governed tables;
  cross-tenant outbox access stays confined to the SECURITY DEFINER functions used by
  `PgOutboxStore`.
- Publish failures surface **sanitized** messages — no secrets, no raw driver/SQL text.

## Not covered (future work)

- Dead-letter (DLQ) handling and downstream consumers.
- Topic/subscription fan-out topology.
- Managed identity / credential-based auth.
- Broker-side duplicate-detection enablement and observability/metrics.
- Production deployment/IaC.

> A worker runtime host/timer that runs `processBatch()` on a schedule now exists; see
> [outbox-worker-runtime.md](outbox-worker-runtime.md).
>
> After this pass the system has a **real publisher** but is **not** production-ready: it
> still needs an auth boundary, observability, secrets management, and deployment hardening.
