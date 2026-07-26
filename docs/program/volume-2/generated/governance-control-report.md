# Volume 2 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-26T01:27:02.075Z

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 2 corpus. It is not a source of truth, does not confer ratification, and
> does not assert independent assurance. The Markdown chapters, YAML registers,
> JSON schemas, and control scripts are the authoritative record. Volume 0 and
> Volume 1 remain frozen and are not modified by Volume 2 work.

## Summary

- Total findings: 0
- Errors: 0
- Warnings: 0
- Info: 0
- Overall: PASS (no integrity errors)

## Product-definition vocabularies (schema-enforced)

- Requirement chain: OUT -> CAP -> BR -> FR -> NFR -> UC -> RULE -> WF -> UX -> DATA -> API -> EVT -> CTRL -> TEST
- Product boundary: House, Button, Both, Neither
- Stakeholder type: institutional, member_organization, club, participant, official, administrator, executive, external_system, public
- Validation status: author_asserted, stakeholder_validation_pending, stakeholder_validated

## Chapter status

| Status | Count |
| --- | --- |
| RATIFIED | 14 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-200 | Volume 2 Corpus Index | IN_REVIEW | 1.3.0 | 14 |
| REG-201 | Volume 2 Outcome Register | IN_REVIEW | 1.1.0 | 12 |
| REG-202 | Volume 2 Stakeholder and Persona Register | IN_REVIEW | 1.1.0 | 12 |
| REG-203 | Volume 2 Requirement and Acceptance Register | IN_REVIEW | 1.1.0 | 176 |
| REG-204 | Volume 2 Governance Decision Register | IN_REVIEW | 1.3.0 | 10 |
| REG-205 | Volume 2 Approval Register | IN_REVIEW | 1.3.0 | 18 |

## Findings by control

### Structural & schema conformance

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Cross-reference & traceability integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

## Recorded conditions (from REG-205 approvals)

