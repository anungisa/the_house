# Volume 12 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-28T03:25:56.597Z

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 12 corpus. It is not a source of truth, does not confer ratification, and
> does not assert implementation, operation, migration, backup, restore, recovery,
> training, provider engagement, incident handling, procurement, staffing,
> commitment, release, deployment, cutover, source retirement, or acceptance. The
> Markdown chapters, YAML registers, JSON schemas, and control scripts are the
> authoritative record. Volume 0 through Volume 11 remain frozen/released and are not
> modified by Volume 12 work. Volume 12 Package 1 defines OPERATIONS, MIGRATION,
> ADOPTION, AND ASSURANCE GOVERNANCE OBLIGATIONS only and authorizes no
> implementation or operations.

## Summary

- Total findings: 4
- Errors: 1
- Warnings: 0
- Info: 3
- Overall: FAIL (operational-governance integrity errors present)

## Chapter status

| Status | Count |
| --- | --- |
| RATIFIED | 40 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-1200 | Volume 12 Corpus Index | RATIFIED | 1.0.0 | 40 |
| REG-1201 | Volume 12 Gates, Criteria, Evidence Classes, Acceptance Classes, Authorities, and Release Decisions | RATIFIED | 1.0.0 | 89 |
| REG-1202 | Volume 12 Evidence Requirements, Evidence Objects, Findings, Conditions, Waivers, Commitments, and Dossiers | RATIFIED | 1.0.0 | 84 |
| REG-1203 | Volume 12 Decisions | RATIFIED | 1.0.0 | 25 |
| REG-1204 | Volume 12 Assumptions, Risks, Evidence Gaps, Material Commitments, Acceptance Backlog, and Release Blockers | RATIFIED | 1.0.0 | 18 |
| REG-1205 | Volume 12 Approvals | RATIFIED | 1.0.0 | 48 |

## Findings by control

### Structural, schema & governance conformance

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Cross-reference & traceability integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Gate, evidence & acceptance-foundation coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO FOUNDATION_COVERAGE [REG-1201]: Foundation coverage: 12 evidence classes, 12 gate criteria, 12 acceptance classes, 3 release decisions, 20 evidence requirements, 9 dossiers, 18 backlog items

### Provenance-integrity enforcement

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Gate V12-G1 readiness

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Affiliation evidence & acceptance-dossier coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO AFFILIATION_COVERAGE [REG-1201/REG-1202]: Affiliation evidence coverage: 12 evidence domains, 8 gate criteria, 11 acceptance classes, 1 executive release decisions, 23 evidence requirements, 12 acceptance dossiers

### Gate V12-G2 readiness

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Integrated final-evidence & corpus-closure coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO FINAL_CLOSURE_COVERAGE [REG-1201/REG-1202]: Package 3 consolidation: 12 model records across 12 kinds, 13 requirements across 13 kinds

### Gate V12-G3 readiness

Errors: 1 | Warnings: 0 | Info: 0

- ERROR GATE_V12_G3_CONDITION_UNMET [GATE-V12-G3]: Condition 45 not satisfied: Genuine closure, gate, package, whole-volume, and whole-corpus freeze separation is preserved
