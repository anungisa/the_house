# Volume 9 — Decision, Finance, Reconciliation, Activation, Standing, and Expiry Test Definition

Document ID: V9-17
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G2)

## Purpose

This chapter defines the test obligations for affiliation decision, finance,
reconciliation, activation, standing, and expiry. It defines test requirements and
scenarios only and authorizes no execution.

## Decision authority

A governed decision changes affiliation standing and is reserved to an authorized
decision authority. The definition holds that a recommendation is not a decision
and that finance authority is not decision authority; a test obligation records
that only an authorized decision transition changes standing.

## Finance and reconciliation

Finance testing preserves the decision-authority boundary. The definition holds a
strict set of distinctions:

- Payment acknowledgement ≠ accounting confirmation ≠ reconciliation resolution.

A payment acknowledgement does not by itself resolve financial reconciliation, and
reconciliation resolution does not by itself confer a decision. A functional test
obligation records that a payment acknowledgement treated as a reconciliation
resolution or as a decision is detected and fails closed.

## Approval, activation, and standing

Approval, activation authorization, activation execution, and active standing are
held distinct:

- Approval ≠ activation authorization ≠ activation execution ≠ active standing.

A test obligation records that each remains a distinct governed transition and that
approval is never conflated with activation. Standing and expiry are governed
determinations: an expired affiliation is not in active standing, and a standing
check is recalculated from governed inputs rather than assumed.

## Exactly-once activation

Activation occurs exactly-once as a governed business invariant, not as a
transport-level delivery guarantee. The definition records that repeated activation
stimuli result in exactly one active standing, and that a transport delivery
guarantee never establishes the invariant. A duplicate scenario and a recovery
scenario record that a second activation attempt and an interrupted-and-resumed
activation each yield exactly one active standing.

## Scenario coverage

The scenario coverage for this domain includes a duplicate scenario for a repeated
activation and a recovery scenario for an interrupted activation. Each scenario
names its actor, contexts, disposition, and governed oracle.

## Forward disposition

Every requirement and scenario names a forward gate, points at no completed gate,
and authorizes no implementation or execution.
