# V8-05 - Event, Outbox, and Webhook Doctrine

Document ID: V8-05
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G1)

## V8-05.1 Purpose

This section is normative.

This chapter governs the doctrine for domain events, integration events, notification events, audit events, the transactional outbox that emits them, and the webhooks that deliver them to external parties. It governs delivery obligations, not the broker, transport, or executable emitter.

## V8-05.2 Event envelope

This section is normative.

Every event class names the envelope fields it must carry: a stable event identity, the event type, the originating authority, the tenant or organization scope, a correlation identity, a causation identity, and an occurrence time. An event that names no envelope is undefined and fails closed. The envelope is the contract; the payload is subordinate to it.

## V8-05.3 Delivery posture

This section is normative.

Every event class names its delivery posture. Governed events are emitted through the transactional outbox and delivered at least once; consumers must therefore be prepared for duplicate delivery. No event class may claim exactly-once delivery. An event that names no delivery posture fails closed.

The outbox is the sole governed path from a committed state change to an emitted integration event. External side effects never occur inside the governing transaction; they occur only after commit, driven by the outbox. A publisher failure before a broker accepts a message is a failed outbox row, not a broker dead-letter event.

## V8-05.4 Ordering

This section is normative.

Every event class names its ordering requirement: none, per-aggregate, per-partition-scope, or a global order that is explicitly not presumed. Consumers may not assume a global order that the event class does not grant. An event that names no ordering requirement fails closed.

## V8-05.5 Webhook doctrine

This section is normative.

Every webhook class names its authentication requirement, its integrity requirement, and its replay posture. A webhook delivered to an external party must allow the receiver to authenticate the sender, verify the integrity of the payload, and reject or absorb replays. A webhook that names no authentication, no integrity, or no replay posture fails closed.

A webhook is an at-least-once delivery to a party outside the trust boundary; it carries no authority and conveys only what its named authoritative source permits.

## V8-05.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It configures no broker, topic, subscription, outbox table, or webhook endpoint, and it does not enable broker sessions. Every controlled event and webhook record remains in a not-implemented-or-not-proven posture and authorizes no construction.
