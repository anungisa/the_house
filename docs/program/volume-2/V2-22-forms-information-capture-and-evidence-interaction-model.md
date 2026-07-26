# V2-22 - Forms, Information Capture, and Evidence Interaction Model

Document ID: V2-22  
Title: Forms, Information Capture, and Evidence Interaction Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-032)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-22.1 Purpose

This section is normative.

This chapter defines the product-level interaction requirements for information capture
and evidence handling. It does not define database fields, technical schemas, or component
specifications (REG-203 CAP-V2-041, FR-V2-039).

## V2-22.2 Information and evidence sets

This section is normative.

Product-level interaction requirements are defined for:

- organization recognition and matching;
- representative authority;
- seasonal confirmations;
- requirement responses;
- structured information;
- file evidence;
- acknowledgement and attestation;
- drafts;
- save and resume;
- replacement evidence;
- evidence expiry;
- rejected evidence;
- confidential evidence;
- submission confirmation;
- resubmission;
- administrative correction.

## V2-22.3 Information-set descriptor

This section is normative.

For each information set, the model records:

- Purpose;
- Responsible actor;
- Governing requirement;
- Required or conditional status;
- Validation expectation;
- Evidence relationship;
- Visibility;
- Retention concern;
- Privacy sensitivity;
- Bilingual-content requirement;
- Accessible interaction requirement;
- Error and recovery behaviour.

The captured concept is recorded as an information-set and evidence-interaction descriptor
(REG-203 DATA-V2-021).

## V2-22.4 History preservation

This section is normative.

Drafts and history are preserved. Correction, replacement, and resubmission never destroy
the prior governed record or evidence provenance, and each is recorded with audit (REG-203
BR-V2-029, RULE-V2-028, CTRL-V2-020, UC-V2-044).

## V2-22.5 Evidence lifecycle interaction

This section is normative.

Evidence interaction respects the governed evidence rules (V2-14): expired, superseded, or
withdrawn evidence is not valid support; rejected evidence prompts replacement without
losing other progress; and confidential evidence is subject to restricted visibility
(REG-203 CTRL-V2-014, CTRL-V2-019).

## V2-22.6 Unresolved validations

This section is normative.

Structured-information validation expectations remain POLICY_VALIDATION_PENDING (owner
Jen). Accessible interaction and bilingual-content requirements remain
ACCESSIBILITY_VALIDATION_PENDING and BILINGUAL_VALIDATION_PENDING respectively. Privacy
sensitivity of specific sets remains PRIVACY_VALIDATION_PENDING (owner Privacy and
Data-Protection Authority). Pending validation blocks only the affected set.

## V2-22.7 Authorization posture

This section is normative.

This chapter defines forms and evidence interaction at product level only. It authorizes
no implementation, no database design, and no component specifications. All referenced
requirements in REG-203 carry `authorizes_implementation: false`.
