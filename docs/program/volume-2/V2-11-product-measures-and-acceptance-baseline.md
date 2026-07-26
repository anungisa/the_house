# V2-11 - Product Measures and Acceptance Baseline

Document ID: V2-11  
Title: Product Measures and Acceptance Baseline  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-015)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-11.1 Purpose

This section is normative.

This chapter defines the product measures and acceptance baseline for the affiliation
service. Each candidate measure is classified so that defined measures are distinguished
from measures that remain pending a specific validation. This chapter does not invent
numerical targets where no approved baseline exists.

## V2-11.2 Measure classification scheme

This section is normative.

Each candidate measure is classified as exactly one of:

- **DEFINED** - the measure and its acceptance basis are established for this package;
- **BASELINE_PENDING** - the measure is agreed but its numerical baseline or target is
  not yet established;
- **STAKEHOLDER_VALIDATION_PENDING** - the measure requires stakeholder validation
  before it is agreed;
- **POLICY_VALIDATION_PENDING** - the measure depends on a policy decision not yet made;
  and
- **OPERATIONAL_PROOF_PENDING** - the measure can only be confirmed through operational
  evidence not yet available.

## V2-11.3 Candidate outcome measures

This section is normative.

The candidate measures and their classifications are:

- **M-01 Unaided submission** - a club administrator can complete and submit an
  application unaided (traces to OUT-V2-001). Classification: STAKEHOLDER_VALIDATION_PENDING.
- **M-02 Single authoritative record** - each club has exactly one authoritative
  affiliation record (OUT-V2-002). Classification: DEFINED.
- **M-03 Decision attributability** - every decision is attributable to an authorized
  reviewer with evidence (OUT-V2-003, OUT-V2-005). Classification: DEFINED.
- **M-04 Jurisdictional visibility** - member organizations can see their clubs'
  affiliation status (OUT-V2-004). Classification: STAKEHOLDER_VALIDATION_PENDING.
- **M-05 Governed transitions only** - no affiliation state changes outside a governed
  transition (OUT-V2-005). Classification: DEFINED.
- **M-06 Notification timeliness** - affected parties are notified of status changes and
  required actions within an agreed time (OUT-V2-006, OUT-V2-010). Classification:
  BASELINE_PENDING.
- **M-07 External reconciliation** - external data reconciles without displacing the
  system of record (OUT-V2-007). Classification: STAKEHOLDER_VALIDATION_PENDING.
- **M-08 Correct pathway routing** - each affiliating club is routed to the correct
  pathway (OUT-V2-008). Classification: POLICY_VALIDATION_PENDING.
- **M-09 Review cycle time** - applications are reviewed and decided within an agreed
  time (OUT-V2-009). Classification: BASELINE_PENDING.
- **M-10 Bilingual coverage** - client-facing communication is available in both
  official languages (OUT-V2-010). Classification: DEFINED.
- **M-11 Accessibility conformance** - client-facing experiences meet an agreed
  accessibility standard (OUT-V2-010). Classification: STAKEHOLDER_VALIDATION_PENDING.
- **M-12 Non-standard handling** - non-standard club scenarios resolve through governed
  transitions (OUT-V2-012). Classification: DEFINED.
- **M-13 Availability** - the affiliation record and service meet an availability target
  (NFR-V2-008). Classification: BASELINE_PENDING.
- **M-14 Responsiveness** - the guided experience meets a responsiveness target
  (NFR-V2-009). Classification: BASELINE_PENDING.
- **M-15 Adoption and completion** - clubs successfully complete affiliation through the
  service (OUT-V2-001, OUT-V2-008). Classification: OPERATIONAL_PROOF_PENDING.

## V2-11.4 Acceptance baseline

This section is normative.

The product acceptance baseline is the set of TEST-level requirements recorded in
REG-203 (TEST-V2-001 through TEST-V2-013). These express product acceptance and are the
basis against which the service will be judged. Measures classified as DEFINED are
supported by this acceptance baseline. Measures classified as pending are carried forward
with named validation owners in V2-B and are not treated as accepted.

## V2-11.5 No fabricated targets

This section is normative.

Where a measure requires a numerical baseline or target that has not been approved, this
chapter records the measure as BASELINE_PENDING, STAKEHOLDER_VALIDATION_PENDING,
POLICY_VALIDATION_PENDING, or OPERATIONAL_PROOF_PENDING rather than asserting a number.
No numerical target is invented in this package.

## V2-11.6 Measure status summary

This section is normative.

Of fifteen candidate measures: five are DEFINED (M-02, M-03, M-05, M-10, M-12); four are
BASELINE_PENDING (M-06, M-09, M-13, M-14); four are STAKEHOLDER_VALIDATION_PENDING (M-01,
M-04, M-07, M-11); one is POLICY_VALIDATION_PENDING (M-08); and one is
OPERATIONAL_PROOF_PENDING (M-15). This status is reported at Package 2 closure (V2-B).

## V2-11.7 Authorization posture

This section is normative.

This chapter defines measures and acceptance at a product level only. It authorizes no
implementation, no procurement, and no master development plan.
