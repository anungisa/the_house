# V2-D - Package 4 Closure Record

Document ID: V2-D  
Title: Package 4 Closure Record  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 4 closure; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-037, APP-V2-038)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G4)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 4 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-D.1 Purpose

This section is normative.

This record closes Volume 2 Package 4 (Affiliation Service Experience and Operational
Specification). It defines Gate V2-G4, records the gate disposition, freezes the Package 4
corpus, and authorizes Volume 2 Package 5. It records governed service-experience
definition only; it authorizes no implementation, no procurement, no technical
architecture, no delivery plan, and no master development plan, and leaves executive
organizational acceptance pending.

## V2-D.2 Inherited Package 3 baseline

This section is normative.

Package 4 is authored on the frozen Package 3 baseline (V2-12 through V2-18 and V2-C),
closed at Gate V2-G3 (PASS) and frozen. Package 4 inherits that baseline unchanged and does
not reopen Package 3 content or alter Gate V2-G3.

## V2-D.3 Package 3 freeze-provenance result

This section is normative.

The Package 3 freeze provenance is unambiguous and distinguishes three distinct commits:
Package 3 source snapshot commit `4287b63` (the authoring commit containing V2-12 through
V2-18 and the expanded registers); Package 3 closure/freeze commit `184a331` (the closure
commit that adds V2-C, the Gate V2-G3 disposition, and the freeze record); and Package 3
merged commit `b6318b5` (the merge of the Package 3 branch into main via PR #9). The merged
commit was recorded by a narrow post-merge amendment (REG-204 DEC-V2-017, REG-205
APP-V2-028) that did not reopen Package 3 or alter Gate V2-G3 (PASS).

## V2-D.4 Detailed service-blueprint coverage

This section is normative.

V2-19 expands the high-level blueprint into pathway-specific service blueprints for
continuity confirmation, renewal with remediation, new affiliation, return and
resubmission, approved-but-awaiting-reconciliation, activation failure and recovery, and
refusal, withdrawal, expiry, and administrative correction. Each stage uses a controlled
descriptor and distinguishes what the user sees, what The Button does, what The House
governs, what staff perform, what external systems execute, and what remains manual pending
later authorization. Adopted in REG-204 DEC-V2-018 and ratified in REG-205 APP-V2-029.

## V2-D.5 Role and workspace coverage

This section is normative.

V2-20 defines role-based workspaces and a task model for the club representative, PTSO
reviewer, Curling Canada reviewer or administrator, finance and reconciliation staff, and
support and operations staff. A workspace grants no authority merely because information is
visible; authority derives only from a governed role. Adopted in DEC-V2-018 and ratified in
APP-V2-030.

## V2-D.6 Status, state, and required-action definition

This section is normative.

V2-21 separates governed lifecycle state, operational processing status, payment and
reconciliation status, evidence status, user-visible status, required action, and
service-health condition. Every user-visible status derives from a governed state and
defines audience, plain-language meaning, required action, responsible party, whether the
user can act, blocking effect, permitted next states, notification, and bilingual status.
The Button must not invent or independently mutate lifecycle status, and vague labels are
prohibited without a defined meaning and actor. Ratified in APP-V2-031.

## V2-D.7 Information and evidence interaction coverage

This section is normative.

V2-22 defines product-level forms, information-capture, and evidence-interaction
requirements, including drafts, save and resume, correction, replacement, expiry, rejected
and confidential evidence, submission confirmation, resubmission, and administrative
correction. History and provenance are preserved; no database fields or technical schemas
are defined. Adopted in DEC-V2-019 and ratified in APP-V2-032.

## V2-D.8 Communication and support model

This section is normative.

V2-23 defines a communication matrix across the lifecycle, each entry naming trigger,
audience, authority source, purpose, required and prohibited content, channel hypothesis,
urgency, acknowledgement, escalation, language and accessibility obligations, and audit
requirement. Support assists and hands off without creating unauthorized decision
authority, and notification-delivery failure provides an alternate path. Adopted in
DEC-V2-019 and ratified in APP-V2-033.

## V2-D.9 Bilingual, accessibility, and privacy posture

This section is normative.

V2-24 defines English and French parity, accessibility interaction requirements, inclusive
recovery, and privacy minimization and restricted-evidence handling. Conformance levels not
yet formally approved remain classified as validation pending rather than assumed.
Bilingual, accessibility, and privacy authorities are added to the stakeholder register
(REG-202 STK-V2-016, STK-V2-017, STK-V2-018). Adopted in DEC-V2-019 and ratified in
APP-V2-034.

## V2-D.10 Acceptance-scenario coverage

This section is normative.

V2-25 defines eighteen operational acceptance scenario families traced to acceptance tests
TEST-V2-026 through TEST-V2-043, each linking outcome, persona, use case, rule, workflow,
experience requirement, control, acceptance test, measure, and validation status. V2-26
consolidates the experience definition and lists downstream constraints that remain outside
Volume 2. These are acceptance definitions, not executable test implementations. Adopted in
DEC-V2-020 and ratified in APP-V2-035 and APP-V2-036.

## V2-D.11 Requirement-catalogue status

This section is normative.

The Package 4 service-experience catalogue (REG-203) adds requirements by identifier class:
CAP-V2-038..043; BR-V2-024..030; FR-V2-036..043; NFR-V2-017..021; UC-V2-037..046;
RULE-V2-026..029; WF-V2-011..013; UX-V2-013..022; DATA-V2-019..022; CTRL-V2-015..020;
TEST-V2-026..043. Every requirement traces along the OUT -> ... -> TEST chain and carries
`authorizes_implementation: false`. Experience requirements carry the experience metadata
block, and unvalidated experience requirements carry an explicit `acceptance_status`.

## V2-D.12 Unresolved validations

This section is normative.

The following remain classified, owned, and carried to a future blocking gate; each blocks
only the affected requirement, not the package:

- **Pathway-specific operational timing and staffing-dependent stages** -
  OPERATIONAL_VALIDATION_PENDING; owner Rich with selected PTSO and club representatives.
- **Reviewer authority scope and structured-information validation** -
  POLICY_VALIDATION_PENDING; owners Jen and Rich.
- **Bilingual equivalence and plain-language wording** - BILINGUAL_VALIDATION_PENDING;
  owner Bilingual Experience and Official-Languages Authority (STK-V2-016).
- **Accessibility conformance** - ACCESSIBILITY_VALIDATION_PENDING; owner Accessibility and
  Inclusive-Design Authority (STK-V2-017).
- **Privacy minimization and restricted-evidence handling** - PRIVACY_VALIDATION_PENDING;
  owner Privacy and Data-Protection Authority (STK-V2-018).
- **Channel, urgency, acknowledgement, and service-quality targets** -
  STAKEHOLDER_VALIDATION_PENDING and OPERATIONAL_VALIDATION_PENDING; owners Aubert and Rich.
- **Material organizational acceptance** - pending executive acceptance (Nolan) at a later
  gate.

## V2-D.13 Gate V2-G4 - Affiliation Service Experience Complete

This section is normative.

Gate V2-G4 is satisfied when all fifteen conditions hold:

1. the Package 3 provenance is unambiguous (V2-D.3);
2. all three affiliation pathways have detailed service blueprints (V2-19);
3. applicant, reviewer, administrator, finance, operations, and support experiences are
   defined (V2-20);
4. governed state and user-visible status are explicitly separated (V2-21);
5. required actions identify responsible actors and blocking effects (V2-21);
6. forms and evidence interactions include draft, correction, replacement, and recovery
   behaviour (V2-22);
7. material notification and communication triggers are defined (V2-23);
8. support intervention does not create unauthorized decision authority (V2-20, V2-23);
9. bilingual, accessibility, privacy, and restricted-evidence requirements are represented
   (V2-24);
10. material failure and recovery scenarios are covered (V2-19, V2-23, V2-25);
11. acceptance scenarios trace to outcomes, rules, controls, and tests (V2-25, REG-203);
12. unvalidated experience requirements are classified and owned (V2-D.12, REG-203);
13. no requirement authorizes implementation (REG-203, REG-204);
14. no technical architecture, delivery plan, or master development plan is created; and
15. Package 4 has had line-level review and is closed with a separate freeze commit (this
    record).

## V2-D.14 Gate disposition

This section is normative.

Gate V2-G4 is recorded as **PASS** with disposition
**AFFILIATION_SERVICE_EXPERIENCE_COMPLETE**. The gate authorization is recorded in REG-205
APP-V2-038 and the closure decision in REG-204 DEC-V2-021. The disposition authorizes no
implementation, procurement, technical architecture, delivery plan, or master development
plan.

## V2-D.15 Freeze

This section is normative.

The following Package 4 artifacts are frozen at version 1.0.0 (REG-205 APP-V2-039): V2-19,
V2-20, V2-21, V2-22, V2-23, V2-24, V2-25, V2-26, and this record V2-D. Changes to frozen
artifacts require a recorded Volume 2 amendment decision in REG-204 and a superseding
approval in REG-205; frozen artifacts are not edited in place.

## V2-D.16 Freeze provenance

This section is normative.

The Package 4 freeze source snapshot is commit `dfe3ae0` (the Package 4 authoring commit
that contains V2-19 through V2-26 and the expanded registers). The closure/freeze record is
authored in the subsequent Package 4 closure commit on branch
`docs/volume-2-affiliation-service-experience`, a distinct commit from the source snapshot,
and the merged commit is the merge of that branch into main and is recorded by narrow
amendment after merge. The source snapshot (`dfe3ae0`) is a distinct, named commit separate
from the closure/freeze commit, so the freeze baseline is unambiguous by construction.
Evidence posture: SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed. At
closure time the merged commit is recorded as PENDING_POST_MERGE and completed by narrow
amendment after the Package 4 pull request merges.

## V2-D.17 Package 5 authorization

This section is normative.

Volume 2 Package 5 is authorized to commence as the next product-governance package,
recorded in REG-204 DEC-V2-022. Package 5 remains definition and governance work. It does
not authorize implementation, procurement, technical architecture, delivery sequencing,
staffing, cost planning, or the master development plan, all of which remain pending
executive organizational acceptance at a later material-commitment gate.

## V2-D.18 Downstream posture

This section is normative.

The master development plan remains PENDING. Implementation is NOT AUTHORIZED. Procurement
is NOT AUTHORIZED. Technical architecture is NOT YET AUTHORIZED. Executive organizational
acceptance (Nolan, D0) remains PENDING at the material-commitment gate. This is a hard stop
after Package 4; Package 5 is authorized as definition work only.
