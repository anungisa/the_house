# Volume 1 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-25T20:36:05.452Z

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
| RATIFIED | 18 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-100 | Volume 1 Corpus Index | IN_REVIEW | 0.4.0 | 18 |
| REG-101 | Source Inventory | IN_REVIEW | 0.4.0 | 15 |
| REG-102 | Evidence Register | IN_REVIEW | 0.4.0 | 34 |
| REG-103 | Capability Inventory | IN_REVIEW | 0.4.0 | 30 |
| REG-104 | Finding Register | IN_REVIEW | 0.4.0 | 33 |
| REG-105 | Contradiction Register | IN_REVIEW | 0.4.0 | 11 |
| REG-106 | Qualification Decision Register | IN_REVIEW | 0.4.0 | 30 |
| REG-107 | Volume 1 Governance Decision Register | IN_REVIEW | 0.5.0 | 19 |
| REG-108 | Volume 1 Approval Register | IN_REVIEW | 0.5.0 | 23 |

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
- APP-V1-023 (PACKAGE-3): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
