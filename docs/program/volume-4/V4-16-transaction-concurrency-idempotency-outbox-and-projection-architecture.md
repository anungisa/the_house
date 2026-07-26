# V4-16 - Transaction, Concurrency, Idempotency, Outbox, and Projection Architecture

Document ID: V4-16  
Title: Transaction, Concurrency, Idempotency, Outbox, and Projection Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-021)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-16.1 Purpose and scope

This section is normative.

This chapter defines the consistency boundaries for governed effects: units of work, concurrency
control, idempotency, the transactional outbox, projections, and recovery. It is architecture
definition. It does not implement transactions, choose a concrete persistence engine's isolation
level, or author executable event contracts.

## V4-16.2 Consistency concerns

This section is normative.

The architecture addresses the following concerns:

- unit of work;
- aggregate or module transaction boundaries;
- optimistic or explicit concurrency control;
- command deduplication;
- idempotency keys;
- transition execution;
- audit persistence;
- outbox persistence;
- outbox publication;
- retry;
- duplicate delivery;
- projection updates;
- replay;
- poison-event handling;
- reconciliation;
- manual recovery.

## V4-16.3 Unit of work and atomicity

This section is normative.

A command executes within a single unit of work bounded by an aggregate or module transaction
boundary. Within that unit of work, the governed state change, its audit records, and its required
outbox records commit **atomically**. A partial commit that records state without audit and required
outbox records, or the reverse, is prohibited.

## V4-16.4 Concurrency and command deduplication

This section is normative.

Concurrent modification is controlled by optimistic or explicit concurrency control; a conflicting
write produces a concurrency conflict (see V4-14) rather than a silent overwrite. Commands carry
idempotency keys; command deduplication ensures that a repeated command with the same key does not
produce a duplicate authoritative effect.

## V4-16.5 Activation effect distinctions

This section is normative.

The activation architecture distinguishes the following, which are never conflated:

```
Governed transition execution
Authoritative affiliation activation
External acknowledgement
Projection update
Notification
```

The authoritative activation effect is committed **once** through transactional state control and
idempotent command execution. External messages remain **at-least-once** unless a stronger contract
is independently established; the platform does not claim distributed exactly-once delivery.

## V4-16.6 Outbox and publication

This section is normative.

Outbox records are persisted in the same transaction as the governed state change. Publication occurs
after commit. Publication failure does not roll back an already committed authoritative transition;
it is retried. Duplicate delivery is expected under at-least-once semantics and is tolerated by
idempotent consumers. No production-required outbox effect uses a no-op publisher.

## V4-16.7 Projections, replay, and poison events

This section is normative.

Projections (read models) are updated from authoritative state and outbox records. A projection
failure does not redefine the governed state; the authoritative record remains the source of truth
and the projection is rebuilt. **Replay** of outbox or projection processing is observable and
controlled. **Poison-event handling** isolates events that cannot be processed for governed
investigation rather than silently discarding them.

## V4-16.8 Required invariants

This section is normative.

- state, audit, and required outbox records commit atomically;
- duplicate activation commands cannot create duplicate authoritative effects;
- publication failure does not roll back an already committed authoritative transition;
- projection failure does not redefine the governed state;
- replay is observable and controlled;
- no production-required outbox effect uses a no-op publisher.

## V4-16.9 Boundaries

This section is normative.

This chapter defines consistency architecture conceptually. It does not implement outbox mechanics,
select a message broker, define event payload schemas, or set a concrete isolation level; those are
downstream of Gate V4-G2 and subject to the PostgreSQL concurrency posture and outbox operational
ownership assumptions recorded in REG-404.
