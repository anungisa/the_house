# V8-24 - Affiliation Transactional Outbox, Publication, Acknowledgement, and Delivery Semantics

Document ID: V8-24
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G3)

## V8-24.1 Purpose

This section is normative.

This chapter defines the transactional-outbox contract for affiliation events and the delivery semantics that govern how outbox records become published events. It defines required meanings — atomicity, publication eligibility, acknowledgement, and delivery guarantee boundaries — and defines no broker, queue technology, retry interval, or transport implementation.

## V8-24.2 Atomicity requirement

This section is normative.

The authoritative affiliation state change and the outbox record of its event share one logical atomicity requirement: both are written in the same committed governance transaction, or neither is. An event is never durably recorded without its underlying committed state change, and a committed state change that requires an event never omits the outbox record. This atomicity is the same transactional-outbox obligation carried by the governance kernel; it is defined here as a required meaning and is not an implementation of any table, lock, or transaction manager.

## V8-24.3 Persistence is not publication

This section is normative.

Writing an outbox record is distinct from publishing an event. The outbox record is the durable internal record that a governed event is owed to consumers; publication is the later, separately governed attempt to deliver it. An event is not considered published merely because it is recorded, and a record that has not yet been published remains owed rather than lost. Publication is attempted only after the governing transaction has committed; no external delivery occurs inside the governance transaction.

## V8-24.4 Publication eligibility

This section is normative.

An outbox record becomes eligible for publication only after its governing transaction commits and its publication preconditions are satisfied. Publication eligibility is a governed property of the record, not a property of any consumer's demand: a consumer requesting an event does not make an ineligible record eligible, and an eligible record remains owed until it is published or governed to a terminal disposition. A record that cannot establish eligibility fails closed and is not published.

## V8-24.5 Delivery semantics: at-least-once transport, exactly-once effect

This section is normative.

Affiliation event delivery is at-least-once at the transport boundary: a published event may be delivered more than once, and consumers must tolerate duplicates. At-least-once transport is distinct from exactly-once business effect: the exactly-once guarantee that matters — for example, that an affiliation is activated once — is a business invariant enforced by governed state and consumer idempotency, not a transport promise. The platform never presumes exactly-once transport and never substitutes transport delivery for a governed business invariant. Session-based broker ordering is not enabled.

## V8-24.6 Acknowledgement and publisher-failure boundary

This section is normative.

A consumer acknowledgement is a receipt signal that a published event was accepted for processing; it is not authoritative reconciliation and never redefines the event's meaning. A publisher failure before a transport accepts an event is not a dead-letter event: it leaves the outbox record owed and pending in the House record, to be attempted again under governed publication. A dead-letter disposition applies only after a transport has accepted an event and a downstream consumer has failed it. This chapter defines these boundaries as required meanings and defines no acknowledgement protocol, dead-letter queue, or retry schedule.

## V8-24.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no broker, queue, table, transaction manager, retry interval, dead-letter mechanism, or transport, it enables no broker sessions, and it changes no governed state. Every controlled Package 3 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
