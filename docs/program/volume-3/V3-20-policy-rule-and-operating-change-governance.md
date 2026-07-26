# V3-20 - Policy, Rule, and Operating-Change Governance

Document ID: V3-20  
Title: Policy, Rule, and Operating-Change Governance  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 3 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-029)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-20.1 Purpose

This section is normative.

This chapter defines how operating rules and service practices are changed after approval
(CAP-V3-020, OUT-V3-020, FR-V3-020). Operating-change governance is not converted into
software release management (BR-V3-019). It authorizes no implementation.

## V3-20.2 Change domains

This section is normative.

The following change domains are governed:

- New-season policy.
- Pathway eligibility.
- Requirement applicability.
- Evidence rules.
- Reviewer authority.
- Jurisdiction changes.
- Financial-policy references.
- Support procedures.
- Bilingual-content corrections.
- Accessibility corrections.
- Privacy restrictions.
- Operating-status vocabulary.
- Emergency changes.
- Retrospective corrections.
- Deprecation and supersession.

## V3-20.3 Change classes

This section is normative.

Every operating change is classified into exactly one class before it takes effect
(CTRL-V3-024):

```
EDITORIAL
NON_MATERIAL_OPERATING
MATERIAL_OPERATING
POLICY
FINANCIAL
PRIVACY
BILINGUAL
ACCESSIBILITY
AUTHORITY_BOUNDARY
EMERGENCY
BREAKING_OPERATING_CHANGE
```

## V3-20.4 Per-class governance

This section is normative.

For each change class the following are defined:

- Approving authority.
- Consulted functions.
- Evidence required.
- Effective-date handling.
- Affected cases and seasons.
- Communication requirement.
- Acceptance-impact review.
- Transition consideration.
- Amendment record.
- Downstream technical-design implications.

A change takes effect only after its change-class authority approves (RULE-V3-016). An
emergency change is executed under the emergency class and ratified retrospectively within
a defined window; the window value is validation-pending.

## V3-20.5 Amendment records

This section is normative.

Every approved change is recorded as an amendment in the change-and-amendment record set,
a business information domain with a steward (DATA-V3-008, V3-22). Amendment records
preserve supersession and effective-date lineage.

## V3-20.6 Validation status

This section is normative.

The change-governance definitions are author-asserted. Policy-change validation involves
the compliance-and-policy function (STK-V3-007); financial-change validation involves
Hélène; privacy, bilingual, and accessibility change validation involve their respective
authorities; emergency-window values require validation at a later gate. Pending
validation blocks only the affected change class.
