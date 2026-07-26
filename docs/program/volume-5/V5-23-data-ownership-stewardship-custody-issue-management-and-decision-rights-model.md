# V5-23 - Data Ownership, Stewardship, Custody, Issue Management, and Decision-Rights Model

Document ID: V5-23
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G3)

## V5-23.1 Purpose

This section is normative.

This chapter defines who owns governed data, who stewards it, who holds custody, how data
issues are raised and resolved, and how decision rights are allocated. The authoritative
catalogue is REG-501 and the authoritative decisions are REG-503. This chapter authorizes
no implementation.

## V5-23.2 Ownership and stewardship

This section is normative.

Every governed data set names an authority owner accountable for the correctness of its
meaning and a steward responsible for maintaining the record. Ownership and stewardship
are distinct roles and may be held by different parties. Authority is never implied; it is
named. A steward may correct a record only through governed processes and never overrides
the authority owner's meaning.

## V5-23.3 Custody

This section is normative.

Custody is the responsibility for holding data safely and applying access and disclosure
rules. Custody is distinct from ownership: a custodian may hold evidentiary or external
data without authority over its meaning. The custody boundary established in Package 2 —
separating responses, evidence metadata, submission snapshots, and decision records — is
preserved.

## V5-23.4 Issue management

This section is normative.

A data issue (REG-501, DISS-V5-001 through DISS-V5-003) is a governed record of a
suspected data problem. Each issue names an issue classification, a resolution authority,
and, where required, evidence. Issues are resolved through governed correction, never
through silent overwrite. Suspected duplicates are governed as issues, not silently merged
(QUALITY-V5-014).

## V5-23.5 Decision rights

This section is normative.

Decision rights allocate who may decide a data issue, approve a correction, grant a
quality exception, or authorize disposition. Decision rights are named and bounded; no
role holds unbounded authority. Where a decision requires evidence, the evidence is
retained.

## V5-23.6 Downstream constraints and no authorization

This section is normative.

Downstream volumes must preserve the ownership, stewardship, custody, and decision-rights
boundaries and must not collapse distinct roles. No record in this chapter authorizes
implementation, staffing, procurement, or the appointment of any specific person. The
appointment of a records-policy authority remains an open assumption (REG-504,
ASM-V5-004).
