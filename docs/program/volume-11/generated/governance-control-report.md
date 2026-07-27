# Volume 11 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-27T22:42:27.773Z

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 11 corpus. It is not a source of truth, does not confer ratification, and
> does not assert implementation, operation, migration, backup, restore, recovery,
> training, provider engagement, incident handling, procurement, staffing,
> commitment, release, deployment, cutover, source retirement, or acceptance. The
> Markdown chapters, YAML registers, JSON schemas, and control scripts are the
> authoritative record. Volume 0 through Volume 10 remain frozen/released and are not
> modified by Volume 11 work. Volume 11 Package 1 defines OPERATIONS, MIGRATION,
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
| RATIFIED | 24 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-1100 | Volume 11 Corpus Index | RATIFIED | 1.0.0 | 24 |
| REG-1101 | Services, Capabilities, Owners, Operating States, Support Classes, and Providers | RATIFIED | 1.0.0 | 58 |
| REG-1102 | Operational Requirements, Procedures, Scenarios, Evidence, Acceptance, and Handoffs | RATIFIED | 1.0.0 | 37 |
| REG-1103 | Volume 11 Operational-Governance Decisions | RATIFIED | 1.0.0 | 9 |
| REG-1104 | Assumptions, Risks, Issues, Incidents, Migration Backlog, Adoption Backlog, and Assurance Gaps | RATIFIED | 1.0.0 | 11 |
| REG-1105 | Volume 11 Approvals | RATIFIED | 1.0.0 | 26 |

## Findings by control

### Structural, schema & operational-governance conformance

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Cross-reference & traceability integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Operational-governance-foundation coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO FOUNDATION_COVERAGE [REG-1101]: Foundation coverage: 2 services, 13 operating states, 3 migration stages, 2 providers, 1 handoffs, 11 backlog items

### Affiliation operating-model coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO AFFILIATION_COVERAGE [REG-1101]: Affiliation coverage: 4 services, 3 operating states, 1 migration runbooks, 1 provider requirements, 2 evidence requirements

### Provenance-integrity enforcement

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Gate V11-G1 readiness

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Gate V11-G2 readiness

Errors: 1 | Warnings: 0 | Info: 0

- ERROR GATE_V11_G2_CONDITION_UNMET [GATE-V11-G2]: Condition 35 not satisfied: Genuine authoring, closure/freeze, and pre-merge provenance-binding separation is preserved
