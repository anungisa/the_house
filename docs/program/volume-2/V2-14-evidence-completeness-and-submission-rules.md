# V2-14 - Evidence, Completeness, and Submission Rules

Document ID: V2-14  
Title: Evidence, Completeness, and Submission Rules  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-021)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-14.1 Purpose

This section is normative.

This chapter defines the governed rules for evidence, completeness derivation, and
submission. Completeness is derived from traceable facts and is never a manually
maintained boolean (REG-203 BR-V2-018, RULE-V2-016). This chapter is rule definition and
authorizes no implementation.

## V2-14.2 Evidence model

This section is normative.

Evidence is a governed supporting fact. The evidence rules define:

- evidence types, including file evidence and structured-data evidence;
- evidence ownership and provenance;
- validity periods and expiry;
- replacement, withdrawal, and supersession;
- applicability to a specific requirement, season, pathway, and jurisdiction;
- confidentiality and restricted visibility;
- evidence carry-forward eligibility;
- evidence rejection;
- binding of evidence to a specific requirement and affiliation.

The evidence validity and carry-forward rule (RULE-V2-015) holds that evidence is valid
only within its validity period, bound to a requirement and affiliation, not superseded or
withdrawn, and eligible for carry-forward only where policy and provenance permit.

## V2-14.3 Confidentiality and visibility

This section is normative.

Evidence confidentiality and restricted visibility are enforced by policy classification
(REG-203 NFR-V2-016, CTRL-V2-014). The service collects only the personal data each
affiliation decision requires (data minimization, consistent with CTRL-V2-007). The
specific confidentiality standard is recorded as PRIVACY_VALIDATION_PENDING where not yet
settled.

## V2-14.4 Completeness derivation

This section is normative.

The completeness derivation rule (RULE-V2-016) computes completeness from applicable
requirements, bound valid evidence, mandatory information, and acknowledgements.
Completeness always traces to the supporting facts and is recomputed when any input
changes. A completeness value with no traceable supporting facts is invalid by
construction.

## V2-14.5 Submission prerequisites

This section is normative.

The submission prerequisite rule (RULE-V2-017) requires, before an application may be
submitted:

- applicable requirements determined;
- mandatory information complete;
- required evidence bound;
- acknowledgements complete;
- valid representative authority;
- no unresolved blocking exception.

Submission is blocked unless all prerequisites are satisfied (REG-203 TEST-V2-018).

## V2-14.6 Unresolved validations

This section is normative.

Evidence validity periods, carry-forward criteria, and confidentiality classification are
recorded as pending validation with owner Jen (evidence) and the appropriate privacy
authority, each with a future blocking gate. Pending validation blocks only the affected
rule.

## V2-14.7 Authorization posture

This section is normative.

This chapter defines evidence, completeness, and submission rules only. It authorizes no
implementation, no procurement, and no technical architecture. All referenced rules in
REG-203 carry `authorizes_implementation: false`.
