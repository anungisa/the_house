# Volume 1 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-25T22:53:25.310Z

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 1 corpus. It is not a source of truth, does not confer ratification, and
> does not assert independent assurance. The Markdown chapters, YAML registers,
> JSON schemas, and control scripts are the authoritative record. Volume 0 remains
> frozen and is not modified by Volume 1 assessment work.

## Summary

- Total findings: 0
- Errors: 0
- Warnings: 0
- Info: 0
- Overall: PASS (no integrity errors)

## Qualification vocabularies (schema-enforced)

- Disposition: ADOPT, ADAPT, CONSOLIDATE, RETAIN, REBUILD, DEFER, EXTERNALIZE, RETIRE
- Evidence rating: E0 (unsubstantiated), E1 (indicative), E2 (corroborated), E3 (demonstrated), E4 (proven)
- Source classification: policy_truth, operational_truth, implementation_truth, vendor_claim, observed_evidence, stakeholder_statement, assumption, unresolved_contradiction

## Chapter status

| Status | Count |
| --- | --- |
| RATIFIED | 33 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-100 | Volume 1 Corpus Index | IN_REVIEW | 0.10.0 | 33 |
| REG-101 | Source Inventory | IN_REVIEW | 0.6.0 | 23 |
| REG-102 | Evidence Register | IN_REVIEW | 0.6.0 | 53 |
| REG-103 | Capability Inventory | IN_REVIEW | 0.6.0 | 48 |
| REG-104 | Finding Register | IN_REVIEW | 0.6.0 | 53 |
| REG-105 | Contradiction Register | IN_REVIEW | 0.6.0 | 14 |
| REG-106 | Qualification Decision Register | IN_REVIEW | 0.6.0 | 65 |
| REG-107 | Volume 1 Governance Decision Register | IN_REVIEW | 0.10.0 | 29 |
| REG-108 | Volume 1 Approval Register | IN_REVIEW | 0.11.0 | 43 |

## Findings by control

### Structural & schema conformance

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Cross-reference integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Ratification integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Freeze & amendment integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

## Recorded conditions (from REG-108 approvals)

