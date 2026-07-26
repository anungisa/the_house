# V4-13 - Review, Decision, Reconciliation, Activation, and Correction Domain Architecture

Document ID: V4-13  
Title: Review, Decision, Reconciliation, Activation, and Correction Domain Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-018)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-13.1 Purpose and scope

This section is normative.

This chapter defines the authoritative affiliation lifecycle - its state families and its transition
rules - and the separation between recommendation, decision, reconciliation, activation, and
correction. It is architecture definition. It does not implement a state machine, define database
tables, or author executable APIs.

## V4-13.2 State families

This section is normative.

The affiliation lifecycle uses the following state families. The final vocabulary may be refined in
detailed design, but the governed distinctions between them are normative:

```
Draft
Ready for submission
Submitted
Assigned
Under review
Returned for information
Resubmitted
Escalated
Refused
Withdrawn
Approved
Approved awaiting reconciliation
Ready for activation
Active
Activation recovery required
Expired
Closed
```

## V4-13.3 Per-state definition form

This section is normative.

Every state defines:

- entry conditions;
- permitted actors;
- permitted commands;
- exit transitions;
- invariant checks;
- required evidence;
- audit effect;
- notification or integration effect;
- correction posture;
- recovery behaviour.

No transition occurs except through a governed command that satisfies the destination state's entry
conditions and invariant checks; unknown or unpermitted transitions fail closed.

## V4-13.4 Separation of governed effects

This section is normative.

The architecture explicitly separates the following effects, which are never conflated:

- **review recommendation** - a reviewer's non-authoritative recommendation;
- **governed decision** - the authoritative approval or refusal, bound to actor, authority, evidence,
  rationale, and policy version;
- **financial reconciliation** - the governed confirmation of financial status from the authoritative
  external financial systems;
- **activation authorization** - the governed authorization that an approved, reconciled case may be
  activated;
- **activation execution** - the authoritative act that makes an affiliation active;
- **administrative correction** - a governed correction of recorded information;
- **governed-decision reconsideration** - the governed re-opening of a decision under authority.

## V4-13.5 Approval does not imply reconciliation or activation

This section is normative.

Approval is a governed decision. It does not by itself imply that financial reconciliation has
occurred or that authoritative activation has taken place. The states **Approved**, **Approved
awaiting reconciliation**, **Ready for activation**, and **Active** are distinct, and progression
between them requires the corresponding governed effect. This prevents an approval from being
misread as an active affiliation.

## V4-13.6 Review, assignment, return, and escalation

This section is normative.

A submitted case is **assigned** to a reviewer before it is **under review**; assignment is a
governed prerequisite where review authority requires it (see V4-15). A case may be **returned for
information** and later **resubmitted**, or **escalated** to national authority. Review produces a
recommendation; it does not itself constitute the governed decision.

## V4-13.7 Refusal, withdrawal, expiry, and closure

This section is normative.

A case may be **refused** (a governed negative decision), **withdrawn** (by authorized request),
**expired** (by governed time rules), or **closed** (a governed end-of-life outcome). Each is an
audited governed transition with defined entry conditions and correction posture.

## V4-13.8 Activation recovery and correction posture

This section is normative.

If authoritative activation cannot complete, the case enters **Activation recovery required**, from
which governed recovery restores a consistent authoritative state (see V4-16). Administrative
correction adjusts recorded information under governed authority without erasing history and without
substituting for a governed decision or reconsideration. Reconsideration of a governed decision is a
distinct, audited transition.

## V4-13.9 Boundaries

This section is normative.

This chapter defines the authoritative lifecycle and its governed transitions conceptually. It does
not implement transition logic, define physical state storage, or author executable interfaces;
those are downstream of Gate V4-G2.
