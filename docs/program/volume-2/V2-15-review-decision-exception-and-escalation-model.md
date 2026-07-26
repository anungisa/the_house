# V2-15 - Review, Decision, Exception, and Escalation Model

Document ID: V2-15  
Title: Review, Decision, Exception, and Escalation Model  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-022)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-15.1 Purpose

This section is normative.

This chapter defines the complete reviewer operating model and the governed decision,
exception, and escalation rules. An administrative correction remains distinguishable from
changing a governed decision (REG-203 BR-V2-020, RULE-V2-020). This chapter is rule
definition and authorizes no implementation.

## V2-15.2 Reviewer operating model

This section is normative.

The reviewer model defines jurisdictional routing, reviewer eligibility, assignment,
reassignment, conflicts of interest, delegated authority, the review queue, evidence
review, clarification, return for information, resubmission, escalation, refusal,
withdrawal, administrative correction, appeal or reconsideration where policy permits,
override, and decision finality. The reviewer eligibility and routing rule (RULE-V2-018)
routes a review by jurisdiction to an eligible reviewer with no disqualifying conflict of
interest.

## V2-15.3 Decision model

This section is normative.

The decision eligibility rule (RULE-V2-019) determines, from completeness, evidence
review, exception status, reviewer authority, and fee/reconciliation status, the permitted
action: return, escalate, approve, refuse, await reconciliation, or activate. Every
decision type defines:

- permitted actor;
- preconditions;
- required evidence;
- required rationale;
- state effect;
- notification;
- audit record;
- reversal authority;
- reconsideration rules.

Unknown decision authority fails closed (REG-203 BR-V2-019).

## V2-15.4 Administrative correction versus governed decision

This section is normative.

The correction-versus-decision rule (RULE-V2-020) holds that an administrative correction
adjusts non-governed record data, carries its own audit entry, and never substitutes for
changing a governed decision. Changing a governed decision requires the governed decision
authority and its own preconditions, rationale, evidence, and audit record. The two are
always distinguishable in the record (REG-203 CTRL-V2-013, TEST-V2-021).

## V2-15.5 Exception and escalation

This section is normative.

The exception and escalation rule (RULE-V2-024) raises governed exception states with
defined escalation thresholds, owners, and recovery paths. An exception blocks only the
affected application step, not the whole service. Material exception and recovery
scenarios - including duplicate organization and identity-matching exceptions
(UC-V2-035) - are covered by governed transitions.

## V2-15.6 Reconsideration and finality

This section is normative.

The reconsideration rule (RULE-V2-025) permits, where policy allows, a refused club to
request reconsideration under defined preconditions and governed authority, distinct from
resubmission. Where reconsideration is not permitted, decision finality applies.
Reconsideration policy is recorded as POLICY_VALIDATION_PENDING with owner Rich.

## V2-15.7 Unresolved validations

This section is normative.

Reviewer eligibility criteria, conflict-of-interest rules, escalation thresholds, and
reconsideration policy are recorded as pending validation with named owners (Rich for
operating alignment; selected PTSO and club representatives for current operational
exceptions) and a future blocking gate. Pending validation blocks only the affected rule.

## V2-15.8 Authorization posture

This section is normative.

This chapter defines review, decision, exception, and escalation rules only. It authorizes
no implementation, no procurement, and no technical architecture. All referenced rules in
REG-203 carry `authorizes_implementation: false`.
