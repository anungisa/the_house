# ADR-0001 — Governance Kernel as Non-Bypassable Lifecycle Authority

## Status

Proposed

## Context

The House v2 is the governed enterprise backend platform core for Canadian NSO operations.

The platform must support multi-tenant workflows, NSO/PTSO/club hierarchy, compliance obligations, lifecycle state, auditability, evidence, consent, payments, and reporting.

In prototype systems, lifecycle rules often become scattered across UI code, route handlers, background jobs, and admin tools. That creates authorization drift, inconsistent audit trails, and status mutations that cannot be explained later.

The House v2 must avoid that failure mode.

## Decision

The House v2 will use a Governance Kernel as the sole authority for governed lifecycle transitions.

Domain modules may request transitions, but they may not directly mutate governed state/status fields.

The Governance Kernel will enforce:

- tenant context
- state machine transition resolution
- permissions
- registered guard evaluation
- idempotency
- transition history
- audit event creation
- evidence metadata creation
- approval workflow request handling
- transactional outbox enqueueing

Unknown transitions, guards, and permissions fail closed.

## Architecture Pattern

Use a hybrid declarative finite state machine:

- states are typed and seeded
- transition definitions live in PostgreSQL
- guard logic lives in named TypeScript handlers
- guard parameters live in transition_guard.parameters
- every transition resolves to a policy/state-machine version

No dynamic JSON expression rule engine will be used.

## Consequences

Positive:

- lifecycle behavior is auditable
- policy changes are versionable
- domain modules stay simpler
- state changes are explainable
- idempotent retry becomes enforceable
- evidence/audit creation is automatic
- cross-tenant safety is easier to verify

Tradeoffs:

- more upfront kernel design
- more schema discipline
- simple domain changes require transition definitions
- developers must not bypass the kernel

## Operational Rules

Every governed transition must:

1. set tenant context
2. lock current entity state
3. resolve transition definition
4. fail closed if unknown
5. check permission
6. evaluate registered guards
7. persist guard results
8. handle approval requirements
9. update entity state only if executable
10. append transition journal
11. append audit event
12. create evidence metadata when required
13. enqueue outbox message
14. commit atomically

External side effects happen after commit through the outbox processor.

## Initial Slice

The first implementation slice is AffiliationApplication v1.

The slice must prove the full governed transition path before expanding to other domain entities.
