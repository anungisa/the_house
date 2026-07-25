# V2-04 - Affiliation Service Blueprint

Document ID: V2-04  
Title: Affiliation Service Blueprint  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-008)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-04.1 Purpose

This section is normative.

This chapter defines the affiliation service blueprint: the end-to-end journey across
The Button and The House for the Package 1 scope (submit -> review -> decide ->
activate), and the governed lifecycle it drives. The blueprint is a definition, not an
implementation, and authorizes no construction.

## V2-04.2 Governed lifecycle

This section is normative.

The affiliation governed lifecycle, inherited and confirmed from V1-24, is:

`draft -> submitted -> under_review -> approved -> active`

with onward governed branches (suspended, reinstated, revoked, closed, archived)
outside the Package 1 defining scope. Every transition is executed only through the
Governance Kernel, is tenant-isolated, and produces audit and, for high-risk
transitions, evidence.

## V2-04.3 Service journey (front stage and back stage)

This section is normative.

| Step | Actor | Front stage (Button) | Back stage (House) | Governed transition |
| --- | --- | --- | --- | --- |
| 1 Prepare | Club Administrator | Guided form; required actions and status | Draft application held as projection | (none; draft) |
| 2 Submit | Club Administrator | Submit action; confirmation | Kernel validates required-fields guard; creates submitted state; audit | draft -> submitted |
| 3 Route | System | Status: under review | Kernel routes to review | submitted -> under_review |
| 4 Review and decide | Reviewer | (n/a) | Reviewer scope guard; decision recorded with evidence | under_review -> approved / rejected |
| 5 Activate | System | Status: active | Season-current guard; activation; audit and evidence | approved -> active |
| 6 Communicate | System | Status and required-action notifications | Outbox-published events after commit | (post-commit) |

The Button surfaces status and required actions at every step; The House owns every
governed state change.

## V2-04.4 Guards and controls in the blueprint

This section is normative.

The blueprint depends on the governed guards inherited from the Volume 1 affiliation
model, expressed here at the RULE level (REG-203):

- required fields complete before submit (RULE-V2-001);
- reviewer scope enforced before decision (RULE-V2-002); and
- season current before activation (RULE-V2-003).

Governed-transition and audit/evidence controls (CTRL-V2-001, CTRL-V2-002) apply to
every state change, and events (EVT-V2-001..003) are published only after commit
through the transactional outbox.

## V2-04.5 Data and interface concepts

This section is normative.

The blueprint identifies, at concept level only, the AffiliationApplication concept
(DATA-V2-001) and the affiliation decision/evidence concept (DATA-V2-002), together
with the submit and reviewer-decision interfaces (API-V2-001, API-V2-002). These are
definitions for traceability; no schema, migration, or API is authored or authorized in
Package 1.

## V2-04.6 Boundary conformance

This section is normative.

Every back-stage step is a House responsibility executed through the kernel. Every
front-stage step is a Button responsibility that displays projections and submits
requests. No front-stage step owns or mutates governed state, consistent with V2-03.
