# Copilot Instructions — The House v2

## Repository Intent

The House v2 is the governed backend platform core for Canadian National Sport Organization operations.

It is designed to become the system of record beneath experience layers such as The Button.

Treat this repo as an enterprise backend/platform repo, not a prototype UI repo.

## Default Engineering Posture

Prefer:

- modular monolith
- explicit bounded contexts
- PostgreSQL-backed state
- tenant-aware data access
- deterministic workflows
- versioned governance policy
- append-only audit
- immutable evidence metadata
- transactional outbox
- test-first changes where practical

Avoid:

- uncontrolled frontend expansion
- microservices by default
- arbitrary JSON rule execution
- direct status mutations
- duplicated permission systems
- hidden side effects
- non-idempotent workflows
- cross-tenant assumptions

## Governance Kernel Rules

The Governance Kernel owns lifecycle state transitions.

All state transitions must:

1. validate tenant context
2. lock current entity state
3. resolve an allowed transition
4. fail closed when unknown
5. check permissions
6. evaluate registered guards
7. persist guard results
8. handle approval requirements without mutating state prematurely
9. update entity state only through the kernel
10. append transition history
11. append audit event
12. create evidence metadata when required
13. enqueue outbox messages inside the same transaction
14. avoid external side effects inside the transaction

## Guard Rules

Guards are named TypeScript handlers registered in a guard registry.

Do not implement arbitrary expression evaluation.

Guard handlers must be:

- read-only
- testable
- dependency-injected or repository-backed
- explicit about parameters
- explicit about failure messages

Unknown guard code must block the transition.

## Idempotency Rules

Every governed transition request must include an idempotency key.

Idempotency must be enforced by:

- kernel pre-check
- transaction-level double-check
- database unique constraint
- stable outbox dedupe key
- stable Service Bus MessageId in publisher code

Idempotent retries must not duplicate:

- state transitions
- transition requests
- audit events
- evidence objects
- outbox messages

## Outbox Rules

Use a transactional outbox.

The kernel writes the outbox row in the same database transaction as the governed transition.

The outbox processor publishes after commit.

Publisher failures are not Service Bus DLQ events. They are failed/pending Postgres outbox rows.

Service Bus DLQ handling applies only after Service Bus accepts a message and a downstream consumer fails it.

Use true full jitter for retry delays:

cap = min(maxDelayMs, baseDelayMs * 2^attempt)
delay = random integer between 0 and cap

Do not call bounded plus/minus jitter "full jitter."

Do not enable Azure Service Bus sessions in v1.

## RLS Rules

Every tenant-owned governance table must include tenant_id and RLS.

Application code must set tenant context inside the transaction before governed table access.

Use fail-closed behavior for missing tenant context.

Do not connect as a role that bypasses RLS for normal application access.

## Testing Expectations

For Governance Kernel work, tests should cover:

- unknown transition denied
- unknown guard denied
- wrong tenant denied
- wrong permission denied
- failed guard blocks transition
- successful transition writes state, journal, audit, evidence metadata, and outbox
- idempotent retry returns previous result
- approval-required transition does not mutate state
- outbox claim is concurrency-safe
- expired outbox lease can recover
- publish failures retry and eventually fail
- Service Bus sessions are not enabled in v1

## Completion Format

When finishing work, summarize:

- files changed
- migrations added
- commands run
- tests added
- test/build status
- known gaps
- intentional stubs
