# V3-01 - Target Institutional Operating Model

Document ID: V3-01  
Title: Target Institutional Operating Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-002)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-01.1 Purpose

This section is normative.

This chapter defines the target institutional operating model for the affiliation
service. It identifies the institutional functions that must operate the service and,
for each, records purpose, accountability, authority, inputs, outputs, service
obligations, controls, escalations, dependencies, and validation status. It commits no
staffing, headcount, cost, or procurement, and defines no technical architecture.

Functions are defined as operating roles, not as named individuals or org-chart
positions. A single person may hold more than one function only where the segregation-
of-duty controls in V3-03 permit it.

## V3-01.2 Institutional functions

This section is normative.

The target operating model comprises the following functions:

1. Curling Canada National Operations (STK-V3-001)
2. PTSO / Member Association (STK-V3-002)
3. Club (STK-V3-003)
4. Club Representative (STK-V3-004)
5. National Reviewer (STK-V3-005)
6. Jurisdictional Reviewer (STK-V3-006)
7. Compliance and Policy Function (STK-V3-007)
8. Finance and Reconciliation Operations (STK-V3-008)
9. Support and Service Operations (STK-V3-009)
10. Technology and Product Stewardship (STK-V3-010)
11. Privacy Authority (STK-V3-011)
12. Bilingual Content Owner (STK-V3-012)
13. Accessibility Accountability (STK-V3-013)
14. External Payment Processor (STK-V3-014)
15. External Accounting and Ledger System (STK-V3-015)
16. Executive Material-Commitment Authority (STK-V3-016)

### V3-01.2.1 Curling Canada National Operations

This section is normative.

- **Purpose:** operate the affiliation service as the national system-of-record and
  own national policy and oversight.
- **Accountability:** national consistency, national policy, and escalation into the
  executive material-commitment authority.
- **Authority:** national reserved decisions; national policy interpretation via the
  Compliance and Policy Function.
- **Inputs:** jurisdictional decisions, review outcomes, reconciliation results,
  compliance flags, support escalations.
- **Outputs:** national decisions, policy direction, oversight findings.
- **Service obligations:** maintain a governed, consistent national service.
- **Controls:** governed-lifecycle authority is exercised only through the House;
  national decisions are recorded and auditable.
- **Escalations:** unresolved national or material matters to the executive authority.
- **Dependencies:** PTSO jurisdictional authority; finance, compliance, support.
- **Validation status:** stakeholder validation pending.

### V3-01.2.2 PTSO / Member Association

This section is normative.

- **Purpose:** hold and exercise jurisdictional authority over clubs within territory.
- **Accountability:** jurisdictional recognition and review decisions.
- **Authority:** jurisdictional decisions except where national authority is reserved
  (BR-V3-006).
- **Inputs:** club submissions routed to the jurisdiction; national policy.
- **Outputs:** jurisdictional review outcomes and recognition decisions.
- **Service obligations:** timely, consistent jurisdictional handling within recorded
  operating expectations.
- **Controls:** decisions recorded through the House; segregation from finance
  confirmation (V3-03).
- **Escalations:** cross-jurisdiction or national-reserved matters to National
  Operations.
- **Dependencies:** National Operations; Jurisdictional Reviewer capacity.
- **Validation status:** stakeholder validation pending.

### V3-01.2.3 Club and Club Representative

This section is normative.

- **Purpose:** the Club (STK-V3-003) is the subject of the service; the Club
  Representative (STK-V3-004) acts for the club through the experience layer.
- **Accountability:** accurate submission of evidence and fees; timely response to
  returns.
- **Authority:** none over governed lifecycle decisions. The Club Representative
  interacts through The Button and holds no governed authority.
- **Inputs:** service status, returns, requested corrections.
- **Outputs:** submissions, corrections, fee payments.
- **Service obligations:** respond to returns within recorded operating expectations.
- **Controls:** governed decision controls are not exposed to the representative
  (UX-V3-002).
- **Escalations:** support cases via Support and Service Operations.
- **Dependencies:** experience layer; support.
- **Validation status:** stakeholder validation pending.

### V3-01.2.4 Reviewers (National and Jurisdictional)

This section is normative.

- **Purpose:** evaluate submissions against requirements and record review outcomes.
- **Accountability:** correct application of policy at national (STK-V3-005) or
  jurisdictional (STK-V3-006) scope.
- **Authority:** record review outcomes within delegated scope; no finance
  confirmation authority for the same application (BR-V3-003).
- **Inputs:** assigned queue items, evidence, prior review history.
- **Outputs:** recorded review outcomes; returns for correction.
- **Service obligations:** review assigned items and record outcomes.
- **Controls:** segregation of duties (CTRL-V3-001); auditable outcomes.
- **Escalations:** policy ambiguity to Compliance and Policy; aging items per V3-04.
- **Dependencies:** Compliance and Policy; work-management queues.
- **Validation status:** stakeholder validation pending.

### V3-01.2.5 Compliance and Policy Function

This section is normative.

- **Purpose:** own affiliation policy interpretation, compliance flags, and exception
  policy.
- **Accountability:** consistent policy interpretation; disposition of compliance
  flags.
- **Authority:** policy interpretation and exception-policy authority; distinct from
  reviewers who apply policy operationally.
- **Inputs:** reviewer questions; compliance signals.
- **Outputs:** policy guidance; compliance dispositions.
- **Service obligations:** respond to policy escalations.
- **Controls:** policy decisions recorded; separated from operational review.
- **Escalations:** national-reserved policy to National Operations.
- **Dependencies:** National Operations; reviewers.
- **Validation status:** stakeholder validation pending.

