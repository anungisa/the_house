# Outbox worker role model

## Why the outbox worker needs cross-tenant operational access

`governance.outbox_message` is a **tenant-owned** table under `ENABLE` + `FORCE ROW LEVEL
SECURITY` (see `db/migrations/0001_governance_schema.sql`). Normal application/kernel access
is tenant-scoped: the kernel sets `app.tenant_id` transaction-locally and RLS confines every
read/write to that one tenant.

The **outbox processor** (`OutboxWorker` + `PgOutboxStore`) is different. It runs as a
background loop that claims, leases, publishes, and marks outbox rows for **all tenants**. It
has no single tenant context. Under `FORCE` RLS, a non-superuser, non-`BYPASSRLS` role with
no `app.tenant_id` set cannot read tenant-owned rows at all — `governance.current_tenant_id()`
raises `TENANT_CONTEXT_MISSING` and the query fails closed.

We must give the worker cross-tenant access **without** weakening tenant isolation for normal
application traffic, and **without** making the worker a superuser or a `BYPASSRLS` role.

## Chosen strategy — Option 1: SECURITY DEFINER functions

Migration `0004_outbox_worker_functions.sql` adds a **narrow, explicit** operational surface:
six `SECURITY DEFINER` functions in the `governance` schema, each scoped to
`governance.outbox_message` only.

| Function | Purpose |
| --- | --- |
| `claim_outbox_messages(batch_size int, worker_id text, lock_seconds int)` | Atomically claim up to `batch_size` due `pending` rows (`FOR UPDATE SKIP LOCKED`), lease them to `worker_id` for `lock_seconds`, return the claimed rows. Orders by `next_attempt_at`, then `created_at`. |
| `mark_outbox_processed(message_id uuid, published_message_id text)` | Mark a row `processed`, record the broker MessageId, clear the lease. |
| `reschedule_outbox_message(message_id uuid, next_attempt_seconds int, error text)` | Transient failure: return row to `pending`, `retry_count + 1`, push `next_attempt_at` out, clear the lease. |
| `mark_outbox_failed(message_id uuid, error text)` | Permanent failure (or retries exhausted): mark `failed`, clear the lease. Rows are never auto-deleted. |
| `recover_expired_outbox_messages()` | Return rows whose processing lease expired to `pending`. Returns the count recovered. |
| `get_outbox_message(message_id uuid)` | Fetch a single row for worker-side inspection. |

A `SECURITY DEFINER` function runs with the privileges of its **owner** (the migration role),
not the caller. The worker role is granted `EXECUTE` on these functions and **nothing else**
on governed tables. The functions therefore perform the cross-tenant work on the worker's
behalf, while the worker itself holds no broad table privileges.

> **Deviation from the spec's suggested signatures.** The spec suggested a single
> `mark_outbox_failed(message_id, error, next_attempt_at, retry_increment)`. We kept the
> existing `OutboxStore` contract instead, splitting transient retry
> (`reschedule_outbox_message`) from permanent failure (`mark_outbox_failed`). This avoids
> changing the store interface and keeps each function single-purpose. The retry delay is
> computed in TypeScript using **true full jitter** (`src/workers/outbox/backoff.ts`) and
> passed to `reschedule_outbox_message` as a seconds offset.

### Safety properties of the functions

- `SET search_path = governance, pg_catalog` on every function prevents search-path hijacking
  of unqualified names.
- **No dynamic SQL.** Every statement targets `governance.outbox_message` explicitly.
- They read/write **only** `governance.outbox_message` — no other governed table is reachable.
- `EXECUTE` is `REVOKE`d from `PUBLIC`; only the worker-role pattern is granted access.

## Worker role privileges

The production worker connects as a **dedicated** role:

```sql
CREATE ROLE house_outbox_worker LOGIN PASSWORD '...'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA governance TO house_outbox_worker;
GRANT EXECUTE ON FUNCTION governance.claim_outbox_messages(integer, text, integer) TO house_outbox_worker;
GRANT EXECUTE ON FUNCTION governance.mark_outbox_processed(uuid, text)              TO house_outbox_worker;
GRANT EXECUTE ON FUNCTION governance.reschedule_outbox_message(uuid, integer, text) TO house_outbox_worker;
GRANT EXECUTE ON FUNCTION governance.mark_outbox_failed(uuid, text)                 TO house_outbox_worker;
GRANT EXECUTE ON FUNCTION governance.recover_expired_outbox_messages()             TO house_outbox_worker;
GRANT EXECUTE ON FUNCTION governance.get_outbox_message(uuid)                       TO house_outbox_worker;
-- NO direct SELECT/INSERT/UPDATE on any governed table.
```

Migration `0004` performs these grants automatically **if** the role `house_outbox_worker`
already exists (a conditional `DO` block), so the migration is safe to run on databases that
have not provisioned the role.

