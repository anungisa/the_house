# V8-26 - Affiliation Consumer Idempotency, Deduplication, Ordering, Concurrency, and Replay

Document ID: V8-26
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G3)

## V8-26.1 Purpose

This section is normative.

This chapter defines the obligations of affiliation event consumers: idempotency, deduplication, ordering scope, concurrency preconditions, and replay handling. Because delivery is at-least-once, consumers carry the burden of converging duplicate and out-of-order deliveries on a single correct outcome. This chapter defines required consumer meanings and defines no consumer implementation, framework, or storage.

## V8-26.2 Consumer idempotency

This section is normative.

Every affiliation event consumer is idempotent: processing the same event more than once produces the same result as processing it once. Idempotency is required because delivery is at-least-once and duplicates are expected. A consumer that cannot establish an idempotency requirement fails closed and is not defined. Idempotency is stated against the event's unique identity and the consumer's own governed effect; this chapter defines no idempotency key store or mechanism.

## V8-26.3 Deduplication scope

This section is normative.

Every consumer requirement names a deduplication scope: the boundary within which two deliveries are recognized as the same event and collapsed to one effect. Deduplication is scoped explicitly — for example, per event identity within a tenant — and is never presumed global without a stated scope. A deduplication requirement without a named scope fails closed. This chapter defines the required scoping meaning, not a deduplication cache or window.

## V8-26.4 Ordering scope

This section is normative.

Ordering is scoped explicitly and global ordering is never presumed. A consumer that requires ordering states the scope within which order is guaranteed — for example, per affiliation aggregate — and tolerates arbitrary order outside that scope. The default ordering posture is that global ordering is not presumed, and a consumer that would silently depend on global order fails closed. This chapter defines required ordering meanings and enables no broker session or global sequencing mechanism.

## V8-26.5 Concurrency preconditions

This section is normative.

A consumer that changes governed or derived state states its concurrency precondition: the condition on which its effect is safe under concurrent and repeated delivery, such as a required current state or a version precondition. When the precondition does not hold, the consumer resolves to a governed conflict outcome rather than overwriting a newer state. Concurrency preconditions and conflict outcomes are required consumer meanings; this chapter defines no locking, versioning, or transaction mechanism.

## V8-26.6 Replay handling

This section is normative.

A consumer distinguishes an original event from a governed replay by the event's replay marking and handles a replay without producing a duplicate business effect. A replay re-establishes a consumer's derived state where required and never re-triggers a one-time effect that has already occurred. Governed replay is an authoritative re-emission under authority and evidence, not an arbitrary re-send; consumer replay handling relies on idempotency and deduplication and defines no replay engine.

## V8-26.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no consumer service, framework, key store, cache, lock, or subscription, and it changes no governed state. It enables no broker sessions or global ordering. Every controlled Package 3 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