### V3-01.2.6 Finance and Reconciliation Operations

This section is normative.

- **Purpose:** own fee obligation and reconciliation of processor and ledger results.
- **Accountability:** confirmed reconciliation as a precondition to activation
  (BR-V3-004).
- **Authority:** reconciliation confirmation and financial exception handling; no
  review authority for the same application.
- **Inputs:** processor results (STK-V3-014); ledger confirmations (STK-V3-015).
- **Outputs:** confirmed reconciliation; financial exception dispositions.
- **Service obligations:** reconcile and confirm within recorded operating
  expectations.
- **Controls:** activation-dependency control (CTRL-V3-002); segregation from review.
- **Escalations:** unresolved mismatches per V3-05.
- **Dependencies:** external processor and ledger; reviewers.
- **Validation status:** stakeholder validation pending.

### V3-01.2.7 Support and Service Operations

This section is normative.

- **Purpose:** provide support intake, case ownership, and service continuity.
- **Accountability:** case ownership and routing; service assistance.
- **Authority:** none over affiliation lifecycle decisions (BR-V3-002); may progress,
  annotate, or escalate a case only.
- **Inputs:** user support requests; service signals.
- **Outputs:** case routing; escalations; assistance.
- **Service obligations:** intake and route cases.
- **Controls:** support-boundary control (CTRL-V3-003).
- **Escalations:** to accountable decision functions.
- **Dependencies:** all operating functions.
- **Validation status:** stakeholder validation pending.

### V3-01.2.8 Technology and Product Stewardship

This section is normative.

- **Purpose:** steward product-and-technology consistency of supporting systems.
- **Accountability:** consistency and stewardship; no governed-lifecycle authority.
- **Authority:** none over affiliation lifecycle.
- **Inputs:** operating-model changes; product definition (Volume 2).
- **Outputs:** stewardship findings; consistency guidance.
- **Service obligations:** maintain alignment between operating model and supporting
  systems, subject to later architecture and delivery volumes.
- **Controls:** no lifecycle authority; changes governed by amendment process.
- **Escalations:** to National Operations.
- **Dependencies:** Volume 2 definition; later architecture/delivery volumes.
- **Validation status:** stakeholder validation pending.

### V3-01.2.9 Privacy, Bilingual, and Accessibility functions

This section is normative.

- **Purpose:** the Privacy Authority (STK-V3-011) governs privacy and restricted-
  evidence access; the Bilingual Content Owner (STK-V3-012) owns official-language
  parity; Accessibility Accountability (STK-V3-013) owns accessibility.
- **Accountability:** privacy governance; bilingual parity; accessibility conformance.
- **Authority:** the Privacy Authority holds governed authority over restricted-
  evidence access and privacy incidents; the bilingual and accessibility owners hold
  triage and remediation accountability without governed-lifecycle authority.
- **Inputs:** privacy, bilingual, and accessibility signals and defects.
- **Outputs:** access decisions; remediation direction.
- **Service obligations:** dispose of privacy, bilingual, and accessibility matters per
  V3-06.
- **Controls:** privacy access decisions recorded; assurance control (CTRL-V3-007).
- **Escalations:** privacy incidents to National Operations.
- **Dependencies:** support; reviewers; National Operations.
- **Validation status:** stakeholder validation pending.

### V3-01.2.10 External providers

This section is normative.

- **Purpose:** the External Payment Processor (STK-V3-014) executes payment collection;
  the External Accounting and Ledger System (STK-V3-015) confirms postings.
- **Accountability:** execution of payment and confirmation of postings only.
- **Authority:** none over affiliation lifecycle decisions.
- **Inputs:** fee obligations; posting instructions.
- **Outputs:** processor results; ledger confirmations.
- **Service obligations:** provide results consumed by reconciliation.
- **Controls:** results are inputs to reconciliation, not activation triggers.
- **Escalations:** provider failures to Finance and Reconciliation Operations.
- **Dependencies:** Finance and Reconciliation Operations.
- **Validation status:** stakeholder validation pending.

### V3-01.2.11 Executive Material-Commitment Authority

This section is normative.

- **Purpose:** accept material organizational commitments in a later volume.
- **Accountability:** acceptance of staffing, cost, procurement, and implementation
  commitments beyond Volume 3.
- **Authority:** the acceptance point for material commitments; not exercised in
  Volume 3.
- **Inputs:** future gate submissions.
- **Outputs:** executive acceptance decisions (future).
- **Service obligations:** none in Volume 3 definition work.
- **Controls:** Volume 3 authorizes no commitment; acceptance remains pending.
- **Escalations:** none in Volume 3.
- **Dependencies:** future volumes.
- **Validation status:** stakeholder validation pending.

## V3-01.3 Authority versus execution

This section is normative.

The operating model distinguishes decision authority from operational execution.
Functions that hold governed authority (National Operations, PTSO, reviewers,
Compliance and Policy, Finance and Reconciliation, Privacy Authority) record decisions
through the House. Functions that execute or assist (Club Representative, Support,
Technology Stewardship, external providers, bilingual and accessibility owners) do not
hold governed-lifecycle authority. This distinction is enforced operationally by the
segregation-of-duty controls in V3-03.

## V3-01.4 Validation status

This section is normative.

All institutional functions are author-asserted and carry stakeholder validation
pending. No operational, financial, staffing, or stakeholder validation is claimed.
Unresolved assumptions are recorded in V3-07 with owners and future gates.
