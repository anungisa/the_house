# Governance Kernel FSM vertical slice — AffiliationApplication v1

This document describes the first production-grade Governance Kernel slice: the
AffiliationApplication lifecycle finite state machine, executed atomically through the
kernel with guards, permissions, idempotency, append-only journal/audit, evidence
metadata, and a transactional outbox plus its processor.

It is intentionally NSO-GENERIC. No curling-specific terms (PTSO/MA/club/curler/bonspiel)
appear in platform-core code; sport mapping lives only in sport profiles/fixtures.

## What was implemented

- **Schema** (`db/migrations/0001_governance_schema.sql`): 13 `governance.*` tables, the
  `governance.current_tenant_id()` RLS helper (fails closed when `app.tenant_id` is unset),
  indexes, and **RLS ENABLE + FORCE** on the seven tenant-owned tables.
- **Seed** (`db/migrations/0002_affiliation_application_v1_seed.sql`): the global
  AffiliationApplication v1 policy version, state machine, 10 state nodes, 12 transition
  definitions, 6 guard definitions, and guard bindings. Idempotent (`ON CONFLICT DO
  NOTHING`).
- **Migration runner** (`scripts/db-migrate.ts`): applies `db/migrations/*.sql` in order,
  each in its own transaction, recorded in `public.schema_migrations`.
- **DB access layer** (`src/db/pool.ts`): pooled `pg` client, `withTenantTransaction()`
  (sets `app.tenant_id` transaction-locally so RLS applies), `selectForUpdate()`.
- **Kernel ports** (`src/governance/kernel/ports.ts`): `GovernanceStore` / `GovernanceTx`
  hexagonal interfaces + row DTOs + `PermissionChecker`.
- **Kernel** (`src/governance/kernel/GovernanceKernel.ts`): the full governed algorithm.
- **Guards** (`src/governance/guards/handlers.ts`): 6 read-only named handlers + a
  read-only `AffiliationGuardRepository` port (default payload-backed stub).
- **Permissions** (`src/governance/permissions/PermissionChecker.ts`): `DefaultPermissionChecker`.
- **Stores**: `InMemoryGovernanceStore` (unit tests), `PgGovernanceStore` (integration),
  `InMemoryOutboxStore`, `PgOutboxStore`.
- **Outbox processor** (`src/workers/outbox/OutboxWorker.ts`): recover → claim → publish →
  mark, with true full-jitter backoff.
- **Docs**: this note + `outbox-dead-letter-investigation.md`.

## State machine

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> submitted: submit
    submitted --> under_review: review_start
    under_review --> approved: approve (approval)
    under_review --> rejected: reject (approval)
    approved --> active: activate
    active --> suspended: suspend (approval)
    suspended --> active: reinstate (approval)
    active --> revoked: revoke (approval)
    suspended --> revoked: revoke (approval)
    revoked --> closed: close
    rejected --> closed: close
    closed --> archived: archive
    archived --> [*]
