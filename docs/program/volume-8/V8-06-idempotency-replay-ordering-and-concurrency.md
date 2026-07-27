# V8-06 - Idempotency, Replay, Ordering, and Concurrency

Document ID: V8-06
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G1)

## V8-06.1 Purpose

This section is normative.

This chapter governs the idempotency, replay, ordering, and concurrency obligations that every retryable or concurrent interaction must satisfy. It states how repetition, replay, and contention must be handled so that governed effects remain exactly-once in business terms even when delivery is at-least-once. It governs obligations, not the executable mechanism.

## V8-06.2 Idempotency

This section is normative.

Every idempotency requirement names the idempotency key and the scope under which repeated submission produces no additional governed effect. Idempotency is a business invariant: the governed outcome of processing a request once and processing it many times must be identical. A requirement that names no idempotency key or scope, and no deduplication scope, fails closed.

Idempotency is enforced at multiple layers: a pre-check, an in-transaction re-check, and a durable uniqueness constraint. Volume 8 states the obligation; it does not build the constraint.

## V8-06.3 Replay

This section is normative.

Every replay requirement names its replay posture: whether replayed messages are absorbed idempotently, rejected as duplicates, or reconciled. A consumer must be able to distinguish a first delivery from a replay. A replay requirement that names no posture fails closed.

## V8-06.4 Ordering

This section is normative.

Every ordering requirement names the order the interaction guarantees: none, per-aggregate, per-partition-scope, or a global order that is explicitly not presumed. No interaction may assume an order it was not granted, and a consumer may not reconstruct a global order from interactions that do not provide one.

## V8-06.5 Concurrency and conflict

This section is normative.

Every delivery, idempotency, or replay requirement names its concurrency precondition or its conflict outcome: how concurrent attempts to change the same governed state are serialized, and what outcome a losing attempt receives. A requirement that names neither a concurrency precondition nor a conflict outcome fails closed.

Concurrent conflict resolves to an explicit governed outcome — accepted, rejected, or reconciled — never to a silent overwrite.

## V8-06.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It builds no idempotency store, uniqueness constraint, lock, or ordering mechanism. Every controlled idempotency, replay, ordering, and concurrency record remains in a not-implemented-or-not-proven posture and authorizes no construction.
