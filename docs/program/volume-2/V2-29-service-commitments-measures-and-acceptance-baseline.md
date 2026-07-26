# V2-29 - Service Commitments, Measures, and Acceptance Baseline

Document ID: V2-29  
Title: Service Commitments, Measures, and Acceptance Baseline  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 5 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-042)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G5)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 5 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-29.1 Purpose

This section is normative.

This chapter defines the consolidated service-commitment and measure baseline for the
affiliation product (REG-201 OUT-V2-024; REG-203 CAP-V2-046, FR-V2-046, NFR-V2-022). It
defines what the affiliation service commits to achieve and how each commitment is measured
and accepted. It does not invent numeric service targets. A measure without a validated
baseline is explicitly classified as validation pending (REG-203 BR-V2-033).

## V2-29.2 Measure classification

This section is normative.

Every measure is classified using exactly one of the following states:

- DEFINED
- BASELINE_PENDING
- POLICY_VALIDATION_PENDING
- FINANCIAL_VALIDATION_PENDING
- OPERATIONAL_VALIDATION_PENDING
- ACCESSIBILITY_VALIDATION_PENDING
- BILINGUAL_VALIDATION_PENDING
- PRIVACY_VALIDATION_PENDING
- STAKEHOLDER_VALIDATION_PENDING
- PRODUCTION_PROOF_PENDING

A classification other than DEFINED records that the measure is meaningful but not yet
validated against a confirmed baseline or target. No measure asserts a numeric target.

## V2-29.3 Per-measure record structure

This section is normative.

Each measure family is defined through a controlled record with the following fields:

- Measure identifier
- Outcome
- Definition
- Calculation concept
- Evidence source
- Accountable owner
- Baseline status
- Target status
- Validation authority
- Acceptance relationship
- Future blocking gate

## V2-29.4 Consolidated measure baseline

This section is normative.

The following nineteen measure families constitute the affiliation service-measure baseline.
Baseline status uses the classification of Section V2-29.2. Target status is
target-not-set-pending-baseline for every measure that is not DEFINED; no numeric target is
asserted.

- MEAS-V2-01 correct club recognition. Outcome: clubs are recognized correctly (OUT-V2-002).
  Definition: correctness of recognition determinations. Calculation concept: proportion of
  recognition determinations later confirmed correct. Evidence source: governed recognition
  records. Accountable owner: Product authority. Baseline status: BASELINE_PENDING. Target
  status: not set pending baseline. Validation authority: Policy and compliance authority.
  Acceptance relationship: recognition acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-02 duplicate-organization avoidance. Outcome: no duplicate organizations
  (OUT-V2-002). Definition: avoidance of duplicate organization identity. Calculation concept:
  incidence of detected duplicates. Evidence source: organization identity records.
  Accountable owner: Domain data owner. Baseline status: BASELINE_PENDING. Target status: not
  set pending baseline. Validation authority: Domain data owner. Acceptance relationship:
  duplicate-avoidance acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-03 correct pathway determination. Outcome: correct pathway is determined
  (OUT-V2-003). Definition: correctness of pathway selection. Calculation concept: proportion
  of pathway determinations confirmed correct. Evidence source: governed pathway records.
  Accountable owner: Policy authority. Baseline status: POLICY_VALIDATION_PENDING. Target
  status: not set pending baseline. Validation authority: Policy and compliance authority.
  Acceptance relationship: pathway acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-04 correct requirement applicability. Outcome: the correct requirement set applies
  (OUT-V2-003). Definition: correctness of applicability determination. Calculation concept:
  proportion of applicability determinations confirmed correct. Evidence source: governed
  applicability records. Accountable owner: Policy authority. Baseline status:
  POLICY_VALIDATION_PENDING. Target status: not set pending baseline. Validation authority:
  Policy and compliance authority. Acceptance relationship: applicability acceptance scenarios.
  Future blocking gate: Gate V2-G5.
