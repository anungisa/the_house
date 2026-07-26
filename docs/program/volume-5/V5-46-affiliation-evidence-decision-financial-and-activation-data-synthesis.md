# V5-46 - Affiliation, Evidence, Decision, Financial, and Activation Data Synthesis

Document ID: V5-46
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G5)

## V5-46.1 Purpose

This section is normative.

This chapter consolidates the complete governed record chain from organization to activation and
closure. It is documentary and authorizes no implementation. It consolidates the Package 1
affiliation conceptual model, the Package 2 affiliation-case, evidence, decision, financial, and
activation logical models, and the Package 4 physical structures.

## V5-46.2 Governed record chain

This section is normative.

The synthesis consolidates the governed chain:

- organization;
- season;
- affiliation case;
- pathway;
- applicable policy and requirement versions;
- responses and evidence;
- submission snapshot;
- review;
- governed decision;
- reconciliation;
- activation authorization;
- authoritative activation;
- expiry or closure.

For each stage the synthesis records the authority, authoritative record, logical structure,
physical structure, required version, evidence, temporal facts, correction posture, audit,
downstream projection, and future test class, resolving to governed records already ratified in
Packages 1, 2, and 4.

## V5-46.3 Preserved distinctions

This section is normative.

The synthesis preserves the following distinctions:

- evidence binding equals case plus requirement version plus actor or service plus provenance
  plus evidence version;
- payment acknowledgement is not accounting confirmation and is not reconciliation resolution;
- approval is not activation authorization and is not activation execution.

These distinctions are enforced conceptually by integrity rules INTEG-V5-005 (evidence binding),
INTEG-V5-008 (financial fact distinction), INTEG-V5-009 (reconciliation completeness),
INTEG-V5-010 (approval-activation distinction), and INTEG-V5-011 (activation uniqueness).

## V5-46.4 Temporal and correction posture

This section is normative.

Each stage preserves effective and recorded time, records corrections by supersession that
preserve prior history, and produces the audit and evidence artifacts required by its risk
level. Submission snapshots are immutable; resubmission creates a new snapshot. A case has at
most one active decision and at most one active activation. No definition in this synthesis
authorizes implementation.
