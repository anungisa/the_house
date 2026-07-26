# V3-09 - Organization Recognition, Pathway Triage, and Case-Opening Operations

Document ID: V3-09  
Title: Organization Recognition, Pathway Triage, and Case-Opening Operations  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 2 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-014)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-09.1 Purpose

This section is normative.

This chapter defines how organizations are recognized, how jurisdiction is determined,
how the affiliation pathway is selected, and how a seasonal case is opened. It ensures
that pathway selection is a classified determination rather than informal reviewer
discretion (BR-V3-008, CAP-V3-009). It authorizes no implementation.

## V3-09.2 Determination classes

This section is normative.

Every recognition, jurisdiction, and pathway outcome in this chapter is assigned one of
five determination classes so that its authority and evidence are explicit
(RULE-V3-006, CTRL-V3-009):

- **Deterministic operational determination** - a determination that follows recorded
  operating rules from recorded facts, made operationally without discretion.
- **Policy-authority decision** - a determination reserved to the Compliance and Policy
  Function or the responsible jurisdictional authority.
- **Applicant-supplied information** - a fact supplied by the club or its representative,
  recorded as supplied and subject to verification.
- **System-derived information** - a fact derived by the system from existing records.
- **Manual exception review** - a determination requiring human review because no
  deterministic rule applies; handled as an exception (V3-11).

## V3-09.3 Recognition operations

This section is normative.

Recognition confirms that an organization is a recognizable affiliation subject
(FR-V3-008). The recognition activities are:

- **Recognition of a known organization** - deterministic operational determination from
  existing records.
- **Duplicate or ambiguous records** - manual exception review to resolve which record is
  authoritative.
- **Name or legal changes** - policy-authority decision where the change affects standing;
  otherwise deterministic update from applicant-supplied information.
- **Mergers and reconstitutions** - policy-authority decision on the recognized successor.
- **Dormant and returning clubs** - manual exception review to confirm current standing.
- **Historical standing** - system-derived information used to inform, not to decide,
  recognition.

## V3-09.4 Jurisdiction determination

This section is normative.

Jurisdiction determination assigns the responsible PTSO or member association
(FR-V3-008, BR-V3-006 inherited from Package 1). Jurisdiction is:

- a **deterministic operational determination** where the organization's territory is
  unambiguous; and
- a **policy-authority decision** of the responsible jurisdictional authority where the
  territory is disputed or ambiguous.

Jurisdiction disputes are handled as manual exception review and escalate to the
responsible PTSO and National Operations.

## V3-09.5 Representative authority

This section is normative.

The authority of an individual to act for a club is confirmed before the case proceeds.
Representative authority is applicant-supplied information subject to verification; an
unresolved representative-authority question is a manual exception review and does not
confer governed decision authority on the representative (STK-V3-004 is
Button-primary with no governed authority).

## V3-09.6 Pathway triage

This section is normative.

Pathway triage selects one of the three affiliation pathways defined in Package 1
(continuity confirmation, renewal with remediation, new affiliation; V3-02) using the
recorded determination classes (RULE-V3-006). Triage is a deterministic operational
determination from current affiliation status, season currency, and remediation state,
except where a policy-authority decision or manual exception review is required. Pathway
selection records its determination class and authority and is not informal reviewer
discretion (BR-V3-008, CTRL-V3-009).

## V3-09.7 Seasonal case creation

This section is normative.

A seasonal affiliation case is opened for a recognized organization in a determined
jurisdiction with a selected pathway (FR-V3-009). Case creation records the recognition,
jurisdiction, and pathway determinations with their classes and authorities, and places
the case in the appropriate queue (V3-10). Case opening does not activate an affiliation
and does not mutate governed lifecycle state outside the governance kernel (V3-02).

## V3-09.8 Manual policy determination

This section is normative.

Where recognition, jurisdiction, representative authority, or pathway cannot be
determined deterministically, the case is routed to manual exception review and, where a
policy question is present, to a policy-authority decision (RULE-V3-009). Manual policy
determinations are recorded with their authority and evidence and do not become
precedent without a policy decision.

## V3-09.9 Prohibited discretion

This section is normative.

Pathway selection, recognition, and jurisdiction determinations shall not be made as
undocumented reviewer discretion. A determination without a recorded class and authority
is a defect and is corrected through the correction operations in V3-11 (BR-V3-008,
CTRL-V3-009).

## V3-09.10 Validation status

This section is normative.

The recognition, triage, and case-opening operations are author-asserted and carry
policy and operational validation pending. Determinations reserved to policy authority
require validation with the Compliance and Policy Function; jurisdictional determinations
require validation with PTSO and club representatives (Jen). Pending validation blocks
only the affected determination class or rule. Unresolved assumptions are recorded in
V3-15.
