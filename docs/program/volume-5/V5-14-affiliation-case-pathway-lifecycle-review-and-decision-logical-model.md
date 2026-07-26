# V5-14 - Affiliation Case, Pathway, Lifecycle, Review, and Decision Logical Model

Document ID: V5-14
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-14.1 Purpose

This section is normative.

This chapter defines the logical model for the affiliation case, the affiliation
pathway, and the governed lifecycle, review, and decision facts that surround them.

## V5-14.2 Affiliation case and pathway

This section is normative.

The following logical entities are defined and recorded in REG-501:

- Affiliation case (LENT-V5-013): the governed case through which an organization
  seeks or maintains affiliation for a season.
- Pathway (LENT-V5-014): the governed sequence of stages an affiliation case follows.

An organization has at most one affiliation case per season (INTEG-V5-002). Duplicate
cases undermine governed affiliation truth and are rejected.

## V5-14.3 Lifecycle as governed state

This section is normative.

Lifecycle state for an affiliation case is represented as governed state records
(STATE-V5-001) changed only through governed transitions, never as a directly mutable
status field (ADR-V5-010). Domain modules may request transitions but never mutate
governed state directly. Each transition preserves prior state as history.

## V5-14.4 Review

This section is normative.

Review is performed by an assigned reviewer under a reviewer assignment
(LENT-V5-008), which is distinct from membership, representative authority, and
finance authority. Reviewer authority is scoped and does not confer other authority.

## V5-14.5 Decision record

This section is normative.

A case review outcome is recorded as a decision record (LENT-V5-018). A review
outcome has exactly one active decision record; superseding decisions preserve prior
decisions (INTEG-V5-007). A decision to approve is distinct from activation, which is
a separate governed fact defined in the financial and activation model (ADR-V5-013).
