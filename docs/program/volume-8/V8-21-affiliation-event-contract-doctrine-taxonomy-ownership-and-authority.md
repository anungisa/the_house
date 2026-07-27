# V8-21 - Affiliation Event-Contract Doctrine, Taxonomy, Ownership, and Authority

Document ID: V8-21
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G3)

## V8-21.1 Purpose

This section is normative.

This chapter opens Package 3 of Volume 8. It defines the doctrine, taxonomy, ownership, and authority of the affiliation event and delivery plane over the frozen Package 1 contract-governance foundation and the frozen Package 2 affiliation logical-contract definition. Package 3 defines event, envelope, outbox, delivery, consumer, webhook, callback, notification, failure, quarantine, boundary, and compatibility obligations only. It authorizes no implementation, no executable event schema, no topic, no broker, no transport, and no provider integration.

## V8-21.2 Package inheritance

This section is normative.

Package 3 inherits the frozen Package 1 foundation and the frozen Package 2 affiliation logical contracts without reopening either. It inherits the corrected Package 2 provenance recorded in the V8-D provenance amendment and the V8-D-1 governance amendment, and the Gate V8-G2 disposition that affiliation logical-contract definition is ready. Package 1 and Package 2 remain frozen; Package 3 adds event and delivery contracts and supersedes nothing already ratified.

## V8-21.3 Events are governed facts, not commands

This section is normative.

An event is the governed record of a fact that has already become true in the House affiliation lifecycle state. A Command requests a governed change and may be accepted or rejected; an event reports a change that has committed. A Command is authorized before it acts; an event is emitted only after its underlying transition has committed. The platform never treats an event as an instruction, and it never treats acceptance of a command as the emission of an event. This distinction is definitional and fails closed: no event is defined that presumes to command, and no command is defined that presumes to have already happened.

## V8-21.4 Event taxonomy

This section is normative.

The affiliation event plane recognizes distinct event types, each with a distinct purpose and audience. A domain event records a committed change within the House affiliation domain for internal consumers. An integration event notifies an external consumer, such as the experience layer, of a governed outcome across a trust boundary. A notification event drives a governed communication to a person. An audit event records a governed fact for the audit and security record. A security-event reference points to a governed security record without carrying its restricted content. An outbox record is the durable internal record from which publication is later attempted. A webhook delivery is an inbound callback from an external provider. A provider callback is the asynchronous provider outcome that must be reconciled. A consumer acknowledgement is a consumer's receipt signal, which is never authoritative reconciliation. A reconciliation signal marks that an unresolved outcome requires authoritative resolution. Each type is distinct; none is a synonym for another.

## V8-21.5 Ownership and authority

This section is normative.

Every affiliation event resolves to the House as institutional authority and to the House affiliation lifecycle state as authoritative source. No experience layer, staff role, consumer, or external provider owns an affiliation event or its authoritative meaning. A consumer may observe an event; it may never redefine it. An external provider may deliver a callback; the authoritative outcome is always the reconciled House record, never the provider's message. An event whose owning authority and authoritative source cannot be named fails closed and is not defined.

## V8-21.6 Producer and consumer contexts

This section is normative.

An event producer context is the governed context in which the House emits events after a committed transition. An event consumer context is the governed context in which a named consumer is entitled to receive events within a tenant scope. A producer context carries the emitting authority; a consumer context carries a subscription grant scoped to a tenant and a purpose. Presence within a context is never, by itself, permission: a consumer receives only the events its grant admits, and a producer emits only events its authority owns.

## V8-21.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no executable event schema, topic, queue, subscription, broker, transport, endpoint, or provider integration, and it changes no governed state. It enables no session-based broker semantics. Every controlled Package 3 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
