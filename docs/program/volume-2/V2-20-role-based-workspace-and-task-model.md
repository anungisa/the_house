# V2-20 - Role-Based Workspace and Task Model

Document ID: V2-20  
Title: Role-Based Workspace and Task Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 4 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-030)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-20.1 Purpose

This section is normative.

This chapter defines the service experience for each operating role as a role-based
workspace and task model. It is product definition only and does not define screen
layouts, component specifications, or technical architecture (REG-203 CAP-V2-039,
FR-V2-037).

## V2-20.2 Authority principle

This section is normative.

A workspace grants no authority merely because information is visible. Authority derives
only from a governed role; visibility and authority are separate (REG-203 BR-V2-025). The
Governance Kernel remains the sole authority for lifecycle transitions.

## V2-20.3 Club representative

This section is normative.

The club representative workspace presents: club recognition; organization confirmation;
pathway explanation; current requirements; evidence submission; fee and reconciliation
visibility; required actions; return requests; resubmission; decision and next steps; and
support access (UC-V2-037, UC-V2-038, UX-V2-014).

## V2-20.4 PTSO reviewer

This section is normative.

The PTSO reviewer workspace presents: a jurisdiction-specific queue; assigned
applications; pathway and standing; requirement completeness; evidence review; return
requests; escalation; recommendation or decision authority; and aging work and exceptions
(UC-V2-039, UX-V2-015).

## V2-20.5 Curling Canada reviewer or administrator

This section is normative.

The national workspace presents: national oversight; cross-jurisdiction exceptions;
escalated files; governed decisions; policy-version visibility; administrative
corrections; and audit context (UC-V2-040, UX-V2-016).

## V2-20.6 Finance and reconciliation staff

This section is normative.

The finance and reconciliation workspace presents: fee obligation; payment result;
accounting status; mismatch investigation; waiver or adjustment authority; reconciliation
exceptions; and activation dependencies, all within the financial boundary in which the
affiliation service holds no ledger or payment-execution authority (UC-V2-041, UX-V2-017,
REG-203 CTRL-V2-011).

## V2-20.7 Support and operations staff

This section is normative.

The support and operations workspace presents: reported issue; service context; permitted
assistance; restricted evidence; handoff to reviewer or administrator; recovery action;
and audit expectation. Support intervention never creates or substitutes governed decision
authority (UC-V2-042, UX-V2-018, REG-203 RULE-V2-029, BR-V2-030).

## V2-20.8 Task model

This section is normative.

Each workspace exposes a task model of encounter, understand, act, submit, and track
(WF-V2-011). Each task identifies its responsible role, the governed status it reflects,
the required action, and whether the actor is permitted to act.

## V2-20.9 Unresolved validations

This section is normative.

Role-specific queue behaviour and aging thresholds remain OPERATIONAL_VALIDATION_PENDING
(owner Rich). Reviewer authority scope remains POLICY_VALIDATION_PENDING (owner Jen and
Rich). Pending validation blocks only the affected role behaviour.

## V2-20.10 Authorization posture

This section is normative.

This chapter defines role-based workspaces and task models only. It authorizes no
implementation, no layouts, and no technical architecture. All referenced requirements in
REG-203 carry `authorizes_implementation: false`.