- MEAS-V2-05 evidence-binding integrity. Outcome: evidence is bound to submissions
  (OUT-V2-005). Definition: integrity of evidence-to-submission binding. Calculation concept:
  incidence of unbound or mismatched evidence. Evidence source: governed evidence records.
  Accountable owner: Domain data owner. Baseline status: BASELINE_PENDING. Target status: not
  set pending baseline. Validation authority: Policy and compliance authority. Acceptance
  relationship: evidence-binding acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-06 submission completeness. Outcome: submissions are complete (OUT-V2-005).
  Definition: completeness of submissions at decision. Calculation concept: proportion of
  submissions complete without rework. Evidence source: governed submission records.
  Accountable owner: Service owner. Baseline status: BASELINE_PENDING. Target status: not set
  pending baseline. Validation authority: Service owner. Acceptance relationship: completeness
  acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-07 jurisdictionally correct routing. Outcome: submissions route to the correct
  jurisdiction (OUT-V2-007). Definition: correctness of jurisdictional routing. Calculation
  concept: proportion of routings confirmed correct. Evidence source: governed routing records.
  Accountable owner: Service owner. Baseline status: OPERATIONAL_VALIDATION_PENDING. Target
  status: not set pending baseline. Validation authority: Policy and compliance authority.
  Acceptance relationship: routing acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-08 return and resubmission continuity. Outcome: returns and resubmissions preserve
  continuity (OUT-V2-006). Definition: continuity across return and resubmission. Calculation
  concept: incidence of lost context on resubmission. Evidence source: governed lifecycle
  records. Accountable owner: Service owner. Baseline status: OPERATIONAL_VALIDATION_PENDING.
  Target status: not set pending baseline. Validation authority: Service owner. Acceptance
  relationship: return-and-resubmission acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-09 decision authority and evidence. Outcome: decisions carry authority and evidence
  (OUT-V2-008). Definition: integrity of decision authority and evidence. Calculation concept:
  incidence of decisions lacking required authority or evidence. Evidence source: governed
  decision records. Accountable owner: Service owner. Baseline status: BASELINE_PENDING. Target
  status: not set pending baseline. Validation authority: Policy and compliance authority.
  Acceptance relationship: decision-authority acceptance scenarios. Future blocking gate: Gate
  V2-G5.
- MEAS-V2-10 fee and reconciliation visibility. Outcome: fees and reconciliation are visible
  (OUT-V2-010). Definition: visibility and correctness of fee and reconciliation state.
  Calculation concept: incidence of unreconciled or opaque fee state. Evidence source: governed
  fee records. Accountable owner: Financial authority. Baseline status:
  FINANCIAL_VALIDATION_PENDING. Target status: not set pending baseline. Validation authority:
  Financial authority. Acceptance relationship: reconciliation acceptance scenarios. Future
  blocking gate: Gate V2-G5.
- MEAS-V2-11 exactly-once activation. Outcome: activation occurs exactly once (OUT-V2-010).
  Definition: exactly-once integrity of activation. Calculation concept: incidence of duplicate
  or missed activation. Evidence source: governed activation records. Accountable owner:
  Service owner. Baseline status: PRODUCTION_PROOF_PENDING. Target status: not set pending
  baseline. Validation authority: Service owner. Acceptance relationship: exactly-once
  activation acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-12 required-action comprehension. Outcome: users understand required actions
  (OUT-V2-001). Definition: comprehensibility of required actions. Calculation concept:
  incidence of confusion or unnecessary support contact. Evidence source: experience research.
  Accountable owner: Product authority. Baseline status: STAKEHOLDER_VALIDATION_PENDING. Target
  status: not set pending baseline. Validation authority: Product authority. Acceptance
  relationship: required-action acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-13 bilingual task equivalence. Outcome: tasks are language-equivalent (OUT-V2-020).
  Definition: equivalence of bilingual task completion. Calculation concept: incidence of
  non-equivalent bilingual tasks. Evidence source: bilingual conformance review. Accountable
  owner: Official-languages/content authority. Baseline status: BILINGUAL_VALIDATION_PENDING.
  Target status: not set pending baseline. Validation authority: Official-languages/content
  authority. Acceptance relationship: bilingual acceptance scenarios. Future blocking gate:
  Gate V2-G5.
