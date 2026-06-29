# Outbox worker runtime host

The transactional outbox guarantees that a governed transition and its outbox row commit
together (see [governance-kernel-fsm-slice.md](./governance-kernel-fsm-slice.md)). Something
still has to **drain** that table: claim pending rows, publish them, and mark the result.
That mechanism is `OutboxWorker.processBatch()` (recover expired leases → claim a batch →
publish via the publisher abstraction → mark processed/rescheduled/failed).

This document covers the **runtime host** that schedules `processBatch()` so the outbox is
actually drained on an interval — turning the publisher from a library into something
operational, without pretending the whole system is production-ready.

## Components

| Concern | File |
| --- | --- |
| Drain mechanics (claim/publish/mark) | `src/workers/outbox/OutboxWorker.ts` |
| Runtime loop (schedule / overlap-guard / graceful shutdown) | `src/workers/outbox/OutboxWorkerRuntime.ts` |
| Process entrypoint | `scripts/outbox-worker.ts` (`npm run worker:outbox`) |
| Worker DB access (SECURITY DEFINER functions) | `src/governance/outbox/PgOutboxStore.ts` (migration `0004`) |
| Publisher selection (Noop vs Azure) | `src/governance/outbox/OutboxPublisherFactory.ts` |

```
OutboxWorkerRuntime  ── interval / run-once, overlap guard, graceful shutdown
  └─ OutboxWorker.processBatch()         recover → claim → publish → mark
       ├─ PgOutboxStore                  SECURITY DEFINER worker functions (worker role)
       └─ OutboxPublisher                Noop (disabled) | AzureServiceBusPublisher (enabled)
```

`OutboxWorkerRuntime` depends only on a small `OutboxWorkerRunnable` (just `processBatch`)
plus optional `closePublisher` / `closePool` callbacks, and its timer functions are
injectable. That keeps the loop fully unit-testable with fakes — no real broker, no real
database.

## Running locally

```bash
npm run worker:outbox
```

Requires `DATABASE_URL`. In real deployments point it at the dedicated SECURITY DEFINER
worker role (`house_outbox_worker`), not an RLS-bypassing superuser — see
[outbox-worker-role.md](./outbox-worker-role.md). Azure Service Bus stays **disabled** unless
`SERVICE_BUS_ENABLED=true`; while disabled the worker uses the no-op publisher and never
contacts Azure — see [azure-service-bus-publisher.md](./azure-service-bus-publisher.md).

## Configuration

All settings live under `config.outboxWorker` (`src/config/index.ts`) and fail closed on
invalid input.

| Env var | Default | Meaning |
| --- | --- | --- |
| `OUTBOX_WORKER_ENABLED` | `true` | When `false`, the entrypoint logs and exits without starting. |
| `OUTBOX_WORKER_INTERVAL_MS` | `5000` | Delay between ticks in continuous mode (positive integer). |
| `OUTBOX_WORKER_BATCH_SIZE` | `25` | Rows claimed per batch (positive integer). |
| `OUTBOX_WORKER_ID` | `local-outbox-worker` | Stable worker identity for lease ownership (non-empty). |
| `OUTBOX_WORKER_LOCK_SECONDS` | `60` | Lease duration for claimed rows (positive integer). |
| `OUTBOX_WORKER_RUN_ONCE` | `false` | Process one batch then exit (cron / smoke test). |

Backoff for rescheduled/failed rows reuses the existing `OUTBOX_*` tuning
(`baseDelayMs`/`maxDelayMs`/`maxRetries`, with true full jitter) — the runtime host does not
introduce its own retry policy.

## Behaviour

- **Continuous mode** (default): schedules `processBatch()` every `intervalMs`. The process
  stays alive until it receives `SIGINT`/`SIGTERM`.
- **Run-once mode**: processes exactly one batch, then shuts down (closing resources) and
  exits `0`.
- **No overlapping batches**: if a tick fires while the previous batch is still running, the
  tick is skipped (logged as `skipping tick: previous batch still running`). The next tick
  proceeds normally once the in-flight batch finishes.
- **Survives per-batch errors**: an error from `processBatch()` is logged via the error sink
  (`outbox batch encountered an operational error; worker stays alive`) and the loop keeps
  running. Individual message publish failures are already handled inside `OutboxWorker`
  (reschedule with backoff / fail after `maxRetries`).
- **Graceful shutdown**: on signal the runtime stops scheduling, waits for any in-flight
  batch to finish, then closes the publisher (broker client) and the database pool. Shutdown
  is idempotent.

## What this pass is NOT

This is worker runtime orchestration only. It deliberately does **not** include:

- an Azure Functions host or any cloud trigger binding;
- a dead-letter / downstream consumer (publisher-side failures are failed Postgres outbox
  rows, not Service Bus DLQ events — see [outbox-dead-letter-investigation.md](./outbox-dead-letter-investigation.md));
- production observability (metrics, tracing, alerting, health endpoints);
- multi-process leader election or distributed coordination (lease-based claiming already
  makes multiple workers safe, but no election is performed);
- secrets management, deployment, or IaC.

After this pass the system is still **not production-ready**: it needs an auth/edge identity
boundary, real evidence/document storage, observability, and deployment/secrets hardening.
