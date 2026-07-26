# V2-09 - Affiliation Capability and Requirement Catalogue

Document ID: V2-09  
Title: Affiliation Capability and Requirement Catalogue  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Volume 2 Package 2 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-205 APP-V2-013)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V2-G2)  
Supersedes: None  
Review Cycle: Frozen at Volume 2 Package 2 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-2/

## V2-09.1 Purpose

This section is normative.

This chapter defines the controlled capability and requirement catalogue for the
affiliation service. It expands the Package 1 representative trace (V2-05) into a
product-level catalogue that is testable without prescribing implementation. The
authoritative catalogue is REG-203; this chapter organizes and explains it.

## V2-09.2 Chain and traceability

This section is normative.

Every requirement is recorded along the OUT -> CAP -> BR -> FR -> NFR -> UC -> RULE ->
WF -> UX -> DATA -> API -> EVT -> CTRL -> TEST chain inherited from V2-05. Each
requirement traces to a parent that precedes it in the chain, and no requirement
authorizes implementation. Acceptance is expressed as TEST-level requirements referenced
from functional requirements and use cases.

## V2-09.3 Capability areas

This section is normative.

The catalogue covers the following capability areas, recorded as CAP-level requirements
in REG-203 (CAP-V2-001 through CAP-V2-031):

1. affiliation lifecycle management (CAP-V2-001);
2. guided submission and status (CAP-V2-002);
3. review and decisioning (CAP-V2-003);
4. membership visibility and reporting (CAP-V2-004);
5. external authority reconciliation (CAP-V2-005);
6. organization recognition (CAP-V2-006);
7. representative authority confirmation (CAP-V2-007);
8. jurisdiction resolution (CAP-V2-008);
9. seasonal affiliation opening (CAP-V2-009);
10. pathway determination (CAP-V2-010);
11. versioned requirement application (CAP-V2-011);
12. evidence collection and binding (CAP-V2-012);
13. completeness checking (CAP-V2-013);
14. reviewer routing and queues (CAP-V2-014);
15. return and resubmission (CAP-V2-015);
16. decision recording (CAP-V2-016);
17. fee reconciliation boundary (CAP-V2-017);
18. activation exactly once (CAP-V2-018);
19. notification (CAP-V2-019);
20. status and required-action exposure (CAP-V2-020);
21. administrative correction (CAP-V2-021);
22. audit and operational reporting (CAP-V2-022);
23. privacy and data protection (CAP-V2-023);
24. bilingual service (CAP-V2-024);
25. accessibility (CAP-V2-025);
26. security and least privilege (CAP-V2-026);
27. availability and resilience (CAP-V2-027);
28. performance (CAP-V2-028);
29. supportability (CAP-V2-029);
30. data portability (CAP-V2-030); and
31. non-standard club lifecycle handling (CAP-V2-031).

## V2-09.4 Business rules

This section is normative.

The catalogue records business rules (BR-V2-001 through BR-V2-013) that constrain the
capabilities, including: affiliation is seasonal; only authorized reviewers decide; a
club holds at most one active affiliation per season; recognition precedes affiliation;
representatives must be authorized; each affiliation has exactly one jurisdiction; the
requirements applied are versioned for the season; applications must be complete before
submission; returns must state required information; activation is at most once;
administrative correction must not bypass governed decisions; and fee reconciliation
confers no accounting authority.

## V2-09.5 Functional and non-functional requirements

This section is normative.

The catalogue records functional requirements (FR-V2-001 through FR-V2-024) for every
capability and non-functional requirements (NFR-V2-001 through NFR-V2-012) covering
governed-transition integrity, tenant isolation and audit, privacy and data
minimization, bilingual service, accessibility, security and least privilege,
availability and resilience, performance, supportability, data portability, and
auditability. Non-functional targets that require an approved baseline are recorded with
a pending validation status rather than a fabricated number.

## V2-09.6 Use cases, rules, workflows, and surfaces

This section is normative.

The catalogue records the twenty-six use cases (UC-V2-001 through UC-V2-026) defined in
V2-08, the guard-level rules (RULE-V2-001 through RULE-V2-009) including the inherited
guard concepts AFFILIATION_REQUIRED_FIELDS_COMPLETE, AFFILIATION_REQUIRED_DOCS_PRESENT,
AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS, AFFILIATION_FEES_PAID, SEASON_IS_CURRENT, and
ACTOR_HAS_REVIEWER_SCOPE, the pathway workflows (WF-V2-001 through WF-V2-005), and the
experience surfaces (UX-V2-001 through UX-V2-008). Guard rules are named concepts;
their handler logic is not implemented in this package.

## V2-09.7 Data, interface, event, and control concepts

This section is normative.

The catalogue records data concepts (DATA-V2-001 through DATA-V2-010), interface
concepts (API-V2-001 through API-V2-008), domain events emitted through the
transactional outbox (EVT-V2-001 through EVT-V2-009), and governance controls (CTRL-V2-001
through CTRL-V2-008) covering governed-transition integrity, audit and evidence, privacy,
bilingual service, accessibility, security, audit and reporting, and administrative
correction. These are product concepts, not technical designs.

## V2-09.8 Acceptance baseline

This section is normative.

The catalogue records TEST-level acceptance requirements (TEST-V2-001 through
TEST-V2-013) that express product acceptance for the principal capabilities: governed
submission, reviewer scope enforcement, activation, recognition-before-affiliation,
representative authority, completeness, return and resubmission, single active
affiliation, fee-reconciliation boundary, governed administrative correction, bilingual
notification, privacy minimization, and non-standard club handling. Acceptance is
defined at a product level and does not authorize implementation.

## V2-09.9 Requirement totals

This section is normative.

The catalogue records requirements by identifier class as follows: CAP 31; BR 13; FR 24;
NFR 12; UC 26; RULE 9; WF 5; UX 8; DATA 10; API 8; EVT 9; CTRL 8; TEST 13. Totals are
maintained in REG-203 and reported at Package 2 closure (V2-B).

## V2-09.10 Authorization posture

This section is normative.

This chapter and REG-203 define product requirements only. No requirement in the
catalogue authorizes implementation, procurement, migration, or a master development
plan.
