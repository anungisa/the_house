# V3-02 - Affiliation Service Operating Model

Document ID: V3-02  
Title: Affiliation Service Operating Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-003)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-02.1 Purpose

This section is normative.

This chapter translates the three affiliation product pathways defined in Volume 2
into operating practice across the full service lifecycle, from service opening to
expiry and closure. For each pathway it distinguishes normal operation from
exceptional and escalated handling. It defines no technical architecture and
authorizes no implementation.

## V3-02.2 Service lifecycle stages

This section is normative.

The affiliation service operates over these stages, regardless of pathway:

1. **Opening** - a service instance is opened for a club and season and the pathway is
   determined (FR-V3-002, RULE-V3-001).
2. **Recognition** - jurisdictional recognition and routing (FR-V3-005).
3. **Review** - reviewers evaluate submissions and record outcomes.
4. **Reconciliation** - finance reconciles processor and ledger results (V3-05).
5. **Activation** - the affiliation is activated only after confirmed reconciliation
   (BR-V3-004, RULE-V3-003).
6. **Maintenance** - the active affiliation is maintained through the season.
7. **Expiry and closure** - the service instance expires or is closed at season end or
   on a governed lifecycle terminal state.

Governed lifecycle state transitions are owned by the House governance kernel;
Volume 3 defines the operating flow around them and never mutates governed state
directly.

## V3-02.3 Pathway determination

This section is normative.

At opening, the pathway is determined by current affiliation status, season currency,
and remediation state (RULE-V3-001, FR-V3-002). The three pathways are:

- **Continuity confirmation** - a club with a current affiliation confirms continuity
  with minimal review.
- **Renewal with remediation** - a renewing club with outstanding items is returned for
  correction and re-reviewed.
- **New affiliation** - a new club proceeds through the full pathway.

## V3-02.4 Continuity confirmation pathway

This section is normative.

- **Normal operation:** opening determines continuity; the club confirms; minimal
  review records an outcome; reconciliation confirms fees; activation proceeds
  (UC-V3-001).
- **Exceptional handling:** if continuity cannot be confirmed (lapsed status, new
  compliance flag, or unpaid fees), the case is redirected to renewal with remediation
  or held pending resolution.
- **Escalation:** compliance flags escalate to Compliance and Policy; financial
  exceptions to Finance and Reconciliation Operations.

## V3-02.5 Renewal with remediation pathway

This section is normative.

- **Normal operation:** opening determines renewal; review identifies remediation; the
  application is returned for correction; the club resubmits; re-review records an
  outcome; reconciliation confirms; activation proceeds (UC-V3-002, RULE-V3-002).
- **Return handling:** a returned application re-enters at the review stage, preserving
  prior review evidence (RULE-V3-002); it does not restart the full pathway.
- **Exceptional handling:** repeated failure to remediate holds the case; unresolved
  compliance or financial matters escalate.
- **Escalation:** persistent remediation failure to National or Jurisdictional
  Operations; policy ambiguity to Compliance and Policy.

## V3-02.6 New affiliation pathway

This section is normative.

- **Normal operation:** opening determines new affiliation; recognition and routing
  occur; review records an outcome; reconciliation confirms; activation proceeds
  (UC-V3-003).
- **Exceptional handling:** incomplete recognition, failed review, or reconciliation
  mismatch holds the case at the corresponding stage.
- **Escalation:** recognition disputes to the responsible PTSO or National Operations;
  reconciliation mismatches to Finance and Reconciliation Operations (UC-V3-004).

## V3-02.7 Reconciliation and activation dependency

This section is normative.

Across all pathways, activation depends on a confirmed reconciliation result
(BR-V3-004, RULE-V3-003, CTRL-V3-002). An unresolved mismatch holds the case in a
reconciliation-pending operating state and does not activate. The reconciliation
operating model is defined in V3-05.

## V3-02.8 Expiry and closure

This section is normative.

At season end or on a governed terminal transition, the service instance expires or is
closed through the governance kernel. Volume 3 defines the operating handoffs around
expiry and closure (notification, queue closure, record retention referral to V3-06)
but does not define the governed terminal transitions themselves, which are inherited
from the product and kernel definition.

## V3-02.9 Validation status

This section is normative.

The pathway operating models are author-asserted and carry operational validation
pending. Operating expectations are stated qualitatively; no service-level targets are
committed. Unresolved assumptions are recorded in V3-07.
