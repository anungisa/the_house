# V0-02 - Problem and Opportunity

Document ID: V0-02
Status: RATIFIED
Version: 1.0.0
Ratification: Package 1 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V0-E, REG-006 APP-005)
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: G0

This chapter is normative except where a subsection is marked explanatory.

## Purpose

Define the national service and governance problem without predetermining a
technical solution. Program legitimacy derives from these problems, not from the
existence of any repository or platform.

## Evidence classification convention

This subsection is normative.

Every problem statement in this chapter MUST classify its supporting basis as one
or more of the following, consistent with the source hierarchy in V0-10 and
REG-005:

- OPERATIONAL_FACT: established by current Curling Canada operations;
- BASE44_FINDING: demonstrated in the Base44 reference corpus;
- HOUSE_FINDING: demonstrated in The House target-platform implementation;
- STAKEHOLDER_OBSERVATION: reported by a stakeholder, not yet validated;
- ASSUMPTION: not yet evidenced and requiring discovery.

Where current evidence is not yet gathered, the problem MUST be marked
`evidence: ASSUMPTION` rather than asserted as fact. This chapter MUST NOT
fabricate operational baselines.

## Problem record structure

This subsection is normative.

Each problem MUST be expressed with:

- affected stakeholders;
- current process;
- current systems;
- operational consequence;
- strategic consequence;
- available evidence (using the classification above);
- unresolved questions.

## Current-state narrative (explanatory)

Curling in Canada operates through a federated structure of clubs, PTSOs, and
Curling Canada. Affiliation, membership, and registration information is currently
handled through a combination of established operational practice and
vendor-specific or exploratory tooling. The specific current-state facts below are
marked with their evidence basis; items marked ASSUMPTION require discovery before
they may be treated as established.

## Problems

### PRB-001 Fragmented club affiliation processes

- affected stakeholders: clubs, PTSOs, Curling Canada operations
- current process: affiliation handled through varied, jurisdiction-specific steps
- current systems: mixed vendor and manual workflows (specifics: ASSUMPTION)
- operational consequence: inconsistent handling and duplicated effort
- strategic consequence: weak national consistency and comparability
- available evidence: STAKEHOLDER_OBSERVATION; ASSUMPTION
- unresolved questions: what are the exact current per-jurisdiction steps?

### PRB-002 Inconsistent organizational and participant records

- affected stakeholders: Curling Canada, PTSOs, clubs
- current process: records maintained across multiple sources
- current systems: multiple stores without a single authoritative spine
- operational consequence: reconciliation burden and conflicting records
- strategic consequence: unreliable national reporting
- available evidence: STAKEHOLDER_OBSERVATION; ASSUMPTION
- unresolved questions: where do authoritative records currently live?

### PRB-003 Duplicated data entry and reconciliation burden

- affected stakeholders: club administrators, PTSO staff, national staff
- current process: repeated entry of the same information
- current systems: non-integrated tools
- operational consequence: wasted staff time and error risk
- strategic consequence: higher operating cost and lower trust
- available evidence: STAKEHOLDER_OBSERVATION; ASSUMPTION
- unresolved questions: what is the measured duplication rate today?

### PRB-004 Fragmented authority and unclear system ownership

- affected stakeholders: Curling Canada, PTSOs, providers
- current process: authority boundaries implied rather than documented
- current systems: unclear which system is authoritative for which decision
- operational consequence: conflicting decisions and unclear escalation
- strategic consequence: governance risk at national scale
- available evidence: STAKEHOLDER_OBSERVATION; ASSUMPTION
- unresolved questions: which authority currently governs which data domain?

### PRB-005 Data-continuity risk across seasons, clubs, and providers

- affected stakeholders: participants, clubs, PTSOs
- current process: continuity depends on manual carry-over
- current systems: provider-bound records
- operational consequence: lost history and broken participant continuity
- strategic consequence: weakened long-term participant relationships
- available evidence: STAKEHOLDER_OBSERVATION; ASSUMPTION
- unresolved questions: what continuity guarantees exist today?

### PRB-006 Platform-dependency and vendor lock-in

- affected stakeholders: Curling Canada, PTSOs
- current process: workflows shaped by vendor-specific behavior
- current systems: vendor-controlled workflow logic
- operational consequence: limited ability to change providers safely
- strategic consequence: reduced institutional control and higher switching cost
- available evidence: BASE44_FINDING (reference exploration); ASSUMPTION
- unresolved questions: which dependencies are contractual vs technical?

### PRB-007 Weak traceability between policy, decision, data, and outcome

- affected stakeholders: compliance, national operations, auditors
- current process: decisions not consistently linked to evidence
- current systems: limited audit and evidence lineage
- operational consequence: difficult reconstruction of why a decision was made
- strategic consequence: audit and compliance exposure
- available evidence: STAKEHOLDER_OBSERVATION; ASSUMPTION
- unresolved questions: what audit lineage exists in current systems?

### PRB-008 Inconsistent bilingual and accessible experience

- affected stakeholders: French-language users, users with disabilities
- current process: varied language and accessibility support
- current systems: inconsistent WCAG and official-language parity
- operational consequence: unequal service quality
- strategic consequence: official-language and accessibility obligations at risk
- available evidence: ASSUMPTION
- unresolved questions: what is the current WCAG and parity baseline?

## Consequences of maintaining the current state

This subsection is normative.

If the current state is maintained without intervention, the program record MUST
recognize the following consequences (each subject to evidence validation):

- persistent duplicated effort and reconciliation cost;
- continued governance ambiguity and conflicting records;
- ongoing vendor dependency and switching risk;
- unmet traceability, bilingual, and accessibility obligations.

## Opportunity statement

The program SHOULD create:

- one trusted organizational spine;
- a clear affiliation and membership authority model;
- modern, governed club self-service;
- federated PTSO and Curling Canada workflow operation;
- reusable national infrastructure and controls;
- governed interoperability with external systems.

Multi-sport reuse is addressed as a bounded design constraint in V0-03 and V0-05,
not as a first-release business objective.

## Constraint

Normative statement:

Program legitimacy MUST derive from business and service needs, not from the
existence of any single repository or technology choice.

The House is the intended governed production foundation and is treated as
target-platform current implementation truth (a production-candidate baseline),
not as established production truth. This distinction MUST be preserved in V0-06
and REG-005.
