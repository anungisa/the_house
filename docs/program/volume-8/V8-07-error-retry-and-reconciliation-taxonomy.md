# V8-07 - Error, Retry, and Reconciliation Taxonomy

Document ID: V8-07
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G1)

## V8-07.1 Purpose

This section is normative.

This chapter governs the taxonomy of errors, retries, and reconciliation. It states how failures must be named, which failures may be retried, and how interactions with unknown outcomes must be reconciled to a governed truth. It governs semantics, not the executable error handler.

## V8-07.2 Canonical error codes

This section is normative.

Every error semantic names a language-neutral canonical code that identifies the error independently of any human-language message. The canonical code is stable and machine-consumable; the human-language message is a presentation of it and is never the contract. An error semantic that names no canonical code fails closed.

## V8-07.3 User-safe meaning and privacy

This section is normative.

Every error semantic names a user-safe meaning and a privacy or logging constraint. An error surfaced to a caller must convey only what that caller is authorized to know; it must not leak restricted, personal, financial, audit, or secret information into a message, a code, or a log. An error semantic that names no privacy or logging constraint fails closed.

Restricted classification is never carried in an error message or an ordinary interaction surface without an explicit named privacy constraint.

## V8-07.4 Retry classification

This section is normative.

Every error semantic names whether it is retryable, non-retryable, or conditionally retryable. A retryable error may be re-attempted only under the idempotency obligations of Volume 8, using a bounded backoff with full jitter, where the delay is a random value between zero and a capped exponential bound. A non-retryable error must not be re-attempted. An error whose retry classification is unknown is treated as non-retryable.

## V8-07.5 Reconciliation of unknown outcomes

This section is normative.

Every reconciliation requirement names the reconciliation dependency that resolves an unknown outcome to a governed truth. When an interaction times out, is interrupted, or returns an ambiguous result, the outcome is unknown until reconciled; it is never assumed to have succeeded or failed. A reconciliation requirement that names no reconciliation dependency fails closed.

Unknown outcomes are reconciled by comparing against the authoritative source, never by guessing.

## V8-07.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It builds no error handler, retry loop, backoff scheduler, or reconciliation job. Every controlled error and reconciliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
