# Volume 12 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-28T00:36:42.728Z

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

- Total findings: 3
- Errors: 1
- Warnings: 0
- Info: 2
- Overall: FAIL (operational-governance integrity errors present)

## Chapter status

| Status | Count |
| --- | --- |
| RATIFIED | 12 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-1200 | Volume 12 Corpus Index | RATIFIED | 1.0.0 | 12 |
| REG-1201 | Volume 12 Gates, Criteria, Evidence Classes, Acceptance Classes, Authorities, and Release Decisions | RATIFIED | 1.0.0 | 45 |
| REG-1202 | Volume 12 Evidence Requirements, Evidence Objects, Findings, Conditions, Waivers, Commitments, and Dossiers | RATIFIED | 1.0.0 | 36 |
| REG-1203 | Volume 12 Decisions | RATIFIED | 1.0.0 | 4 |
| REG-1204 | Volume 12 Assumptions, Risks, Evidence Gaps, Material Commitments, Acceptance Backlog, and Release Blockers | RATIFIED | 1.0.0 | 6 |
| REG-1205 | Volume 12 Approvals | RATIFIED | 1.0.0 | 14 |

## Findings by control

### Structural, schema & governance conformance

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Cross-reference & traceability integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Gate, evidence & acceptance-foundation coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO FOUNDATION_COVERAGE [REG-1201]: Foundation coverage: 12 evidence classes, 12 gate criteria, 12 acceptance classes, 3 release decisions, 20 evidence requirements, 9 dossiers, 6 backlog items

### Provenance-integrity enforcement

Errors: 0 | Warnings: 0 | Info: 1

- INFO PROVENANCE_AMENDMENT_PENDING [REG-1205]: No REG-1205 approval yet carries a provenance_role_classification block; the post-merge provenance amendment (V12-B-1) is pending

### Gate V12-G1 readiness

Errors: 1 | Warnings: 0 | Info: 0

- ERROR GATE_V12_G1_CONDITION_UNMET [GATE-V12-G1]: Condition 35 not satisfied: Genuine authoring, closure/freeze, and pre-merge provenance-binding separation preserved
