# V3-14 - Operational Quality, Assurance, Audit, and Management Controls

Document ID: V3-14  
Title: Operational Quality, Assurance, Audit, and Management Controls  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 2 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-019)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-14.1 Purpose

This section is normative.

This chapter defines the operational quality, assurance, audit, and management controls
for the affiliation season. Each control is defined by a common template and carries a
frequency classification and a validation status. No numerical thresholds are invented;
unbaselined thresholds are validation-pending (BR-V3-013, CAP-V3-014). This chapter
authorizes no implementation.

## V3-14.2 Control template

This section is normative.

Each control below states its:

- **Control objective** - what the control assures.
- **Control owner** - the function accountable for the control.
- **Control performer** - the function that performs the control.
- **Frequency classification** - one of EVENT_DRIVEN, CONTINUOUS, PER_CASE, PER_SEASON,
  PERIODIC_BASELINE_PENDING, or INCIDENT_DRIVEN.
- **Evidence generated** - the evidence the control produces.
- **Exception threshold status** - whether a numerical threshold is defined or
  validation-pending (no thresholds are invented).
- **Escalation** - where control exceptions escalate.
- **Related outcome, rule, and acceptance test** - the traceability references.
- **Validation status** - the control's validation posture.

## V3-14.3 Readiness-gate control

This section is normative.

- **Objective:** ensure a season phase is not entered until its readiness conditions are
  met.
- **Owner:** Curling Canada National Operations. **Performer:** National Operations.
- **Frequency classification:** PER_SEASON.
- **Evidence generated:** readiness sign-off.
- **Exception threshold status:** validation-pending; no numerical threshold.
- **Escalation:** National Operations.
- **Related:** OUT-V3-008, RULE-V3-005, TEST-V3-008 (CTRL-V3-008).
- **Validation status:** author-asserted, operational validation pending.

## V3-14.4 Pathway-selection-integrity control

This section is normative.

- **Objective:** ensure each pathway determination carries a determination class and an
  authority.
- **Owner:** Compliance and Policy Function. **Performer:** operations and reviewers.
- **Frequency classification:** PER_CASE.
- **Evidence generated:** pathway determination record.
- **Exception threshold status:** not applicable.
- **Escalation:** Compliance and Policy Function.
- **Related:** OUT-V3-009, RULE-V3-006, TEST-V3-009 (CTRL-V3-009).
- **Validation status:** author-asserted, policy validation pending.

## V3-14.5 Handoff-authority control

This section is normative.

- **Objective:** ensure each handoff records retained and transferred authority and does
  not silently change decision authority.
- **Owner:** National Operations. **Performer:** sending and receiving functions.
- **Frequency classification:** EVENT_DRIVEN.
- **Evidence generated:** handoff record.
- **Exception threshold status:** not applicable.
- **Escalation:** National Operations.
- **Related:** OUT-V3-010, RULE-V3-008, TEST-V3-010 (CTRL-V3-010).
- **Validation status:** author-asserted, operational validation pending.

## V3-14.6 Exception-category control

This section is normative.

- **Objective:** ensure each exception and correction is handled under its own category
  authority and does not substitute for a governed decision.
- **Owner:** Compliance and Policy Function. **Performer:** the category authority.
- **Frequency classification:** PER_CASE.
- **Evidence generated:** exception disposition record.
- **Exception threshold status:** not applicable.
- **Escalation:** the category authority.
- **Related:** OUT-V3-011, RULE-V3-012, TEST-V3-011 (CTRL-V3-011).
- **Validation status:** author-asserted, operational validation pending.

## V3-14.7 Segregation-of-duties control

This section is normative.

- **Objective:** ensure the reviewer of an application is not its finance confirmer for
  activation (inherited from Package 1, CTRL-V3-001).
- **Owner:** National Operations. **Performer:** operations and finance.
- **Frequency classification:** PER_CASE.
- **Evidence generated:** segregation record.
- **Exception threshold status:** not applicable.
- **Escalation:** National Operations.
- **Related:** OUT-V3-003, BR-V3-003, TEST-V3-001 (CTRL-V3-001, inherited).
- **Validation status:** author-asserted, operational validation pending.

## V3-14.8 Activation-idempotency control

This section is normative.

- **Objective:** ensure activation executes exactly once for an affiliation.
- **Owner:** Finance and Reconciliation Operations. **Performer:** authorized activation
  operation.
- **Frequency classification:** EVENT_DRIVEN.
- **Evidence generated:** activation record.
- **Exception threshold status:** not applicable.
- **Escalation:** Finance and Reconciliation Operations; incident recovery on failure.
- **Related:** OUT-V3-012, RULE-V3-010, TEST-V3-012 (CTRL-V3-012).
- **Validation status:** author-asserted, financial validation pending.

