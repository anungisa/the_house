# V5-37 - Temporal, Audit, Correction, Provenance, Outbox, and Idempotency Physical Model

Document ID: V5-37
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-37.1 Purpose

This section is normative.

This chapter defines the physical model for temporal truth, state transitions, audit,
correction, provenance, the transactional outbox, and idempotency. It is documentary and
authorizes no implementation. The authoritative records are in REG-501 and the governing
decisions are ADR-V5-035 and ADR-V5-038.

## V5-37.2 Governed state and transition relations

This section is normative.

Governed lifecycle state is held in a state relation that is mutated only through the governed
transition mechanism. Each transition is recorded in a transition-history relation that
preserves the prior and resulting state, the actor, and the time. Transition history is
append-only and represents the temporal truth of a governed entity's lifecycle.

## V5-37.3 Audit relations

This section is normative.

Audit is a governed relation that records governed events with their actor, subject, and time,
carrying a security-audit data-class. Audit records are append-only and are never edited or
deleted through normal operation.

## V5-37.4 Correction and provenance relations

This section is normative.

Corrections are recorded as new rows that reference the corrected record; prior values are
preserved and never overwritten in place, per decision ADR-V5-035. Provenance relations record
the origin and lineage of governed facts, so that every governed value can be traced to its
source.

## V5-37.5 State, audit, and outbox atomicity

This section is normative.

A governed transition writes state, audit, and outbox rows in one transaction, per state,
audit, and outbox atomicity rule INTEG-V5-027 and decision ADR-V5-038. External effects are
published only after commit through the transactional outbox. A publication failure never
erases the committed transition; it is a governed outbox condition, not a lost transition.

## V5-37.6 Outbox relations

This section is normative.

The transactional outbox is a governed relation holding pending governed messages with their
dedupe key, correlation and causation references, delivery status, retry count, and lease
fields. Message delivery is idempotent by dedupe key. The outbox is claimed under a lease so
that concurrent processors do not double-publish, and an expired lease can be recovered.

## V5-37.7 Idempotency relations and integrity

This section is normative.

Command idempotency is enforced by an idempotency-key relation with a uniqueness constraint,
per command idempotency integrity rule INTEG-V5-028. A duplicate governed command produces no
duplicate effect; a retry resolves to the prior result within tenant scope. Concurrency and
locking behaviour of these relations is subject to future validation TEST-V5-028.

## V5-37.8 Downstream constraint

This section is normative.

No downstream volume may mutate state outside the governed transition mechanism, edit or delete
audit or transition history, publish external effects before commit, or omit the idempotency
uniqueness constraint.