The role:

- is `LOGIN`, **`NOSUPERUSER`**, **`NOBYPASSRLS`**;
- **owns no governance tables**;
- has **only** `USAGE` on `schema governance` + `EXECUTE` on the six functions;
- has **no** direct `SELECT`/`INSERT`/`UPDATE` on `governance.outbox_message` or any other
  governed table.

`PgOutboxStore` accepts an injectable `pg.Pool`, so production wires the dedicated worker
connection here while other code keeps the default shared pool.

## Why this does not weaken normal app RLS

- The app/kernel role is unchanged. `FORCE` RLS on `governance.outbox_message` is intact; the
  per-tenant `SELECT`/`INSERT`/`UPDATE` policies still apply to it.
- The worker role cannot read or write `governance.outbox_message` **directly** — only through
  the `SECURITY DEFINER` functions. Direct table access returns `permission denied`.
- The worker role is not a superuser and does not `BYPASSRLS`, so it cannot bypass RLS on any
  table for which it might (in future) hold direct grants.
- The cross-tenant capability lives in six auditable functions scoped to a single table, not
  in a broad role attribute.

## Claim / lease / recovery behavior

- **Claim:** `FOR UPDATE SKIP LOCKED` selects up to `batch_size` due `pending` rows ordered by
  `next_attempt_at`, then `created_at`; sets `status = 'processing'`, `locked_by`,
  `locked_until = now() + lock_seconds`, `last_attempt_at`. Concurrent workers skip
  already-locked rows, so a row is never double-claimed.
- **Process:** on successful publish, `mark_outbox_processed` sets `status = 'processed'`,
  `processed_at`, `published_message_id`, and clears the lease.
- **Transient failure:** `reschedule_outbox_message` returns the row to `pending`, increments
  `retry_count`, and schedules `next_attempt_at` using true full jitter.
- **Permanent failure / retries exhausted:** `mark_outbox_failed` sets `status = 'failed'`.
  Rows are never auto-deleted — they remain for triage.
- **Lease recovery:** `recover_expired_outbox_messages` returns rows whose `locked_until` is in
  the past from `processing` back to `pending`, so a crashed worker's rows become claimable.

A publish failure **before** Service Bus accepts a message is a Postgres outbox condition
(`status = 'failed'`/`pending`), **not** a Service Bus dead-letter event. See
[outbox-dead-letter-investigation.md](outbox-dead-letter-investigation.md).

## Running the gated integration tests

The suite `tests/integration/outbox/pg-outbox-store.integration.test.ts` is **skipped by
default** and runs only when `RUN_DB_TESTS=1` and an admin connection URL is provided. It is
self-provisioning: using the admin connection it applies migrations and creates two
least-privilege roles (idempotent):

- `house_outbox_worker_test` — the worker role (EXECUTE on the six functions, no table grants);
- `house_app_outbox_test` — a normal app role (RLS-confined table access, no function access).

Worker and app connection strings are derived from the admin URL with the provisioned
credentials. `OUTBOX_DATABASE_URL`, if set, overrides the base for the worker connection.

```bash
# Example against a local Docker Postgres (admin = superuser applies DDL + provisions roles).
docker run -d --name house_pg_test \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=the_house_test \
  -p 55432:5432 postgres:16

RUN_DB_TESTS=1 \
MIGRATE_DATABASE_URL=postgres://postgres:postgres@localhost:55432/the_house_test \
DATABASE_URL=postgres://postgres:postgres@localhost:55432/the_house_test \
  npm run test:integration
```

The suite asserts: migrations install the six functions; the worker role is
`NOSUPERUSER`/`NOBYPASSRLS` and owns no governance tables; a normal app role cannot call the
claim function and cannot read cross-tenant rows; claim sets `processing` + lease;
concurrent workers never double-claim; processed/reschedule/failed transitions; expired-lease
recovery; deterministic claim ordering; the worker has no direct table access; and normal
app-role RLS still fails closed without tenant context.

## What remains stubbed

- **Real Azure Service Bus publisher.** A real publisher now exists
  (`AzureServiceBusPublisher`, selected by `createOutboxPublisher` when
  `SERVICE_BUS_ENABLED=true`); see
  [azure-service-bus-publisher.md](azure-service-bus-publisher.md). It is **disabled by
  default** (Noop publisher) and is not yet wired into a running worker host.
- **DLQ processor.** Downstream Service Bus dead-letter handling is not implemented.
- **Production observability / alerting.** No metrics, dashboards, or alerts on outbox lag,
  failed-row growth, or lease churn.
- **Worker runtime host.** The timer-triggered (Azure Function-compatible) loop that calls
  `OutboxWorker.processBatch()` on a schedule is not provisioned in this pass.