- APP-V1-001 (V1-00): Volume 0 freeze preserved; Volume 1 inherits Volume 0 controls unchanged
- APP-V1-001 (V1-00): Executive organizational acceptance (Nolan, D0) pending
- APP-V1-002 (V1-01): Independent validation not claimed
- APP-V1-003 (V1-02): Source classifications and evidence-quality scale are normative for Volume 1
- APP-V1-004 (V1-03): Disposition vocabulary is closed; new dispositions require amendment
- APP-V1-005 (V1-04): A recent timestamp must not automatically raise evidence quality
- APP-V1-006 (GATE-V1-G1): Internal-progression gate authorized by the Accountable Program Authority
- APP-V1-006 (GATE-V1-G1): No implementation authorized by Volume 1 findings alone
- APP-V1-006 (GATE-V1-G1): Executive organizational acceptance (Nolan, D0) pending before material commitment
- APP-V1-006 (GATE-V1-G1): Independent assurance reserved for independence-requiring claims
- APP-V1-007 (PACKAGE-1): Package 1 reviewed and closed separately from authoring
- APP-V1-007 (PACKAGE-1): Volume 0 freeze preserved; no Volume 0 artifact modified
- APP-V1-007 (PACKAGE-1): Executive organizational acceptance (Nolan, D0) pending
- APP-V1-008 (V1-05): Source fingerprint fixes the assessed artifact; a new export is a new source
- APP-V1-008 (V1-05): Inventory counts are reproducible via npm run qualification:base44
- APP-V1-009 (V1-06): Product intelligence is E2 at best and not stakeholder-validated
- APP-V1-010 (V1-07): No Base44 capability is dispositioned ADOPT or RETAIN
- APP-V1-010 (V1-07): No disposition authorizes construction (REG-106 authorizes_implementation false)
- APP-V1-011 (V1-08): Product value, production risk, and unknowns are recorded separately
- APP-V1-011 (V1-08): The authority conflict is resolved by policy, not by preferring a newer artifact
- APP-V1-012 (V1-09): Translation of intent only; no design or build authorization
- APP-V1-013 (GATE-V1-G2): Re-authorized on the corrected (7) baseline per DEC-V1-014, superseding the interim HOLD (DEC-V1-012)
- APP-V1-013 (GATE-V1-G2): Base44 qualification complete against the current declared export (7); the machine-readable evidence chain (REG-102, REG-105, REG-106) is reconciled to (7)
- APP-V1-013 (GATE-V1-G2): All eleven corrected gate conditions in V1-B.3 are satisfied and every finding is revalidated against (7)
- APP-V1-013 (GATE-V1-G2): Internal qualification gate owned by the Accountable Program Authority; executive acceptance (Nolan, D0) is a distinct later material-commitment gate and is not a precondition of Gate V1-G2
- APP-V1-013 (GATE-V1-G2): No implementation and no master development plan authorized by Package 2 (REG-106 all authorizes_implementation false)
- APP-V1-014 (PACKAGE-2): Package 2 reviewed and closed separately from authoring
- APP-V1-014 (PACKAGE-2): Volume 0 and Package 1 freezes preserved; no frozen artifact modified
- APP-V1-014 (PACKAGE-2): No implementation and no master development plan authorized by Package 2
- APP-V1-014 (PACKAGE-2): Re-frozen at v1.1.0 on the corrected (7) baseline per DEC-V1-013; Gate V1-G2 disposed PASS on the corrected baseline (DEC-V1-014)
- APP-V1-014 (PACKAGE-2): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-015 (PACKAGE-3): Authorized to begin following Gate V1-G2 PASS on the corrected (7) baseline (DEC-V1-014, DEC-V1-015)
- APP-V1-015 (PACKAGE-3): Package 3 is a current-state assessment of The House (SRC-002), not a material-commitment or construction step
- APP-V1-015 (PACKAGE-3): Executive organizational acceptance (Nolan, D0) reserved for a later material-commitment gate; not required to begin Package 3
- APP-V1-015 (PACKAGE-3): No implementation and no master development plan authorized by this approval
- APP-V1-016 (V1-10): House source baseline and implementation inventory ratified on the fingerprinted baseline (SRC-002)
- APP-V1-016 (V1-10): Structural implementation truth is E3; production readiness is not claimed
- APP-V1-017 (V1-11): Domain, data, API, and integration architecture qualified from source and migrations
- APP-V1-017 (V1-11): Cross-schema FK omission recorded as an intentional trade-off (CON-011)
- APP-V1-018 (V1-12): Kernel, authorization, workflow, and evidence qualified on the eight-rung assurance ladder
- APP-V1-018 (V1-12): No control reaches integration-test proof (rung 7); role-only authorization confirmed (FND-023)
- APP-V1-019 (V1-13): Skipped and infrastructure-dependent tests disclosed, not counted as passing (FND-028)
- APP-V1-019 (V1-13): Production-readiness determination NOT ESTABLISHED; no deployed environment (FND-029)
- APP-V1-020 (V1-14): Retain/adapt/rebuild dispositions and the eight release-blocking affiliation gaps recorded
- APP-V1-020 (V1-14): Release-wave hypothesis is unproven and unauthorized; House/Base44 convergence reserved for Package 5
- APP-V1-021 (V1-C): Package 3 closure record ratified; Gate V1-G3 disposed PASS (DEC-V1-017)
- APP-V1-021 (V1-C): Authored and committed separately from Package 3 authoring work
- APP-V1-021 (V1-C): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-022 (GATE-V1-G3): Internal-progression gate authorized by the Accountable Program Authority (DEC-V1-017)
- APP-V1-022 (GATE-V1-G3): All twelve Gate V1-G3 conditions met (V1-C.4)
- APP-V1-022 (GATE-V1-G3): No implementation authorized; every qualification decision carries authorizes_implementation false
- APP-V1-022 (GATE-V1-G3): Executive organizational acceptance (Nolan, D0) pending before material commitment
- APP-V1-023 (PACKAGE-3): Package 3 reviewed and closed separately from authoring
- APP-V1-023 (PACKAGE-3): Volume 0, Package 1, and Package 2 freezes preserved; no frozen artifact modified
- APP-V1-023 (PACKAGE-3): No implementation and no master development plan authorized by Package 3
- APP-V1-023 (PACKAGE-3): Gate V1-G3 disposed PASS (DEC-V1-017); Package 4 planning authorized to begin (DEC-V1-019)
- APP-V1-023 (PACKAGE-3): Closure record V1-C amended to v1.1.0 (closure-evidence addendum) via DEC-V1-020; Gate V1-G3 disposition unchanged
- APP-V1-023 (PACKAGE-3): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-024 (V1-C): Re-ratifies the Package 3 closure record V1-C at v1.1.0 following the controlled closure-evidence amendment (DEC-V1-020)
- APP-V1-024 (V1-C): Adds the fourteen-item P0 disposition matrix (V1-C.7), the approved-execution vs organization-activation separation (V1-C.8), and unit-test execution evidence (V1-C.9)
- APP-V1-024 (V1-C): No reopening of the Package 3 assessment; Gate V1-G3 remains PASS and no implementation is authorized
- APP-V1-024 (V1-C): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-025 (V1-15): Current operating model and authority tiers; formal policy distinguished from actual practice
- APP-V1-025 (V1-15): National/provincial authority tiers grounded in ratified Volume 0; individual role multiplicity pending validation
- APP-V1-025 (V1-15): Stakeholder statements are not represented as approvals; independent validation not claimed
- APP-V1-026 (V1-16): Current affiliation process traced end to end (12 steps); STAKEHOLDER_STATEMENT pending validation
- APP-V1-026 (V1-16): Historical/goodwill affiliation baseline recorded as a target continuity constraint
- APP-V1-026 (V1-16): Current practice not treated as automatically desirable
- APP-V1-027 (V1-17): External-system authority classifications for SYS-001..008 grounded in ratified Volume 0 (REG-005/V0-06)
- APP-V1-027 (V1-17): SYS-009..012 flagged unvalidated (ASSUMPTION/STAKEHOLDER_STATEMENT)
- APP-V1-027 (V1-17): No system automatically retained or retired; dispositions deferred to convergence
- APP-V1-028 (V1-18): Data flows, authority, and reconciliation boundaries mapped
- APP-V1-028 (V1-18): High-privacy elements flagged for Canadian privacy obligations
- APP-V1-028 (V1-18): Master-data authority contradiction (CON-012) registered, not silently resolved
- APP-V1-029 (V1-19): Contractual/transition/sustainability constraints captured or explicitly unresolved
- APP-V1-029 (V1-19): Commercial terms are CONTRACTUAL_TRUTH/VENDOR_CLAIM pending vendor and financial (Helene) validation
- APP-V1-029 (V1-19): No commercial figure asserted as confirmed
- APP-V1-030 (V1-20): Current-state findings converted to target constraints; each linked to registered evidence
- APP-V1-030 (V1-20): Convergence reserved for Package 5; this chapter constrains it, does not perform it
- APP-V1-030 (V1-20): No vendor/system retained or retired; no implementation authorized
- APP-V1-031 (GATE-V1-G4): Internal-progression gate authorized by the Accountable Program Authority (DEC-V1-022)
- APP-V1-031 (GATE-V1-G4): Current affiliation operations documented end to end; systems and manual tools inventoried
- APP-V1-031 (GATE-V1-G4): Authority classifications, data flows, and reconciliations recorded; policy vs operational truth distinguished
- APP-V1-031 (GATE-V1-G4): Contractual/transition constraints captured or explicitly unresolved; material contradictions registered
- APP-V1-031 (GATE-V1-G4): No vendor/system automatically retained or retired; no implementation authorized
- APP-V1-031 (GATE-V1-G4): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-031 (GATE-V1-G4): Independent assurance reserved for independence-requiring claims
- APP-V1-032 (V1-D): Package 4 closure record ratified; Gate V1-G4 disposed PASS (DEC-V1-022)
- APP-V1-032 (V1-D): Authored and committed separately from Package 4 authoring work
- APP-V1-032 (V1-D): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-033 (PACKAGE-4): Package 4 reviewed and closed separately from authoring
- APP-V1-033 (PACKAGE-4): Volume 0 and Packages 1, 2, and 3 freezes preserved; no frozen artifact modified
- APP-V1-033 (PACKAGE-4): No implementation and no master development plan authorized by Package 4
- APP-V1-033 (PACKAGE-4): No vendor or system automatically retained or retired; target dispositions deferred to Package 5
- APP-V1-033 (PACKAGE-4): Gate V1-G4 disposed PASS (DEC-V1-022); Package 5 convergence authorized to begin as planning only (DEC-V1-024)
- APP-V1-033 (PACKAGE-4): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-034 (V1-21): Convergence methodology and evidence-precedence rules adopted (DEC-V1-025)
- APP-V1-034 (V1-21): Claim type determines controlling evidence; newer/implemented/polished is not automatically authoritative
- APP-V1-034 (V1-21): Deterministic tooling structures decisions already recorded; it invents no target decision
- APP-V1-035 (V1-22): Every material capability mapped across Base44, The House, and the ecosystem (CAP-037..048)
- APP-V1-035 (V1-22): Each capability dispositioned independently at four layers (QD-037..065)
- APP-V1-035 (V1-22): No finding or convergence decision authorizes implementation
- APP-V1-036 (V1-23): Target system and data authority defined or explicitly unresolved per governed domain
- APP-V1-036 (V1-23): Current manual controls preserved, adapted, automated, or retired with rationale
- APP-V1-036 (V1-23): Master-data (CON-012), evidence-binding (CON-013), and registration-transition (CON-014) contradictions retained open
- APP-V1-037 (V1-24): Affiliation target operating model complete (15-step flow, 3 governed transition pathways)
- APP-V1-037 (V1-24): Historical/goodwill transition pathway represented (continuity confirmation)
- APP-V1-037 (V1-24): First-release affiliation boundary and exclusions explicit; no implementation authorized
- APP-V1-038 (V1-25): Material commercial/contractual/stakeholder unknowns have owners and future blocking gates (TC-001..015)
- APP-V1-038 (V1-25): Transition-constraint set constrains a later plan; it is NOT the master development plan
- APP-V1-038 (V1-25): Stakeholder validation backlog recorded; pending consultation blocks only the affected claim
- APP-V1-039 (V1-26): Volume 1 conclusion and downstream readiness recorded
- APP-V1-039 (V1-26): Volume 2 authorization status stated; master development plan remains pending; implementation remains unauthorized
- APP-V1-039 (V1-26): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-040 (GATE-V1-G5): Internal-progression gate authorized by the Accountable Program Authority (DEC-V1-027)
- APP-V1-040 (GATE-V1-G5): Package 2-4 baselines and amendments inherited correctly; unit-test discrepancy reconciled (DEC-V1-026)
- APP-V1-040 (GATE-V1-G5): Every material capability mapped across the three streams with layer-specific target dispositions
- APP-V1-040 (GATE-V1-G5): Target data and system authority defined or explicitly unresolved; manual controls dispositioned with rationale
- APP-V1-040 (GATE-V1-G5): Affiliation target operating model complete; historical/goodwill pathway represented; first-release boundary and exclusions explicit
- APP-V1-040 (GATE-V1-G5): Material commercial/contractual/stakeholder unknowns have owners and future blocking gates
- APP-V1-040 (GATE-V1-G5): No finding or convergence decision authorizes implementation; Volume 1 receives a complete line-level review and freeze
- APP-V1-040 (GATE-V1-G5): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-041 (V1-E): Volume 1 completion and Package 5 freeze record ratified; Gate V1-G5 disposed PASS (DEC-V1-027)
- APP-V1-041 (V1-E): All twelve Gate V1-G5 conditions disposed in V1-E.9
- APP-V1-041 (V1-E): Authored and committed separately from Package 5 authoring work
- APP-V1-041 (V1-E): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-042 (PACKAGE-5): Package 5 and Volume 1 reviewed line by line and closed separately from authoring (DEC-V1-028)
- APP-V1-042 (PACKAGE-5): Volume 0 and Packages 1, 2, 3, and 4 freezes preserved; no frozen artifact modified
- APP-V1-042 (PACKAGE-5): No implementation, procurement, or master development plan authorized by Package 5
- APP-V1-042 (PACKAGE-5): No source retained or retired merely for being newer or more polished; material contradictions retained open
- APP-V1-042 (PACKAGE-5): Gate V1-G5 disposed PASS (DEC-V1-027); Volume 2 authorized to begin as planning only (DEC-V1-029)
- APP-V1-042 (PACKAGE-5): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V1-044 (V1-F): Executive convergence brief ratified as a summary of ratified Volume 1 findings
- APP-V1-044 (V1-F): Introduces no new target decision and no new source of authority
- APP-V1-044 (V1-F): Consistent with V1-E: Gate V1-G5 PASS; Volume 2 authorized for product/service definition; master development plan pending; implementation and procurement unauthorized
- APP-V1-044 (V1-F): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
