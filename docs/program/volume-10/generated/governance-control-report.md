# Volume 10 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-27T20:03:25.152Z

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 10 corpus. It is not a source of truth, does not confer ratification, and
> does not assert implementation, executable test, test execution, provisioning,
> qualification, procurement, provider engagement, staffing, commitment, release,
> deployment, or acceptance. The Markdown chapters, YAML registers, JSON schemas,
> and control scripts are the authoritative record. Volume 0 through Volume 9 remain
> frozen/released and are not modified by Volume 10 work. Volume 10 Package 1 defines
> DELIVERY-PLANNING GOVERNANCE OBLIGATIONS only and authorizes no implementation,
> provisioning, procurement, test execution, release, or deployment.

## Summary

- Total findings: 3
- Errors: 1
- Warnings: 0
- Info: 2
- Overall: FAIL (delivery-planning-governance integrity errors present)

## Chapter status

| Status | Count |
| --- | --- |
| RATIFIED | 24 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-1000 | Volume 10 Corpus Index | RATIFIED | 1.1.0 | 22 |
| REG-1001 | Delivery Outcomes, Capabilities, Workstreams, Work Packages, Deliverables, and Dependencies | RATIFIED | 1.1.0 | 67 |
| REG-1002 | Milestones, Environments, Release Units, Evidence Requirements, Readiness Conditions, and Acceptance Criteria | RATIFIED | 1.1.0 | 38 |
| REG-1003 | Volume 10 Delivery-Planning Decisions | RATIFIED | 1.1.0 | 15 |
| REG-1004 | Assumptions, Risks, Issues, Changes, Commitments, Estimates, Funding, and Procurement Backlog | RATIFIED | 1.1.0 | 16 |
| REG-1005 | Volume 10 Delivery-Planning Approvals and Provenance | RATIFIED | 1.1.0 | 27 |

## Findings by control

### Structural, schema & delivery-planning-governance conformance

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Cross-reference & traceability integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Delivery-planning-foundation coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO FOUNDATION_COVERAGE [REG-1001]: Foundation coverage: 3 work packages, 2 dependencies, 1 environments, 1 release units, 16 backlog items

### Affiliation implementation-plan foundation coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO AFFILIATION_PLAN_COVERAGE [REG-1001]: Affiliation implementation plan coverage: 6 work packages, 4 technical slices, 3 experience slices, 3 migration slices, 3 integration slices, 10 release candidates, 14 House P0 destinations

### Provenance-integrity enforcement

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Gate V10-G1 readiness

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Gate V10-G2 readiness

Errors: 1 | Warnings: 0 | Info: 0

- ERROR GATE_V10_G2_CONDITION_UNMET [GATE-V10-G2]: Condition 35 not satisfied: Genuine authoring, closure/freeze, and pre-merge provenance-binding separation is preserved
