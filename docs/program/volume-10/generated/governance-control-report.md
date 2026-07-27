# Volume 10 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-27T19:11:18.819Z

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

- Total findings: 4
- Errors: 2
- Warnings: 0
- Info: 2
- Overall: FAIL (delivery-planning-governance integrity errors present)

## Chapter status

| Status | Count |
| --- | --- |
| RATIFIED | 11 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-1000 | Volume 10 Corpus Index | RATIFIED | 1.0.0 | 12 |
| REG-1001 | Delivery Outcomes, Capabilities, Workstreams, Work Packages, Deliverables, and Dependencies | RATIFIED | 1.0.0 | 12 |
| REG-1002 | Milestones, Environments, Release Units, Evidence Requirements, Readiness Conditions, and Acceptance Criteria | RATIFIED | 1.0.0 | 6 |
| REG-1003 | Volume 10 Delivery-Planning Decisions | RATIFIED | 1.0.0 | 3 |
| REG-1004 | Assumptions, Risks, Issues, Changes, Commitments, Estimates, Funding, and Procurement Backlog | RATIFIED | 1.0.0 | 8 |
| REG-1005 | Volume 10 Delivery-Planning Approvals and Provenance | RATIFIED | 1.0.0 | 11 |

## Findings by control

### Structural, schema & delivery-planning-governance conformance

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Cross-reference & traceability integrity

Errors: 1 | Warnings: 0 | Info: 0

- ERROR INDEX_ROW_WITHOUT_CHAPTER [REG-1000]: REG-1000 indexes V10-A but no matching chapter file is present

### Delivery-planning-foundation coverage

Errors: 0 | Warnings: 0 | Info: 1

- INFO FOUNDATION_COVERAGE [REG-1001]: Foundation coverage: 3 work packages, 2 dependencies, 1 environments, 1 release units, 8 backlog items

### Provenance-integrity enforcement

Errors: 0 | Warnings: 0 | Info: 1

- INFO PROVENANCE_AMENDMENT_PENDING [REG-1005]: No REG-1005 approval yet carries a provenance_role_classification block; the post-merge provenance amendment (V10-B-1) is pending

### Gate V10-G1 readiness

Errors: 1 | Warnings: 0 | Info: 0

- ERROR GATE_V10_G1_CONDITION_UNMET [GATE-V10-G1]: Condition 32 not satisfied: Genuine authoring, closure-freeze, and pre-merge provenance-binding separation preserved
