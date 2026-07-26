# V5-35 - Requirement, Response, Evidence, Submission, Review, and Decision Physical Model

Document ID: V5-35
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-35.1 Purpose

This section is normative.

This chapter defines the physical model for requirements, responses, evidence, submission
snapshots, review, and decision records. It is documentary and authorizes no implementation.
The authoritative records are in REG-501 and the governing decisions are ADR-V5-033 and
ADR-V5-034.

## V5-35.2 Requirement version relations

This section is normative.

Requirements are governed as versioned relations. A response and an evidence item bind to a
specific requirement version, so that what was asked of an applicant at the time of
submission is preserved even as requirements evolve.

## V5-35.3 Response relations

This section is normative.

A response is a governed relation that binds an affiliation case and a requirement version
and records the applicant's answer. Responses reference their requirement version explicitly
and are never interpreted against a later requirement version.

## V5-35.4 Evidence metadata and binary externality

This section is normative.

Evidence is represented as governed metadata that binds a case, a requirement version, a
submitting actor, and provenance. Evidence binary content is never held inside an
authoritative relational record; it is referenced externally, per evidence binding and binary
externality rule INTEG-V5-023, decision ADR-V5-033, and assumption ASM-V5-008. This preserves
the custody and integrity boundary for restricted-evidence data.

## V5-35.5 Immutable submission snapshots

This section is normative.

A submission snapshot captures the exact responses and evidence references submitted at a
point in time and is physically immutable after capture, enforced by a check that snapshot
payload and captured-at time are never updated, per immutable submission snapshot rule
INTEG-V5-024 and decision ADR-V5-034. Resubmission creates a new snapshot rather than
mutating an existing one, so submission history is append-only.

## V5-35.6 Review and decision relations

This section is normative.

Review is represented as governed relations recording reviewer actions against a case under a
reviewer assignment. A decision record is a distinct governed relation that records the
outcome, its authority, and its governed evidence. Decision records never overwrite prior
decisions; superseding decisions reference what they supersede.

## V5-35.7 Downstream constraint

This section is normative.

No downstream volume may internalize evidence binary content into authoritative relations,
mutate a captured submission snapshot, or bind a response to a requirement version other than
the one under which it was submitted.