- MEAS-V2-14 accessible task completion. Outcome: tasks are accessible (OUT-V2-020).
  Definition: accessibility of task completion. Calculation concept: incidence of accessibility
  barriers. Evidence source: accessibility conformance review. Accountable owner: Accessibility
  authority. Baseline status: ACCESSIBILITY_VALIDATION_PENDING. Target status: not set pending
  baseline. Validation authority: Accessibility authority. Acceptance relationship:
  accessibility acceptance scenarios. Future blocking gate: Gate V2-G5.
- MEAS-V2-15 notification delivery and recovery. Outcome: notifications deliver and recover
  (OUT-V2-020). Definition: delivery and recovery of material notifications. Calculation
  concept: incidence of undelivered or unrecovered notifications. Evidence source: governed
  communication records. Accountable owner: Service owner. Baseline status:
  OPERATIONAL_VALIDATION_PENDING. Target status: not set pending baseline. Validation
  authority: Service owner. Acceptance relationship: notification acceptance scenarios. Future
  blocking gate: Gate V2-G5.
- MEAS-V2-16 support recovery. Outcome: support recovers stalled tasks within permitted
  assistance (OUT-V2-020). Definition: effectiveness of assisted recovery. Calculation concept:
  incidence of unrecovered stalled tasks. Evidence source: governed support records.
  Accountable owner: Support owner. Baseline status: BASELINE_PENDING. Target status: not set
  pending baseline. Validation authority: Support owner. Acceptance relationship: support
  recovery acceptance scenarios (REG-203 CTRL-V2-023, TEST-V2-046). Future blocking gate: Gate
  V2-G5.
- MEAS-V2-17 audit reconstruction. Outcome: governed history is reconstructable (OUT-V2-021).
  Definition: completeness of audit reconstruction. Calculation concept: incidence of
  non-reconstructable governed history. Evidence source: governed audit records. Accountable
  owner: Domain data owner. Baseline status: DEFINED. Target status: reconstruction-complete
  by design. Validation authority: Product authority. Acceptance relationship: audit
  reconstruction acceptance scenarios (REG-203 TEST-V2-043). Future blocking gate: Gate V2-G5.
- MEAS-V2-18 traceability completeness. Outcome: the product definition is fully traceable
  (OUT-V2-026). Definition: completeness of requirement-chain traceability. Calculation
  concept: incidence of broken or reverse-order references. Evidence source: deterministic
  traceability projection. Accountable owner: Product authority. Baseline status: DEFINED.
  Target status: zero broken or reverse-order references by design. Validation authority:
  Product authority. Acceptance relationship: traceability-closure acceptance scenarios
  (REG-203 CTRL-V2-025, TEST-V2-048). Future blocking gate: Gate V2-G5.
- MEAS-V2-19 authority-boundary protection. Outcome: governed authority is protected
  (OUT-V2-023). Definition: protection of the authority boundary. Calculation concept:
  incidence of requirements authorizing implementation or Button-primary governed authority.
  Evidence source: authority-boundary analysis. Accountable owner: Product authority. Baseline
  status: DEFINED. Target status: zero boundary violations by design. Validation authority:
  Product authority. Acceptance relationship: authority-boundary acceptance scenarios (REG-203
  CTRL-V2-026, TEST-V2-049). Future blocking gate: Gate V2-G5.

## V2-29.5 Measurability commitment

This section is normative.

Every material capability in the integrated baseline is associated with a measure family in
this chapter or an explicit validation-pending classification (REG-203 NFR-V2-022). The three
structural measures (MEAS-V2-17, MEAS-V2-18, MEAS-V2-19) are DEFINED because the governance
controls and traceability tooling demonstrate them directly; the remaining measures remain
validation pending until confirmed against operational, policy, financial, privacy,
accessibility, bilingual, or stakeholder evidence.

## V2-29.6 Authorization posture

This section is normative.

This chapter defines measures and commitments only. It authorizes no implementation, no
procurement, no service-level contract, and no numeric target. Executive organizational
acceptance remains pending at the material-commitment gate.
