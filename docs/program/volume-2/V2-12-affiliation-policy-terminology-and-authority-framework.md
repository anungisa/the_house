# V2-12 - Affiliation Policy, Terminology, and Authority Framework

Document ID: V2-12  
Title: Affiliation Policy, Terminology, and Authority Framework  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-019)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-12.1 Purpose

This section is normative.

This chapter defines the controlled language and authority model for the affiliation
service. Package 2 defined what the affiliation product offers; this chapter fixes the
terminology and authority framework on which the Package 3 operating rules depend. A term
that is not defined here is not enforceable as a governed rule (REG-203 BR-V2-014). This
chapter is product and policy definition; it authorizes no implementation.

## V2-12.2 Authority model

This section is normative.

The affiliation service distinguishes six authority categories, and every policy concept
is assigned against them:

- **Curling Canada authority** - national policy and system-of-record authority over
  affiliation lifecycle, evidence, and decisions.
- **PTSO authority** - delegated regional authority within a jurisdiction; consumes and
  contributes to affiliation state but does not own the authoritative lifecycle record.
- **Club responsibility** - obligations a club must satisfy (information, evidence,
  acknowledgements, authorized representation).
- **System enforcement** - conditions enforced deterministically by governed rules.
- **Operational discretion** - decisions an authorized operator may make within policy.
- **Unresolved policy** - a concept whose authority or rule is not yet validated and is
  carried to a future blocking gate.

The House owns lifecycle state, evidence, authority, decisions, and audit. The Button
owns the guided experience. Payment execution and accounting are external authority
boundaries (V2-16). No Button-primary actor holds governed authority.

## V2-12.3 Controlled terminology

This section is normative.

Each concept below is governed. For each, the affiliation service records: definition;
policy owner; operational owner; decision authority; evidence required; effective scope;
validation status; and any unresolved question. The concepts are:

- **club** - an organized curling entity that may seek recognition and affiliation.
- **recognized club** - a club whose organizational identity and standing are
  acknowledged by the governing authority, independent of a given season.
- **affiliated club** - a recognized club with an active affiliation for a specific
  season.
- **new organization** - an entity with no prior recognition seeking affiliation.
- **materially reconstituted organization** - an entity whose legal or operating identity
  has changed materially such that prior recognition does not carry forward unchanged.
- **dormant, withdrawn, suspended, merged, or dissolved club** - governed non-standard
  standings, each with defined transitions (V2-08, V2-15).
- **affiliation season** - the versioned period to which requirements, fees, and
  confirmations apply.
- **standing** - the governed status of a club with respect to obligations and
  compliance.
- **jurisdiction** - the PTSO or national scope determining applicable rules and review
  authority.
- **authorized representative** - an individual formally authorized to act for a club.
- **reviewer** - an actor authorized to review and act on applications within a
  jurisdiction.
- **decision authority** - the actor authorized to make a specified governed decision.
- **evidence** - governed supporting fact bound to a requirement and affiliation (V2-14).
- **requirement** - a versioned, applicable obligation (V2-13).
- **exception** - a governed deviation requiring resolution (V2-15).
- **remediation** - the governed correction of deficiencies within renewal (V2-13).
- **activation** - the governed transition to active affiliation (V2-16).

## V2-12.4 Concept governance attributes

This section is normative.

For every governed concept and rule, REG-203 records the policy owner, operational owner,
validation status, effective scope, season-versioning, jurisdiction-scoping, exception
authority where applicable, and the future blocking gate for unresolved items. No concept
is represented as validated policy when it is only a proposed product rule; classification
uses the REG-203 rule-classification scheme (DEFINED_PRODUCT_RULE, POLICY_VALIDATION_PENDING,
OPERATIONAL_VALIDATION_PENDING, FINANCIAL_VALIDATION_PENDING, PRIVACY_VALIDATION_PENDING,
STAKEHOLDER_VALIDATION_PENDING).

## V2-12.5 Authority distinctions and unresolved policy

This section is normative.

The framework clearly separates Curling Canada authority, PTSO authority, club
responsibility, system enforcement, operational discretion, and unresolved policy. Where a
concept's authority or rule is not yet validated, it is recorded as unresolved policy with
a named owner (Jen for pathway and evidence, Helene for fee and reconciliation, Rich for
national operating alignment) and a future blocking gate, rather than being asserted as
settled.

## V2-12.6 Authorization posture

This section is normative.

This chapter is terminology and authority definition only. It authorizes no
implementation, no procurement, no technical architecture, and no master development plan.
Governed rules that use this terminology are recorded in REG-203 (CAP-V2-032, BR-V2-014,
BR-V2-023) and in the subsequent Package 3 chapters, all with
`authorizes_implementation: false`.
