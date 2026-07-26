# V2-21 - Status, State, Required-Action, and Service-Information Model

Document ID: V2-21  
Title: Status, State, Required-Action, and Service-Information Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-031)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-21.1 Purpose

This section is normative.

This chapter defines the product vocabulary that translates governed state into
understandable service information. It is product definition only (REG-203 CAP-V2-040,
FR-V2-038).

## V2-21.2 Separated status categories

This section is normative.

The following categories are distinct concepts and are separately defined (REG-203
BR-V2-026):

- Governed lifecycle state;
- Operational processing status;
- Payment and reconciliation status;
- Evidence status;
- User-visible status;
- Required action;
- Service-health condition.

## V2-21.3 The Button does not own status

This section is normative.

The Button must not invent or independently mutate lifecycle status. Every user-visible
status derives from a source governed state and its associated processing, evidence, and
financial statuses (REG-203 BR-V2-027, RULE-V2-026, RULE-V2-027, CTRL-V2-015,
CTRL-V2-016).

## V2-21.4 User-visible status attributes

This section is normative.

For every user-visible status, the model defines:

- source governed state;
- intended audience;
- plain-language meaning;
- required action;
- responsible party;
- whether the user can act;
- whether the status blocks submission, decision, or activation;
- permitted next states;
- notification requirement;
- bilingual-content status.

## V2-21.5 Prohibited vague labels

This section is normative.

Vague labels such as pending, incomplete, under review, or blocked are not permitted
unless the product definition specifies exactly what they mean and who must act (REG-203
BR-V2-028). Each such label resolves to a defined meaning, audience, responsible party,
and required action.

## V2-21.6 Representative status mapping

This section is normative.

| User-visible status | Source governed state | Audience | Required action | Responsible party | User can act | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| Action needed: complete requirements | draft | Representative | Complete requirements/evidence | Representative | yes | submission |
| Submitted - awaiting review | submitted | Representative | None; await review | Reviewer | no | none |
| Returned for information | under_review (returned) | Representative | Provide returned items | Representative | yes | decision |
| Approved - awaiting activation | approved | Representative | Await reconciliation/activation | Finance / House | no | activation |
| Active for the season | active | Representative | None | House | no | none |

The complete catalogue is recorded as a governed vocabulary concept (REG-203 DATA-V2-019).

## V2-21.7 Unresolved validations

This section is normative.

Plain-language wording and bilingual equivalence for each status remain
BILINGUAL_VALIDATION_PENDING (owner Bilingual Experience and Official-Languages
Authority). Audience-specific meaning remains STAKEHOLDER_VALIDATION_PENDING. Pending
validation blocks only the affected status.

## V2-21.8 Authorization posture

This section is normative.

This chapter defines the status and required-action model only. It authorizes no
implementation and no technical architecture. All referenced requirements in REG-203 carry
`authorizes_implementation: false`.