```

- **Low-risk** (no evidence): `submit`, `review_start`, `activate`.
- **High-risk** (evidence required): `approve`, `reject`, `suspend`, `reinstate`,
  `revoke`, `close`, `archive`.
- **Approval-required** (creates a `transition_request`, no state mutation):
  `approve`, `reject`, `suspend`, `reinstate`, `revoke`.
- `close` and `archive` are high-risk + evidence-required but **not** approval-required.

### Guard bindings

| Trigger (from) | Guards |
| --- | --- |
| submit (draft) | required fields, required docs |
| review_start (submitted) | reviewer scope |
| approve (under_review) | no open compliance flags, fees paid, reviewer scope |
| reject (under_review) | reviewer scope |
| activate (approved) | season is current |
| suspend (active) | reviewer scope |
| reinstate (suspended) | no open compliance flags, reviewer scope |
| revoke (active / suspended) | reviewer scope |
| close (revoked / rejected) | reviewer scope |
| archive (closed) | reviewer scope |

## Transition flow (kernel algorithm)

1. Validate input (tenant context present; actor/context tenant match; required fields).
2. **Fast idempotency lookup outside the transaction.** If a prior executed transition or
   recorded request exists for the idempotency key → return `idempotent_replay`.
3. `BEGIN` (the store sets `app.tenant_id` transaction-locally → RLS applies).
4. **In-transaction idempotency double-check.**
5. Resolve the active state machine (fail closed if none).
6. Lock `entity_state` `FOR UPDATE`, or bootstrap `fromState` = the machine's initial state
   (`draft`) when no row exists.
7. Resolve the transition definition by `(machine, fromState, trigger)`; **deny unknown
   → `UNKNOWN_TRANSITION` (fail closed).**
8. Permission check; on denial return `rejected` (`PERMISSION_DENIED`), no mutation.
9. Load guard bindings; **deny unknown guard code → `UNKNOWN_GUARD` (fail closed).**
10. Evaluate guards (read-only) and **persist guard results**.
11. If any guard fails → return `rejected` (`GUARD_FAILED`), **no state mutation** (guard
    results remain recorded for audit).
12. If approval is required → insert `transition_request` (+ workflow placeholder) and an
    audit event; **no entity_state mutation, no outbox, no evidence**; return
    `approval_required`.
13. Otherwise execute: update or insert `entity_state`.
14. Append `state_transition` (immutable journal).
15. Append `audit_event`.
16. If evidence is required, insert `evidence_object` **metadata** (manifest/hash refs —
    never blob content).
17. Enqueue an `outbox_message` in the **same transaction** (stable
    `dedupe_key = entityType:entityId:idempotencyKey`; `correlation_id` propagated;
    `causation_id` = the new `state_transition.id`).
18. `COMMIT`. External side effects happen only afterward via the outbox processor.
19. Return a deterministic `TransitionResult`.

## Guard pattern (no dynamic rule engine)

Guards are **named TypeScript handlers** in a registry, bound to transitions in the
database with per-binding `parameters`. There is **no dynamic JSON expression evaluation**.
Handlers are read-only and dependency-injected via `AffiliationGuardRepository`. Unknown
guard codes fail closed.

## Idempotency

Enforced at four layers:

1. Kernel fast pre-check (outside the transaction).
2. In-transaction double-check.
3. Database unique constraints on
   `(tenant_id, entity_type, entity_id, idempotency_key)` for both `state_transition` and
   `transition_request`.
4. Stable outbox `dedupe_key` (partial unique `(tenant_id, dedupe_key)`), used as the
   Service Bus `MessageId` for broker-side de-duplication.

A retry with the same idempotency key returns the prior result and creates no duplicate
state transition, request, audit event, evidence object, or outbox message.

## Outbox behaviour

- The kernel writes the outbox row in the same transaction as the transition.
- The processor recovers expired leases, claims pending rows
  (`FOR UPDATE SKIP LOCKED` + `locked_until`/`locked_by`), publishes, and marks
  processed/pending/failed.
- Backoff is **true full jitter**:
  `cap = min(maxDelayMs, baseDelayMs * 2^attempt)`, `delay = random int in [0, cap]`.
- **Service Bus sessions are NOT enabled in v1** (`V1_SERVICE_BUS_USES_SESSIONS === false`).
- A publish failure before broker acceptance is a Postgres outbox condition, not a Service
  Bus DLQ event — see `outbox-dead-letter-investigation.md`.

## Intentional stubs

- **`NoopServiceBusPublisher`**: `publish()` throws; it is the default when Service Bus is
  disabled. A real `AzureServiceBusPublisher` now exists and is selected by
  `createOutboxPublisher` when `SERVICE_BUS_ENABLED=true` (see
  [azure-service-bus-publisher.md](azure-service-bus-publisher.md)); a worker runtime host
  that runs the loop is a later pass. The `OutboxPublisher` interface and the worker are
  production-ready.
- **`PayloadBackedAffiliationGuardRepository`**: guard facts are read from
  `input.payload.facts` so the slice is testable end-to-end without building the real
  affiliation/payment/compliance data sources. The repository **interface** is production-ready.
- **Definition-table RLS**: definitions hold only global (`tenant_id IS NULL`) rows in v1
  and are not under RLS; tenant-specific overrides + RLS are a future addition.

## Running

```bash
# Unit tests (hermetic; in-memory stores)
npm test

# Apply migrations to a real database
DATABASE_URL=postgres://USER:PASS@HOST:5432/DB npm run db:migrate

# Integration tests (gated). Use a NON-superuser, non-BYPASSRLS role for RLS assertions.
RUN_DB_TESTS=1 DATABASE_URL=postgres://USER:PASS@HOST:5432/DB npm run test:integration
```

## Deferred (out of scope for this slice)

- PTSO/CC two-tier review substates and `more_info_needed` handling are **not** added to
  the v1 FSM. They remain forward-compat metadata on the transition request
  (`workflowMetadata` / `workflow_ref`) without expanding the state machine.
- The real Service Bus publisher and real guard data sources.
- Tenant-specific policy/state-machine overrides.

**Hard stop:** no frontend, no additional domain entities, no microservices, no AI
features, no generic workflow builder were added.
