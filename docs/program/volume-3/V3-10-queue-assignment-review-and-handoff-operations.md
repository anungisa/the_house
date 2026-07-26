# V3-10 - Queue, Assignment, Review, and Handoff Operations

Document ID: V3-10  
Title: Queue, Assignment, Review, and Handoff Operations  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 3 Package 2 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-305 APP-V3-015)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V3-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 3 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-3/

## V3-10.1 Purpose

This section is normative.

This chapter defines queue ownership, assignment, review, and handoff operations for
affiliation work. It ensures that work is owned, assigned within reviewer eligibility,
aged and escalated, and handed off between functions without silently changing decision
authority (BR-V3-009, CAP-V3-010). It authorizes no implementation.

## V3-10.2 Queue creation and ownership

This section is normative.

Queues hold affiliation work items for a scope (national or jurisdictional). Each queue
has a single recorded owning function (FR-V3-010). National queues are owned by National
Operations; jurisdictional queues are owned by the responsible PTSO. Queue ownership is
recorded and does not transfer implicitly.

## V3-10.3 Jurisdictional assignment

This section is normative.

A work item is routed to the queue for its determined jurisdiction (V3-09, FR-V3-005
inherited). Assignment to a reviewer within that queue is governed by reviewer
eligibility and conflict-of-interest rules (RULE-V3-007).

## V3-10.4 Reviewer eligibility

This section is normative.

A reviewer is eligible for a work item only within the reviewer's recorded scope
(national or jurisdictional) and only where no conflict of interest exists. Eligibility
does not by itself confer finance or policy authority (BR-V3-003 inherited; segregation
of duties, V3-03).

## V3-10.5 Assignment and reassignment

This section is normative.

Work items are assigned to eligible reviewers and may be reassigned (FR-V3-010,
RULE-V3-007). Reassignment occurs on reviewer absence, conflict of interest, workload
imbalance, or escalation. Reassignment remains within reviewer eligibility and does not
transfer decision authority beyond eligibility.

## V3-10.6 Reviewer absence and conflicts of interest

This section is normative.

On reviewer absence, a work item is reassigned to another eligible reviewer. A reviewer
with a conflict of interest for a case is ineligible for that case and the item is
reassigned. Conflicts are recorded.

## V3-10.7 Work aging and workload imbalance

This section is normative.

Work-item age and queue workload are monitored (CTRL-V3-018). An aging item triggers
reassignment and escalation; a workload imbalance triggers rebalancing within eligibility.
Age and volume thresholds are not asserted numerically here and are validation-pending
(BR-V3-013, MEAS-V3-09).

## V3-10.8 Evidence review

This section is normative.

An eligible reviewer evaluates the case evidence and records a review outcome within
authority (V3-02). Review does not confirm reconciliation or record a governed lifecycle
decision outside the kernel.

## V3-10.9 Return for information and resubmission

This section is normative.

Where evidence is insufficient, the case is returned for information; the applicant
resubmits and the case re-enters at the review stage, preserving prior review evidence
(RULE-V3-002 inherited). Return and resubmission are recorded in the case record
(DATA-V3-003).

## V3-10.10 Handoff record template

This section is normative.

Every inter-function handoff is recorded with a common template so that authority is
never changed silently (FR-V3-011, BR-V3-009, CTRL-V3-010). Each handoff records:

- **Sending function** - the function releasing the work.
- **Receiving function** - the function receiving the work.
- **Trigger** - the condition that initiates the handoff.
- **Required information** - the information transferred with the work.
- **Authority retained** - the authority that remains with the sending function.
- **Authority transferred** - the authority, if any, explicitly transferred.
- **Expected acknowledgement** - the acknowledgement the receiving function returns.
- **Failure condition** - what constitutes a failed handoff.
- **Escalation route** - where a failed handoff escalates.
- **Audit expectation** - the audit record the handoff produces.

## V3-10.11 Defined handoffs

This section is normative.

The following handoffs are defined using the template in V3-10.10. In each, decision
authority transfers only where explicitly recorded (RULE-V3-008):

- **Review to finance** - for reconciliation; the affiliation decision authority is
  retained by the affiliation authority, not transferred to finance (V3-12).
- **Finance to review** - returning a reconciled or held case; no decision authority
  transfers.
- **Review to national** - escalating a jurisdictional case to national scope where
  national authority is reserved.
- **Operations to support** - for applicant assistance; no decision authority transfers to
  support (V3-13, BR-V3-012).
- **Support to operations** - returning or escalating a support-correlated case; no
  decision authority transfers to support.
- **Operations to policy** - for a policy-authority decision (V3-09, V3-11).

## V3-10.12 Escalation and national, finance, and support handoffs

This section is normative.

Escalation routes blocked or aging work to the accountable function (National Operations,
Finance and Reconciliation Operations, or the responsible PTSO) per the handoff template.
A handoff to support for assistance never transfers governed decision authority
(BR-V3-012).

## V3-10.13 Completion and queue removal

This section is normative.

A work item is removed from its queue when its stage completes or the case reaches a
governed terminal state through the kernel (V3-02). Completion and removal are recorded
in the case-and-queue operating record (DATA-V3-003) for audit reconstruction
(NFR-V3-004, CTRL-V3-015).

## V3-10.14 Validation status

This section is normative.

The queue and handoff operations are author-asserted and carry operational validation
pending. Aging and workload thresholds are validation-pending. Seasonal work-management
operations require validation with reviewers and PTSO and club representatives (Jen), and
national operating alignment with Rich. Pending validation blocks only the affected
operating rule or measure. Unresolved assumptions are recorded in V3-15.
