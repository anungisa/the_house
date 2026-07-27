# V8-47 - Error, Conflict, Retry, Unknown-Outcome, Compensation, and Reconciliation Synthesis

Document ID: V8-47
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G5)

## V8-47.1 Purpose

This section is normative.

This chapter synthesises the error, conflict, retry, unknown-outcome, compensation, and reconciliation contracts defined in the frozen packages. It authorizes no implementation and defines no new contract; it restates the governing distinctions that keep failure handling controlled, privacy-safe, and language-neutral.

## V8-47.2 Error semantics

This section is normative.

Every governed error carries a language-neutral canonical code, a user-safe semantic, and a privacy constraint. The canonical code is stable and machine-interpretable and is distinct from any human-readable message; user-facing text is bilingual and minimum-necessary and never discloses restricted evidence, internal state, or another party's information. An error is classified as retryable, non-retryable, or conditional, and that classification is part of the contract.

## V8-47.3 Conflict and retry

This section is normative.

A conflict is a governed outcome — two requests contending for the same resource — and is resolved deterministically, not by silent overwrite. Retries are safe only for idempotent operations carrying a stable idempotency key; a retry of a non-idempotent operation is a distinct request and is governed as such. Retry backoff uses true full jitter, where the delay is a random value between zero and a capped exponential bound, so that retries do not synchronise.

## V8-47.4 Unknown outcomes

This section is normative.

An unknown outcome is a first-class governed state. When a caller cannot determine whether an operation took effect — for example, when a network call times out before a response is received — the outcome is unknown, not failed. A timeout is not a confirmed failure; treating an unknown outcome as a definite success or a definite failure fails closed. An unknown outcome is resolved by reconciliation against authoritative state, never by assumption.

```
Timeout ≠ confirmed failure
Unknown outcome ≠ success and ≠ failure until reconciled
```

## V8-47.5 Compensation and reconciliation

This section is normative.

Where a governed effect must be undone, compensation is an explicit, governed, forward action with its own evidence — not a silent rollback of an already-published effect. Reconciliation is the authoritative process that resolves unknown outcomes, detects and repairs divergence between systems, and confirms that a claimed effect actually occurred. Every unknown-outcome and cross-boundary interaction names a reconciliation owner and closure evidence; compensation is bounded and never presumes powers the House does not hold.

## V8-47.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no executable error catalogue, retry engine, saga, compensation handler, or reconciliation job, and it changes no governed state. Every controlled Package 5 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
