# Volume 9 — Review, Return for Information, Correction, and Resubmission Test Definition

Document ID: V9-16
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G2)

## Purpose

This chapter defines the test obligations for affiliation review, return for
information, correction, and resubmission. It defines test requirements and
scenarios only and authorizes no execution.

## Reviewer eligibility and scope

A reviewer acts under governed standing. The definition holds that reviewer
eligibility, jurisdiction, assignment, and sensitivity scope carry test
obligations: only an eligible reviewer with the correct jurisdiction and assignment
may act, and a reviewer scoped to a different jurisdiction is denied. A denial
scenario records that an out-of-scope reviewer access attempt is denied and fails
closed.

## Return is not refusal

A return for information is held strictly distinct from a refusal decision. A
return requests further information and preserves the affiliation in a correctable
state; a refusal is a governed decision with different authority and consequence. A
workflow test obligation records that a return is never conflated with a refusal.

## Correction and resubmission preserve history

Correction and resubmission preserve the full prior submission and review history.
The definition records that a resubmission after correction retains the earlier
submission, the reviewer context, and the return, so that the governed audit
history remains unbroken across correction cycles. A resubmission that discards
history is detected and fails closed.

## Recommendation is not decision

A reviewer recommendation is held distinct from a governed decision. A
recommendation is recorded without changing governed standing; only an authorized
decision transition changes standing. A workflow test obligation records that a
recommendation treated as a decision is detected and fails closed.

## Scenario coverage

The scenario coverage for this domain includes a denial scenario for an out-of-scope
reviewer. Each scenario names its actor, contexts, disposition, and governed
oracle.

## Forward disposition

Every requirement and scenario names a forward gate, points at no completed gate,
and authorizes no implementation or execution.
