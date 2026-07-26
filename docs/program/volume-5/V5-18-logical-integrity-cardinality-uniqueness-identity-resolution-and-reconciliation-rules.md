# V5-18 - Logical Integrity, Cardinality, Uniqueness, Identity-Resolution, and Reconciliation Rules

Document ID: V5-18
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-18.1 Purpose

This section is normative.

This chapter records the logical integrity rules of the model. These rules are
logical conditions on governed meaning. They are not physical constraints, and they
do not authorize implementation. The authoritative rules are recorded as
INTEG-V5-001 through INTEG-V5-014 in REG-502.

## V5-18.2 Identity and separation rules

This section is normative.

- Identity separation (INTEG-V5-001): person, authenticated identity, membership,
  representative authority, reviewer assignment, and finance authority are distinct
  facts and are never conflated.

## V5-18.3 Cardinality and uniqueness rules

This section is normative.

- Affiliation case cardinality (INTEG-V5-002): one case per organization per season.
- Season uniqueness and non-overlap (INTEG-V5-003): seasons are unique and do not
  overlap within a jurisdiction.
- Decision singularity (INTEG-V5-007): one active decision per review outcome.
- Activation uniqueness (INTEG-V5-011): one active activation per case.

## V5-18.4 Applicability and evidence rules

This section is normative.

- Requirement-version applicability (INTEG-V5-004): a response satisfies only the
  applicable requirement version at the relevant time.
- Evidence binding (INTEG-V5-005): evidence metadata binds to its response and
  requirement version, and its binary remains external.
- Submission snapshot immutability (INTEG-V5-006): submission snapshots are immutable.

## V5-18.5 Financial and activation rules

This section is normative.

- Financial fact distinction (INTEG-V5-008): payment acknowledgement and accounting
  confirmation are distinct.
- Reconciliation completeness (INTEG-V5-009): reconciliation requires both facts.
- Approval-activation distinction (INTEG-V5-010): approval is not activation.

## V5-18.6 Temporal, correction, and derived rules

This section is normative.

- Temporal correctness (INTEG-V5-012): effective and recorded times are preserved.
- Correction via supersession (INTEG-V5-013): corrections preserve prior state and
  name a correction authority.
- Derived non-authority and lineage completeness (INTEG-V5-014): derived products are
  non-authoritative, name an authoritative source, and preserve lineage.

## V5-18.7 Enforcement posture

This section is normative.

Each integrity rule names its affected entities, a logical condition, the meaning of
its failure, and a future verification class. Each rule names a future blocking gate
that is not a completed gate. Verification of these rules is deferred to the named
future gates; Package 2 defines the rules but does not verify them against runtime
data.
