# V2-30 - Product Lifecycle, Version, and Change Governance

Document ID: V2-30  
Title: Product Lifecycle, Version, and Change Governance  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 5 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-043)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G5)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-30.1 Purpose

This section is normative.

This chapter defines the product lifecycle, versioning, and change-governance model for the
affiliation product definition (REG-201 OUT-V2-025; REG-203 CAP-V2-047, FR-V2-047). Every
product change is classified before approval and routed to the correct approving authority
before it takes effect (REG-203 BR-V2-034, RULE-V2-032).

## V2-30.2 Change classes

This section is normative.

Every change to the affiliation product definition is classified using exactly one of the
following classes:

- EDITORIAL
- NON_MATERIAL_PRODUCT
- MATERIAL_PRODUCT
- POLICY
- FINANCIAL
- PRIVACY
- ACCESSIBILITY
- BILINGUAL
- AUTHORITY_BOUNDARY
- BREAKING_SERVICE_CHANGE

## V2-30.3 Change-class record structure

This section is normative.

Each change class is defined through a controlled record with the following fields:

- Approving authority
- Evidence required
- Affected registers
- Affected acceptance coverage
- Effective-date handling
- Notice requirements
- Migration or transition consideration
- Downstream design impact

## V2-30.4 Change-class definitions

This section is normative.

- EDITORIAL. Approving authority: Product authority (delegable). Evidence required: change
  description. Affected registers: none material. Affected acceptance coverage: none.
  Effective-date handling: immediate on merge. Notice requirements: none. Migration or
  transition consideration: none. Downstream design impact: none.
- NON_MATERIAL_PRODUCT. Approving authority: Product authority. Evidence required: rationale
  and impact note. Affected registers: REG-201 or REG-203 (non-material). Affected acceptance
  coverage: none or clarifying. Effective-date handling: next baseline. Notice requirements:
  internal note. Migration or transition consideration: none. Downstream design impact:
  minimal.
- MATERIAL_PRODUCT. Approving authority: Product authority with Executive authority for
  material commitments. Evidence required: rationale, impact, and acceptance mapping. Affected
  registers: REG-201, REG-203, REG-204, REG-205. Affected acceptance coverage: updated
  acceptance scenarios. Effective-date handling: gated baseline. Notice requirements: affected
  functions. Migration or transition consideration: assess continuity. Downstream design
  impact: Volume 3 input revision.
- POLICY. Approving authority: Policy and compliance authority. Evidence required: policy
  source and rationale. Affected registers: REG-203 rules and REG-204. Affected acceptance
  coverage: policy-dependent scenarios. Effective-date handling: policy effective date.
  Notice requirements: affected clubs and functions. Migration or transition consideration:
  seasonal transition. Downstream design impact: rule and applicability revision.
- FINANCIAL. Approving authority: Financial authority. Evidence required: financial policy
  basis. Affected registers: REG-203 fee rules. Affected acceptance coverage: reconciliation
  scenarios. Effective-date handling: financial effective date. Notice requirements: affected
  clubs and stewards. Migration or transition consideration: reconciliation transition.
  Downstream design impact: fee and reconciliation revision.
- PRIVACY. Approving authority: Privacy authority. Evidence required: privacy assessment.
  Affected registers: REG-203 privacy requirements. Affected acceptance coverage: privacy
  scenarios. Effective-date handling: privacy effective date. Notice requirements: affected
  data subjects and functions. Migration or transition consideration: data-handling
  transition. Downstream design impact: privacy control revision.
- ACCESSIBILITY. Approving authority: Accessibility authority. Evidence required: conformance
  assessment. Affected registers: REG-203 accessibility requirements. Affected acceptance
  coverage: accessibility scenarios. Effective-date handling: next baseline. Notice
  requirements: affected functions. Migration or transition consideration: none typically.
  Downstream design impact: accessibility control revision.
- BILINGUAL. Approving authority: Official-languages/content authority. Evidence required:
  bilingual conformance. Affected registers: REG-203 bilingual requirements. Affected
  acceptance coverage: bilingual scenarios. Effective-date handling: next baseline. Notice
  requirements: affected functions. Migration or transition consideration: content transition.
  Downstream design impact: content control revision.
- AUTHORITY_BOUNDARY. Approving authority: Executive authority. Evidence required: executive
  acceptance. Affected registers: REG-202, REG-203, REG-204, REG-205. Affected acceptance
  coverage: authority-boundary scenarios. Effective-date handling: gated at material-commitment
  gate. Notice requirements: all accountable functions. Migration or transition consideration:
  governance transition. Downstream design impact: significant; may re-scope Volume 3.
- BREAKING_SERVICE_CHANGE. Approving authority: Executive authority with Product and Service
  owner. Evidence required: executive acceptance and continuity plan. Affected registers: all
  registers. Affected acceptance coverage: broad. Effective-date handling: gated with
  transition window. Notice requirements: all affected stakeholders. Migration or transition
  consideration: mandatory continuity and migration plan. Downstream design impact: major;
  requires Volume 3 re-baseline.

## V2-30.5 Version governance

This section is normative.

Ratified chapters and registers use semantic versioning. Frozen artifacts change only through
the recorded amendment process. Authority-boundary and breaking service changes require
executive-level acceptance before they take effect (REG-203 RULE-V2-032). A change is not
effective merely because it is authored; it is effective only when classified, approved by the
correct authority, and recorded.

## V2-30.6 Authorization posture

This section is normative.

This chapter defines lifecycle and change governance only. It authorizes no implementation, no
procurement, no technical architecture, no delivery plan, and no master development plan.
Executive organizational acceptance remains pending at the material-commitment gate.
