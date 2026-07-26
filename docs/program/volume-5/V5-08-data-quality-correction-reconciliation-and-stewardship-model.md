# V5-08 - Data Quality, Correction, Reconciliation, and Stewardship Model

Document ID: V5-08
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-08.1 Purpose

This section is normative.

This chapter defines the data quality dimensions of The House v2, the distinct
kinds of correction, the reconciliation posture, and the separation of stewardship
from decision authority. It defines meaning only and sets no quality threshold as
an implemented control. The authoritative quality dimensions are QUALITY-V5-001
through QUALITY-V5-010 in REG-502.

## V5-08.2 Quality dimensions

This section is normative.

Ten governed quality dimensions are defined: validity, completeness, consistency,
uniqueness, timeliness, accuracy, traceability, authority alignment, jurisdiction
alignment, and temporal correctness. Each dimension names a detection concept, a
correction authority, a correction type, a reconciliation source, an evidence
expectation, and a future blocking gate (V5-G1). Thresholds are defined
conceptually and validated downstream (TEST-V5-014).

## V5-08.3 Distinct kinds of correction

This section is normative.

The model distinguishes several correction types, each with its own authority:

- Administrative correction — corrects operational data under affiliation
  administration.
- Governed-decision correction — corrects a governed decision under decision
  correction authority.
- Identity resolution — resolves duplicate or ambiguous parties under identity
  governance authority.
- Projection rebuild — rebuilds a non-authoritative projection from authoritative
  sources.
- Source-system correction — corrects data at an external source, distinct from a
  governed correction.

Every quality or correction rule names a correction authority (CTRL-V5-003).
Corrections preserve governed history through supersession (RULE-V5-008).

## V5-08.4 Reconciliation

This section is normative.

Reconciliation aligns related governed facts — most notably fee obligation, payment
acknowledgement, accounting confirmation, and reconciliation state — without
collapsing their distinct sources. Financial reconciliation semantics are validated
by TEST-V5-011 and depend on external finance systems (ASM-V5-003).

## V5-08.5 Stewardship separation

This section is normative.

Data stewardship maintains quality but does not confer governed decision authority
(RULE-V5-003). Stewardship, business authority, system-of-record authority, and
custody remain distinct. Correction and reconciliation are performed by named
authorities, not silently by stewards or custodians.