## V3-14.9 Support-boundary control

This section is normative.

- **Objective:** ensure support actions cannot change pathway, approve evidence, record
  decisions, waive fees, or activate affiliations.
- **Owner:** Support and Service Operations. **Performer:** support.
- **Frequency classification:** CONTINUOUS.
- **Evidence generated:** support action log.
- **Exception threshold status:** not applicable.
- **Escalation:** the accountable decision function.
- **Related:** OUT-V3-013, RULE-V3-011, TEST-V3-013 (CTRL-V3-013).
- **Validation status:** author-asserted, operational validation pending.

## V3-14.10 Threshold-baseline control

This section is normative.

- **Objective:** ensure operating thresholds are baselined or marked validation-pending in
  the capacity model.
- **Owner:** National Operations. **Performer:** operations and finance.
- **Frequency classification:** PERIODIC_BASELINE_PENDING.
- **Evidence generated:** measure baseline record.
- **Exception threshold status:** baseline pending; no numerical threshold invented.
- **Escalation:** National Operations and the validation backlog.
- **Related:** OUT-V3-015, BR-V3-013, TEST-V3-014 (CTRL-V3-014).
- **Validation status:** author-asserted, baseline pending.

## V3-14.11 Audit-reconstruction control

This section is normative.

- **Objective:** ensure case and work-management history is reconstructable across phases,
  handoffs, exceptions, and reconciliation outcomes.
- **Owner:** National Operations. **Performer:** operations.
- **Frequency classification:** PER_SEASON.
- **Evidence generated:** audit reconstruction pack.
- **Exception threshold status:** not applicable.
- **Escalation:** National Operations.
- **Related:** OUT-V3-014, NFR-V3-004, TEST-V3-015 (CTRL-V3-015).
- **Validation status:** author-asserted, operational validation pending.

## V3-14.12 Bilingual-and-accessibility recovery control

This section is normative.

- **Objective:** ensure service-recovery defects route to their accountable owners for
  triage and remediation.
- **Owner:** Bilingual Content Owner and Accessibility Accountability. **Performer:**
  support and content owners.
- **Frequency classification:** INCIDENT_DRIVEN.
- **Evidence generated:** defect triage record.
- **Exception threshold status:** validation-pending.
- **Escalation:** the accountable content and accessibility owners.
- **Related:** OUT-V3-013, NFR-V3-005, TEST-V3-016 (CTRL-V3-016).
- **Validation status:** author-asserted, accessibility validation pending.

## V3-14.13 Restricted-evidence-access control

This section is normative.

- **Objective:** ensure restricted evidence is accessed only under recorded authority.
- **Owner:** Privacy Authority. **Performer:** operations and support under authority.
- **Frequency classification:** EVENT_DRIVEN.
- **Evidence generated:** access authorization record.
- **Exception threshold status:** not applicable.
- **Escalation:** Privacy Authority.
- **Related:** OUT-V3-011, BR-V3-010, TEST-V3-017 (CTRL-V3-017).
- **Validation status:** author-asserted, privacy validation pending.

## V3-14.14 Queue-aging-and-unresolved-exception control

This section is normative.

- **Objective:** monitor aging cases and unresolved exceptions and trigger escalation.
- **Owner:** National Operations and PTSOs. **Performer:** operations.
- **Frequency classification:** CONTINUOUS.
- **Evidence generated:** queue-aging and exception monitor record.
- **Exception threshold status:** validation-pending; aging thresholds not asserted.
- **Escalation:** the responsible operations function.
- **Related:** OUT-V3-014, NFR-V3-004, TEST-V3-018 (CTRL-V3-018).
- **Validation status:** author-asserted, operational validation pending.

## V3-14.15 No-material-commitment control

This section is normative.

- **Objective:** ensure no Package 2 requirement authorizes staffing, cost, procurement,
  architecture, implementation, or a service-level commitment.
- **Owner:** Accountable Program Authority. **Performer:** program governance.
- **Frequency classification:** PER_SEASON.
- **Evidence generated:** scope boundary attestation.
- **Exception threshold status:** not applicable.
- **Escalation:** the executive material-commitment authority at the later gate.
- **Related:** OUT-V3-016, BR-V3-014, TEST-V3-019 (CTRL-V3-019).
- **Validation status:** author-asserted; boundary defined.

## V3-14.16 Validation status

This section is normative.

The operational controls are author-asserted and carry validation pending as recorded per
control. No numerical thresholds are invented. Operational quality and assurance controls
require validation with National Operations (Rich), finance operations (Hélène), and the
Compliance and Policy Function. Pending validation blocks only the affected control.
Unresolved assumptions are recorded in V3-15.
