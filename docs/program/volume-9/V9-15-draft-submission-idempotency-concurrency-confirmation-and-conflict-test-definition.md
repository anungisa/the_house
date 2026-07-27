# Volume 9 — Draft, Submission, Idempotency, Concurrency, Confirmation, and Conflict Test Definition

Document ID: V9-15
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G2)

## Purpose

This chapter defines the test obligations for affiliation draft, submission,
idempotency, concurrency, confirmation, and conflict handling. It defines test
requirements and scenarios only and authorizes no execution.

## Draft and autosave

A draft is a working state distinct from a submission. The definition holds that
draft creation and autosave must never advance governed lifecycle state; an attempt
to advance state through autosave is detected and fails closed. This preserves the
institutional invariant that governed state is not directly mutated outside the
kernel.

## Submission distinctions

Submission carries a strict set of distinctions:

- Submission eligibility ≠ submission receipt.
- Submission receipt ≠ approval.
- Approval ≠ activation.

A submission receipt confers no eligibility, no approval, and no activation. A
functional test obligation records that a receipt treated as an approval or an
activation is detected and fails closed, so that each remains a distinct governed
transition.

## Idempotency, concurrency, and conflict

Every submission request carries an idempotency key. The definition records that a
duplicate submission retried with the same idempotency key produces a single
governed effect, not a duplicate, and that concurrent submissions carrying a stale
expected version raise a governed conflict rather than silently overwriting one
another. An interrupted submission must leave governed state consistent and
recoverable without partial mutation.

## Scenario coverage

The scenario coverage for this domain includes a duplicate scenario for an
idempotent retry, a conflict scenario for a concurrent expected-version conflict,
and an interruption scenario for a submission interrupted before commit. Each
scenario names its actor, contexts, disposition, and governed oracle.

## Forward disposition

Every requirement and scenario names a forward gate, points at no completed gate,
and authorizes no implementation or execution.
