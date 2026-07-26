# V3-03 - Roles, Accountability, Delegation, and Segregation of Duties

Document ID: V3-03  
Title: Roles, Accountability, Delegation, and Segregation of Duties  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-004)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G1)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 1 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-03.1 Purpose

This section is normative.

This chapter defines functional operating roles and, for each, records accountable
decisions, permitted actions, prohibited actions, delegation, conflict restrictions,
evidence required, escalation route, and segregation-of-duty controls. Roles are
functional. This chapter commits no permanent named staffing and no headcount.

Operating authority derives from an accountable function and delegated authority, not
from workspace visibility or system access (BR-V3-001).

## V3-03.2 Reviewer role

This section is normative.

- **Accountable decisions:** record a review outcome (pass, return, or reject) for an
  assigned application.
- **Permitted actions:** evaluate evidence, return for correction, request policy
  guidance, record outcomes.
- **Prohibited actions:** confirm reconciliation or authorize activation for an
  application the same actor reviewed (BR-V3-003); record lifecycle decisions outside
  delegated scope.
- **Delegation:** a reviewer's scope may be delegated within national or jurisdictional
  bounds; delegation is recorded.
- **Conflict restrictions:** may not review an application in which the actor has a
  club or personal interest.
- **Evidence required:** recorded review outcome with basis.
- **Escalation route:** policy ambiguity to Compliance and Policy; aging items per
  V3-04.
- **Segregation-of-duty controls:** reviewer is not finance confirmer for the same
  application (CTRL-V3-001).

## V3-03.3 Finance and reconciliation role

This section is normative.

- **Accountable decisions:** confirm reconciliation for an application; dispose of
  financial exceptions.
- **Permitted actions:** reconcile processor and ledger results, resolve mismatches,
  confirm or hold financial readiness for activation.
- **Prohibited actions:** record a review outcome for an application the same actor
  finance-confirms (BR-V3-003); fabricate amounts or targets.
- **Delegation:** reconciliation confirmation may be delegated within finance
  operations; delegation is recorded.
- **Conflict restrictions:** may not confirm reconciliation where the actor has a
  financial interest in the club.
- **Evidence required:** confirmed reconciliation record referencing processor and
  ledger inputs.
- **Escalation route:** unresolved mismatches per V3-05; provider failures to National
  Operations.
- **Segregation-of-duty controls:** finance confirmer is not reviewer for the same
  application (CTRL-V3-001); activation-dependency control (CTRL-V3-002).

## V3-03.4 Compliance and policy role

This section is normative.

- **Accountable decisions:** interpret policy; dispose of compliance flags; set
  exception policy.
- **Permitted actions:** issue policy guidance, disposition compliance flags, define
  exceptions.
- **Prohibited actions:** perform operational review of individual applications as the
  reviewer of record; authorize implementation.
- **Delegation:** policy interpretation may be delegated within the compliance
  function; delegation is recorded.
- **Conflict restrictions:** may not set exception policy to benefit a club in which the
  actor has an interest.
- **Evidence required:** recorded policy guidance and compliance dispositions.
- **Escalation route:** national-reserved policy to National Operations.
- **Segregation-of-duty controls:** policy authority separated from operational review.

## V3-03.5 Support role

This section is normative.

- **Accountable decisions:** own and route a support case.
- **Permitted actions:** progress, annotate, and escalate cases; assist users.
- **Prohibited actions:** record review outcomes, reconciliation confirmations, or
  lifecycle decisions (BR-V3-002, RULE-V3-004).
- **Delegation:** case ownership may be reassigned within support; reassignment is
  recorded.
- **Conflict restrictions:** may not act on a case for a club in which the actor has an
  interest.
- **Evidence required:** case history and escalation record.
- **Escalation route:** to the accountable decision function (UC-V3-005).
- **Segregation-of-duty controls:** support-boundary control (CTRL-V3-003).

## V3-03.6 Privacy role

This section is normative.

- **Accountable decisions:** decide restricted-evidence access; dispose of privacy
  incidents.
- **Permitted actions:** grant or deny restricted access; direct privacy remediation.
- **Prohibited actions:** record affiliation lifecycle decisions.
- **Delegation:** access decisions may be delegated within the privacy function;
  delegation is recorded.
- **Conflict restrictions:** may not decide access to benefit a personal interest.
- **Evidence required:** recorded access decisions and incident dispositions.
- **Escalation route:** privacy incidents to National Operations.
- **Segregation-of-duty controls:** privacy authority separated from operational review
  and finance.

## V3-03.7 Delegation and segregation principles

This section is normative.

- Delegation transfers permitted actions within a function's authority and is always
  recorded; it never transfers a prohibited action.
- Segregation of duties requires that, for a single application, the reviewer of record
  and the finance confirmer are distinct actors (BR-V3-003, CTRL-V3-001).
- No single actor may combine roles in a way that defeats a recorded segregation-of-
  duty control.
- Support and external providers never acquire governed decision authority through
  delegation, escalation, or system access.

## V3-03.8 Validation status

This section is normative.

Role definitions are author-asserted and carry stakeholder validation pending. No
staffing, headcount, or organizational structure is committed. Unresolved assumptions
are recorded in V3-07.
