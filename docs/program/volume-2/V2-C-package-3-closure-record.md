# V2-C - Package 3 Closure Record

Document ID: V2-C  
Title: Package 3 Closure Record  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 3 closure; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-026, APP-V2-027)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-C.1 Purpose

This section is normative.

This record closes Volume 2 Package 3 (Affiliation Operating Rules and Service
Governance). It defines Gate V2-G3, records the gate disposition, freezes the Package 3
corpus, and authorizes Volume 2 Package 4. It records governed operating-rule definition
only; it authorizes no implementation, no procurement, no technical architecture, and no
master development plan, and leaves executive organizational acceptance pending.

## V2-C.2 Inherited Package 2 baseline

This section is normative.

Package 3 is authored on the frozen Package 2 baseline (V2-06 through V2-11 and V2-B),
closed at Gate V2-G2 (PASS) and frozen. Package 3 inherits that baseline unchanged and
does not reopen Package 2 content or alter Gate V2-G2.

## V2-C.3 Package 2 freeze-provenance result

This section is normative.

The Package 2 freeze provenance is unambiguous and distinguishes three distinct commits:
Package 2 source snapshot commit `071921c` (the authoring commit containing V2-06 through
V2-11 and the expanded registers); Package 2 closure/freeze commit `03488ed` (the closure
commit that adds V2-B, the Gate V2-G2 disposition, and the freeze record); and Package 2
merged commit `f7cf330` (the merge of the Package 2 branch into main via PR #7). The
merged commit was recorded by a narrow post-merge amendment (REG-204 DEC-V2-011, REG-205
APP-V2-018) that did not reopen Package 2 or alter Gate V2-G2 (PASS).

## V2-C.4 Controlled terminology and authority

This section is normative.

V2-12 defines the controlled affiliation terminology and the six-category authority model
(Curling Canada authority, PTSO authority, club responsibility, system enforcement,
operational discretion, and unresolved policy). Terms not defined in the framework are not
enforceable as governed rules. Adopted in REG-204 DEC-V2-012 and ratified in REG-205
APP-V2-019.

## V2-C.5 Pathway-selection model

This section is normative.

V2-13 defines pathway selection as a governed determination from historical recognition,
organization continuity, standing, evidence condition, jurisdiction, and material
organizational change, producing continuity, remediation, new affiliation, or manual
policy determination. Pathway is not applicant self-selection. Requirement applicability
is versioned by season, pathway, jurisdiction, organization classification, and policy
version. Eligibility thresholds remain policy-validation-pending (owner Jen). Adopted in
DEC-V2-013 and ratified in APP-V2-020.

## V2-C.6 Evidence and completeness rules

This section is normative.

V2-14 defines evidence validity, carry-forward, derived completeness, and submission
prerequisites. Completeness is derived deterministically from traceable facts and is never
a manual boolean. Evidence confidentiality and restricted visibility apply. Evidence-access
and privacy thresholds remain privacy-validation-pending. Ratified in APP-V2-021.

## V2-C.7 Review and decision model

This section is normative.

V2-15 defines reviewer assignment and authority, return and resubmission, exception and
escalation, the decision set (return, escalate, approve, refuse, await reconciliation,
activate), and reconsideration. Administrative correction is kept distinct from governed
decision change, and unknown reviewer authority fails closed. Ratified in APP-V2-022.

## V2-C.8 Fee, reconciliation, and activation model

This section is normative.

V2-16 defines fee policy references, payment-execution boundaries, reconciliation, and
exactly-once activation. Fee policy, payment execution, and accounting remain separate
authorities; The House is not the system of record for payment processing. No fee amounts
are invented; financial values remain financial-validation-pending (owner Helene).
Adopted in DEC-V2-014 and ratified in APP-V2-023.

## V2-C.9 Operational control model

This section is normative.

V2-17 defines the service operations, support, recovery, and control model, including
deterministic rule evaluation, rule-version and effective-date audit, financial-boundary
segregation, exactly-once activation idempotency, administrative-correction audit
distinction, and evidence confidentiality controls. Service levels are classified and no
unsupported timing commitment is introduced. Ratified in APP-V2-024.

## V2-C.10 Decision-table and rule coverage

This section is normative.

V2-18 provides the pathway decision table (RULE-V2-010 / TEST-V2-014), the requirement
applicability table (RULE-V2-014 / TEST-V2-015), and the decision eligibility table
(RULE-V2-019 / TEST-V2-020), plus acceptance coverage linking every material rule along
the chain RULE -> workflow -> use case -> control -> acceptance test in REG-203. This is
acceptance definition, not executable test implementation. Ratified in APP-V2-025.

## V2-C.11 Requirement-catalogue status

This section is normative.

The Package 3 operating-rule catalogue (REG-203) adds requirements by identifier class:
CAP-V2-032..037; BR-V2-014..023; FR-V2-025..035; NFR-V2-013..016; UC-V2-027..036;
RULE-V2-010..025; WF-V2-006..010; UX-V2-009..012; DATA-V2-011..018; API-V2-009..012;
EVT-V2-010..017; CTRL-V2-009..014; TEST-V2-014..025. Every requirement traces along the
OUT -> ... -> TEST chain and carries `authorizes_implementation: false`.

## V2-C.12 Unresolved policy validations

This section is normative.

The following remain classified, owned, and carried to a future blocking gate; each blocks
only the affected rule, not the package:

- **Pathway eligibility and evidence rules** - POLICY_VALIDATION_PENDING; owner Jen.
- **Fee policy, amounts, and reconciliation** - FINANCIAL_VALIDATION_PENDING; owner
  Helene.
- **National operating alignment and jurisdictional requirement content** -
  OPERATIONAL_VALIDATION_PENDING; owner Rich.
- **Evidence confidentiality and privacy handling** - PRIVACY_VALIDATION_PENDING; owner
  privacy authority.
- **Current operational exceptions** - OPERATIONAL_VALIDATION_PENDING; owners selected
  PTSO and club representatives.
- **Product and technology consistency** - STAKEHOLDER_VALIDATION_PENDING; owner Aubert.
- **Material organizational acceptance** - pending executive acceptance (Nolan) at a later
  gate.

## V2-C.13 Gate V2-G3 - Affiliation Operating Rules Complete

This section is normative.

Gate V2-G3 is satisfied when all fourteen conditions hold:

1. the Package 2 freeze provenance is unambiguous (V2-C.3);
2. affiliation operating terminology and authority are controlled (V2-12);
3. pathway-selection logic is defined (V2-13);
4. seasonal, jurisdictional, and versioned requirement applicability is defined (V2-13);
5. evidence validity, carry-forward, completeness, and submission rules are defined
   (V2-14);
6. reviewer assignment, authority, return, resubmission, escalation, and decision rules
   are defined (V2-15);
7. fee, payment, accounting, reconciliation, and activation boundaries are defined
   (V2-16);
8. administrative correction and governed-decision changes are separated (V2-15, V2-16);
9. material exception and recovery scenarios are covered (V2-15, V2-17);
10. decision tables and acceptance-rule traceability exist (V2-18, REG-203);
11. unvalidated policies are explicitly classified and owned (V2-C.12, REG-203);
12. no rule or decision authorizes implementation (REG-203, REG-204);
13. no technical architecture or master development plan is created; and
14. Package 3 has had line-level review and is closed with a separate freeze commit (this
    record).

## V2-C.14 Gate disposition

This section is normative.

Gate V2-G3 is recorded as **PASS** with disposition
**AFFILIATION_OPERATING_RULES_COMPLETE**. The gate authorization is recorded in REG-205
APP-V2-027 and the closure decision in REG-204 DEC-V2-015. The disposition authorizes no
implementation, procurement, technical architecture, or master development plan.

## V2-C.15 Freeze

This section is normative.

The following Package 3 artifacts are frozen at version 1.0.0 (REG-205 APP-V2-028):
V2-12, V2-13, V2-14, V2-15, V2-16, V2-17, V2-18, and this record V2-C. Changes to frozen
artifacts require a recorded Volume 2 amendment decision in REG-204 and a superseding
approval in REG-205; frozen artifacts are not edited in place.

## V2-C.16 Freeze provenance

This section is normative.

The Package 3 freeze source snapshot is commit `4287b63` (the Package 3 authoring commit
that contains V2-12 through V2-18 and the expanded registers). The closure/freeze record
is authored in the subsequent Package 3 closure commit on branch
`docs/volume-2-affiliation-operating-rules`, a distinct commit from the source snapshot,
and the merged commit is the merge of that branch into main and is recorded by narrow
amendment after merge. The source snapshot (`4287b63`) is a distinct, named commit
separate from the closure/freeze commit, so the freeze baseline is unambiguous by
construction. Evidence posture: SELF-ATTESTED / AUTHOR-VERIFIED; independent validation
not claimed.

## V2-C.17 Package 4 authorization

This section is normative.

Volume 2 Package 4 is authorized to commence as the next product-governance package,
recorded in REG-204 DEC-V2-016. Package 4 remains definition and governance work. It does
not authorize implementation, procurement, technical architecture, or the master
development plan, all of which remain pending executive organizational acceptance at the
material-commitment gate.

## V2-C.18 Downstream posture

This section is normative.

Unchanged by this closure:

- **Master development plan**: pending.
- **Implementation and procurement**: not authorized.
- **Technical architecture**: not created.
- **Executive organizational acceptance** (Nolan, D0): pending at a later
  material-commitment gate.