- APP-V2-001 (V2-00): Volume control and inheritance from corrected Volume 1 v1.0.1 baseline recorded
- APP-V2-002 (V2-01): Product and service definition scoped to affiliation; no implementation authorized
- APP-V2-003 (V2-02): Stakeholder, persona and outcome model recorded; unresolved stakeholder validations flagged
- APP-V2-004 (V2-03): House owns governed lifecycle; Button is guided experience with no independent governed-state ownership
- APP-V2-005 (V2-04): Affiliation service blueprint defined end to end across House and Button
- APP-V2-006 (V2-05): Requirement chain OUT->CAP->BR->FR->NFR->UC->RULE->WF->UX->DATA->API->EVT->CTRL->TEST adopted with acceptance traceability
- APP-V2-006 (V2-05): No requirement authorizes implementation
- APP-V2-007 (V2-A): Package 1 closure record ratified
- APP-V2-008 (GATE-V2-G1): Condition 1: Corrected Volume 1 provenance (v1.0.1) inherited as the Package 1 baseline
- APP-V2-008 (GATE-V2-G1): Condition 2: Product and service boundaries for the affiliation service are defined
- APP-V2-008 (GATE-V2-G1): Condition 3: The House and The Button product boundary is separated; House owns governed lifecycle
- APP-V2-008 (GATE-V2-G1): Condition 4: Stakeholders and personas are normalized into a single model
- APP-V2-008 (GATE-V2-G1): Condition 5: Stakeholder outcomes are recorded and linked to product boundary
- APP-V2-008 (GATE-V2-G1): Condition 6: The affiliation service blueprint is defined end to end
- APP-V2-008 (GATE-V2-G1): Condition 7: Requirements and acceptance are traceable along the OUT->...->TEST chain
- APP-V2-008 (GATE-V2-G1): Condition 8: Unresolved stakeholder validations are recorded, not fabricated
- APP-V2-008 (GATE-V2-G1): Condition 9: No runtime implementation, migrations, APIs, or master development plan are authorized
- APP-V2-008 (GATE-V2-G1): Condition 10: Package 1 has had line-level review and is frozen at version 1.0.0
- APP-V2-009 (PACKAGE-2-1): Freeze source snapshot commit: 71c2be6 (contains the full Package 1 corpus)
- APP-V2-009 (PACKAGE-2-1): Freeze closure/freeze commit: 71c2be6 (coincides with the source snapshot; single-commit authoring)
- APP-V2-009 (PACKAGE-2-1): Package 1 merged commit: 8ee3a74
- APP-V2-009 (PACKAGE-2-1): Gate V2-G1 PASS; Volume 2 Package 1 closed and frozen; V2-00..V2-05 at 1.0.0 and V2-A at 1.0.1 (provenance amendment)
- APP-V2-009 (PACKAGE-2-1): Product definition only; implementation and procurement unauthorized; not a master development plan
- APP-V2-009 (PACKAGE-2-1): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
- APP-V2-010 (V2-06): Affiliation service scope, product offer, and exclusions defined; no implementation authorized
- APP-V2-011 (V2-07): Three governed pathways (continuity, renewal with remediation, new) defined; eligibility rules remain subject to policy validation
- APP-V2-012 (V2-08): Twenty-six controlled use cases with alternate and exception flows defined; not reduced to happy-path stories
- APP-V2-013 (V2-09): Capability and requirement catalogue expanded across the OUT->...->TEST chain; no requirement authorizes implementation
- APP-V2-014 (V2-10): Experience, communication, and support model defined at product level; no templates or UI layouts fixed
- APP-V2-015 (V2-11): Product measures classified as defined or explicitly pending validation; no numerical targets fabricated
- APP-V2-016 (V2-B): Package 2 closure record ratified
- APP-V2-016 (V2-B): Package 1 freeze-provenance check result recorded (source 71c2be6; closure/freeze 71c2be6; merged 8ee3a74)
- APP-V2-017 (GATE-V2-G2): Condition 1: Package 1 freeze provenance is unambiguous (source 71c2be6; closure/freeze 71c2be6; merged 8ee3a74)
- APP-V2-017 (GATE-V2-G2): Condition 2: Affiliation product scope and exclusions are explicit
- APP-V2-017 (GATE-V2-G2): Condition 3: Continuity, renewal-with-remediation, and new-affiliation pathways are defined
- APP-V2-017 (GATE-V2-G2): Condition 4: Principal user, reviewer, administrative, financial, and support journeys are covered
- APP-V2-017 (GATE-V2-G2): Condition 5: Material alternate and exception scenarios are defined
- APP-V2-017 (GATE-V2-G2): Condition 6: Affiliation capabilities have controlled product requirements
- APP-V2-017 (GATE-V2-G2): Condition 7: House, Button, and external-system responsibilities are separated
- APP-V2-017 (GATE-V2-G2): Condition 8: Product acceptance measures are defined or explicitly recorded as pending validation
- APP-V2-017 (GATE-V2-G2): Condition 9: Policy and stakeholder unknowns have named owners and future blocking gates
- APP-V2-017 (GATE-V2-G2): Condition 10: No requirement or decision authorizes implementation
- APP-V2-017 (GATE-V2-G2): Condition 11: No master development plan is created
- APP-V2-017 (GATE-V2-G2): Condition 12: Package 2 has had line-level review and is closed with a separate freeze record
- APP-V2-018 (PACKAGE-2-2): Freeze source snapshot commit: 071921c (contains V2-06..V2-11 and the expanded registers)
- APP-V2-018 (PACKAGE-2-2): Freeze closure/freeze commit: the Package 2 closure commit on branch docs/volume-2-affiliation-product-definition (distinct from the source snapshot)
- APP-V2-018 (PACKAGE-2-2): Gate V2-G2 PASS; Volume 2 Package 2 closed and frozen; V2-06..V2-11 and V2-B at 1.0.0
- APP-V2-018 (PACKAGE-2-2): Product definition only; implementation and procurement unauthorized; not a master development plan
- APP-V2-018 (PACKAGE-2-2): Volume 2 Package 3 authorized to commence as definition and governance work (DEC-V2-010)
- APP-V2-018 (PACKAGE-2-2): Executive organizational acceptance (Nolan, D0) pending at a later material-commitment gate
