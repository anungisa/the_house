# Volume 5 Governance Control Report (NON-AUTHORITATIVE)

Generated: 2026-07-26T18:52:22.199Z

> This report is a generated, non-authoritative projection of the source-controlled
> Volume 5 corpus. It is not a source of truth, does not confer ratification, and
> does not assert independent assurance. The Markdown chapters, YAML registers,
> JSON schemas, and control scripts are the authoritative record. Volume 0 through
> Volume 4 remain frozen/released and are not modified by Volume 5 work. Volume 5
> Package 1 defines DATA GOVERNANCE and CONCEPTUAL INFORMATION semantics only and
> authorizes no implementation, physical schema, migration, executable pipeline,
> infrastructure provisioning, vendor selection, procurement, delivery
> sequencing, staffing, or cost.

## Summary

- Total findings: 0
- Errors: 0
- Warnings: 0
- Info: 0
- Overall: PASS (no integrity errors)

## Data-governance vocabularies (schema-enforced)

- Catalogue kinds: INFORMATION_DOMAIN, CONCEPTUAL_ENTITY, CONCEPTUAL_RELATIONSHIP, DATA_PRODUCT, CLASSIFICATION
- Rule kinds: RULE, QUALITY, LINEAGE, CTRL
- Authority domains: House, CurlingCanada, Button, External, Staff, Shared, Neither
- Classification categories: PUBLIC, INTERNAL, PERSONAL, RESTRICTED_EVIDENCE, FINANCIAL_STATUS, PRIVILEGED_ADMIN, SECURITY_AUDIT, ANALYTICS_AGGREGATE
- Quality dimensions: VALIDITY, COMPLETENESS, CONSISTENCY, UNIQUENESS, TIMELINESS, ACCURACY, TRACEABILITY, AUTHORITY_ALIGNMENT, JURISDICTION_ALIGNMENT, TEMPORAL_CORRECTNESS

## Chapter status

| Status | Count |
| --- | --- |
| RATIFIED | 38 |

## Register health

| Register | Name | Status | Version | Records |
| --- | --- | --- | --- | --- |
| REG-500 | Volume 5 Corpus Index | RATIFIED | 1.6.0 | 38 |
| REG-501 | Volume 5 Data Catalogue | RATIFIED | 1.2.0 | 163 |
| REG-502 | Volume 5 Data Rules and Controls | RATIFIED | 1.2.0 | 69 |
| REG-503 | Volume 5 Data Decisions | RATIFIED | 1.2.0 | 28 |
| REG-504 | Volume 5 Assumptions, Risks, Exceptions, and Validation Backlog | RATIFIED | 1.2.0 | 39 |
| REG-505 | Volume 5 Approval Register | RATIFIED | 1.6.0 | 44 |

## Findings by control

### Structural, schema & data-governance conformance

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

### Cross-reference & traceability integrity

Errors: 0 | Warnings: 0 | Info: 0

- (no findings)

## Recorded conditions (from REG-505 approvals)

- APP-V5-001 (V5-00): Volume control, inheritance, and data-definition authority defined.
- APP-V5-001 (V5-00): Authorizes no implementation, physical schema, migration, procurement, or plan.
- APP-V5-002 (V5-01): Data doctrine, principles, and governance model defined.
- APP-V5-002 (V5-01): Authorizes no implementation.
- APP-V5-003 (V5-02): Information-domain catalogue and authority matrix defined with explicit ownership.
- APP-V5-003 (V5-02): Authorizes no implementation.
- APP-V5-004 (V5-03): Conceptual identity, organization, party, and relationship model defined without physical schema.
- APP-V5-004 (V5-03): Authorizes no implementation.
- APP-V5-005 (V5-04): Affiliation, season, policy, requirement, and evidence conceptual model defined.
- APP-V5-005 (V5-04): Authorizes no implementation.
- APP-V5-006 (V5-05): Tenant, jurisdiction, season, and information-scope model defined with fail-closed cross-scope rules.
- APP-V5-006 (V5-05): Authorizes no implementation.
- APP-V5-007 (V5-06): Temporal truth, versioning, provenance, and lineage model defined.
- APP-V5-007 (V5-06): Authorizes no implementation.
- APP-V5-008 (V5-07): Classification, minimization, access, and records dependencies defined.
- APP-V5-008 (V5-07): Establishes no unsupported retention schedule and claims no compliance implementation.
- APP-V5-009 (V5-08): Data quality, correction, reconciliation, and stewardship model defined with distinct correction types.
- APP-V5-009 (V5-08): Authorizes no implementation.
- APP-V5-010 (V5-09): Projection, reporting, analytics, export, and derived-data model defined as non-authoritative.
- APP-V5-010 (V5-09): Authorizes no implementation.
- APP-V5-011 (V5-10): Data validation backlog and downstream constraints defined with owners and future gates.
- APP-V5-011 (V5-10): Authorizes no implementation.
- APP-V5-012 (V5-A): Package 1 closure record consolidates the data-governance foundation.
- APP-V5-012 (V5-A): Records Gate V5-G1 disposition and Package 2 authorization.
- APP-V5-012 (V5-A): Authorizes no implementation.
- APP-V5-013 (GATE-V5-G1): Corrected Volume 4 release provenance is inherited.
- APP-V5-013 (GATE-V5-G1): Data-definition authority and amendment rules are controlled.
- APP-V5-013 (GATE-V5-G1): Data principles and governance responsibilities are defined.
- APP-V5-013 (GATE-V5-G1): Information domains have explicit business authority, stewardship, and system-of-record posture.
- APP-V5-013 (GATE-V5-G1): Conceptual identities and relationships are defined without physical schema design.
- APP-V5-013 (GATE-V5-G1): Organization, jurisdiction, season, and affiliation scope are explicit.
- APP-V5-013 (GATE-V5-G1): Policy, requirement, evidence, submission, decision, reconciliation, and activation relationships are defined.
- APP-V5-013 (GATE-V5-G1): Temporal truth, versioning, provenance, and lineage are represented.
- APP-V5-013 (GATE-V5-G1): Classification, minimization, access, and records dependencies are defined.
- APP-V5-013 (GATE-V5-G1): Data quality, correction, identity resolution, and reconciliation are distinguished.
- APP-V5-013 (GATE-V5-G1): Projections, analytics, reports, and exports remain non-authoritative.
- APP-V5-013 (GATE-V5-G1): Unresolved assumptions have owners, evidence requirements, and future gates.
- APP-V5-013 (GATE-V5-G1): Volume 4 architecture constraints trace into Volume 5.
- APP-V5-013 (GATE-V5-G1): No record authorizes implementation.
- APP-V5-013 (GATE-V5-G1): No physical schema, table, column, index, DDL, ORM mapping, migration, pipeline, infrastructure, procurement, delivery sequence, or master development plan is created.
- APP-V5-013 (GATE-V5-G1): Package 1 receives line-level review and a separate freeze commit.
- APP-V5-014 (PACKAGE-5-1): Package 1 corpus frozen; changes require the recorded amendment process.
- APP-V5-014 (PACKAGE-5-1): Freeze committed separately from authoring per Gate V5-G1 condition 16.
- APP-V5-014 (PACKAGE-5-1): Authorizes no implementation.
- APP-V5-015 (V5-B): Completes machine-readable Package 1 provenance after mainline merge.
- APP-V5-015 (V5-B): Preserves the Gate V5-G1 disposition and the PACKAGE-5-1 freeze.
- APP-V5-015 (V5-B): Reopens no substantive Package 1 content and authorizes no implementation.
- APP-V5-016 (V5-11): Logical data-model doctrine and modelling conventions defined.
- APP-V5-016 (V5-11): Authorizes no implementation, physical schema, migration, or procurement.
- APP-V5-017 (V5-12): Organization, party, identity, membership, and authority logical model defined with strict separation.
- APP-V5-017 (V5-12): Authorizes no implementation.
- APP-V5-018 (V5-13): Jurisdiction, season, policy, requirement, and applicability logical model defined.
- APP-V5-018 (V5-13): Authorizes no implementation.
- APP-V5-019 (V5-14): Affiliation case, pathway, lifecycle, review, and decision logical model defined with state as governed records.
- APP-V5-019 (V5-14): Authorizes no implementation.
- APP-V5-020 (V5-15): Response, evidence, submission, and decision-record logical model defined with custody boundary preserved.
- APP-V5-020 (V5-15): Authorizes no implementation.
- APP-V5-021 (V5-16): Financial obligation, payment acknowledgement, reconciliation, and activation logical model defined.
- APP-V5-021 (V5-16): Payment acknowledgement is distinct from accounting confirmation; approval is distinct from activation.
- APP-V5-021 (V5-16): Authorizes no implementation.
- APP-V5-022 (V5-17): Temporal truth, versioning, correction, supersession, and audit logical model defined.
- APP-V5-022 (V5-17): Authorizes no implementation.
- APP-V5-023 (V5-18): Logical integrity, cardinality, uniqueness, identity-resolution, and reconciliation rules defined as logical conditions.
- APP-V5-023 (V5-18): Verification deferred to named future gates; authorizes no implementation.
- APP-V5-024 (V5-19): Derived data, projection, search, reporting, analytics, and export logical model defined as non-authoritative.
- APP-V5-024 (V5-19): Authorizes no implementation.
- APP-V5-025 (V5-20): Logical-model traceability, validation backlog, and downstream constraints defined.
- APP-V5-025 (V5-20): Records the validation-gate reassignment away from the passed Gate V5-G1.
- APP-V5-025 (V5-20): Authorizes no implementation.
- APP-V5-026 (V5-C): Package 2 closure record consolidates the logical data model and canonical record semantics.
- APP-V5-026 (V5-C): Records Gate V5-G2 disposition and Package 3 authorization.
- APP-V5-026 (V5-C): Records the validation-gate reference correction away from the passed Gate V5-G1.
- APP-V5-026 (V5-C): Authorizes no implementation.
- APP-V5-027 (GATE-V5-G2): Package 1 provenance is unambiguous and preserved.
- APP-V5-027 (GATE-V5-G2): Package 1 unresolved validations no longer name the completed Gate V5-G1.
- APP-V5-027 (GATE-V5-G2): The logical model uses governed identity concepts, not physical keys.
- APP-V5-027 (GATE-V5-G2): Every logical entity names one owning domain, an identity concept, and a lifecycle.
- APP-V5-027 (GATE-V5-G2): Person, authenticated identity, membership, representative authority, reviewer assignment, and finance authority are distinct facts.
- APP-V5-027 (GATE-V5-G2): Jurisdiction and season scope is explicit and fail-closed.
- APP-V5-027 (GATE-V5-G2): Policy and requirement versions and applicability are defined.
- APP-V5-027 (GATE-V5-G2): The affiliation case, pathway, review, and decision model preserves state as governed records.
- APP-V5-027 (GATE-V5-G2): Responses, evidence metadata, submission snapshots, and decision records preserve the custody boundary.
- APP-V5-027 (GATE-V5-G2): Payment acknowledgement and accounting confirmation are distinct and reconciliation requires both.
- APP-V5-027 (GATE-V5-G2): Approval and activation are distinct governed facts.
- APP-V5-027 (GATE-V5-G2): Temporal truth, correction by supersession, and audit are preserved.
- APP-V5-027 (GATE-V5-G2): Logical integrity rules name affected entities, logical conditions, and future verification classes.
- APP-V5-027 (GATE-V5-G2): Derived data products are non-authoritative and preserve lineage.
- APP-V5-027 (GATE-V5-G2): No record authorizes implementation.
- APP-V5-027 (GATE-V5-G2): No physical schema, table, column, index, key, DDL, ORM mapping, or migration is created.
- APP-V5-027 (GATE-V5-G2): Package 2 receives line-level review and a separate freeze commit.
- APP-V5-028 (PACKAGE-5-2): Package 2 corpus frozen; changes require the recorded amendment process.
- APP-V5-028 (PACKAGE-5-2): Freeze committed separately from authoring per Gate V5-G2 condition.
- APP-V5-028 (PACKAGE-5-2): Authorizes no implementation.
- APP-V5-029 (V5-D): Completes machine-readable Package 2 provenance after mainline merge.
- APP-V5-029 (V5-D): Preserves the Gate V5-G2 disposition and the PACKAGE-5-2 freeze.
- APP-V5-029 (V5-D): Reopens no substantive Package 2 content and authorizes no implementation.
- APP-V5-030 (V5-21): Master, reference, transactional, evidentiary, and derived data classification defined.
- APP-V5-030 (V5-21): Derived and external data hold no independent House authority.
- APP-V5-030 (V5-21): Authorizes no implementation.
- APP-V5-031 (V5-22): Controlled vocabularies, code sets, bilingual semantics, and reference-data governance defined.
- APP-V5-031 (V5-22): Reference values are versioned and deprecated with replacement, never silently reused.
- APP-V5-031 (V5-22): Authorizes no implementation.
- APP-V5-032 (V5-23): Data ownership, stewardship, custody, issue management, and decision rights defined.
- APP-V5-032 (V5-23): Ownership, stewardship, and custody remain distinct.
- APP-V5-032 (V5-23): Authorizes no implementation and appoints no person.
- APP-V5-033 (V5-24): Data-quality rule lifecycle, measurement, exception, and remediation governance defined.
- APP-V5-033 (V5-24): Exceptions are time-bounded with a named authority; no silent permanent waivers.
- APP-V5-033 (V5-24): Authorizes no implementation and defines no executable quality rule.
- APP-V5-034 (V5-25): Data lifecycle, records, retention, legal-hold, archival, and disposition dependencies defined.
- APP-V5-034 (V5-25): No retention period or deletion schedule is approved; legal hold supersedes disposition.
- APP-V5-034 (V5-25): Authorizes no implementation and no deletion.
- APP-V5-035 (V5-26): Identity resolution, duplicate management, merge, split, and survivorship defined.
- APP-V5-035 (V5-26): Similarity is not identity; automated matching is advisory unless validated.
- APP-V5-035 (V5-26): Authorizes no implementation and no automated merging.
- APP-V5-036 (V5-27): Cross-system reconciliation, conflict resolution, and authority alignment defined.
- APP-V5-036 (V5-27): Reconciliation preserves authority boundaries and invents no new authority.
- APP-V5-036 (V5-27): Authorizes no implementation.
- APP-V5-037 (V5-28): Data exchange, import, export, transformation, and lineage semantics defined.
- APP-V5-037 (V5-28): Every exchange names a source authority and preserves lineage.
- APP-V5-037 (V5-28): Authorizes no implementation and creates no pipeline, API, event, or file contract.
- APP-V5-038 (V5-29): Purpose, minimization, disclosure, analytics use, and derived-data constraints defined.
- APP-V5-038 (V5-29): Derived and analytical data hold no independent authority.
- APP-V5-038 (V5-29): Authorizes no implementation and claims no privacy compliance.
- APP-V5-039 (V5-30): Data operations, observability, issue evidence, and stewardship-measure model defined.
- APP-V5-039 (V5-30): Stewardship measures assert no assurance until future operational evidence is provided.
- APP-V5-039 (V5-30): Authorizes no implementation and claims no operational proof.
- APP-V5-040 (V5-31): Package 3 traceability, validation backlog, and downstream constraints defined.
- APP-V5-040 (V5-31): Records the validation-gate reassignment away from the passing Gate V5-G3.
- APP-V5-040 (V5-31): Authorizes no implementation.
- APP-V5-041 (V5-E): Package 3 closure record consolidates the data-lifecycle and stewardship model.
- APP-V5-041 (V5-E): Records Gate V5-G3 disposition and Package 4 authorization.
- APP-V5-041 (V5-E): Records the validation-gate reassignment away from the passing Gate V5-G3.
- APP-V5-041 (V5-E): Authorizes no implementation.
- APP-V5-042 (GATE-V5-G3): Package 1 and Package 2 provenance and freezes are preserved.
- APP-V5-042 (GATE-V5-G3): Package 2 unresolved validations no longer name the completed Gate V5-G3.
- APP-V5-042 (GATE-V5-G3): Governed data is classified as master, reference, transactional, lifecycle-history, evidentiary, audit, derived, analytical, external-authority, and transitional data.
- APP-V5-042 (GATE-V5-G3): Each master data set names one authority owner and one steward.
- APP-V5-042 (GATE-V5-G3): Reference and code values are versioned and deprecated with a documented replacement and never silently reused.
- APP-V5-042 (GATE-V5-G3): Controlled terms carry a single canonical meaning with English and French labels.
- APP-V5-042 (GATE-V5-G3): Data ownership, stewardship, custody, and decision rights are distinct and named.
- APP-V5-042 (GATE-V5-G3): The data-quality rule lifecycle defines measurement, time-bounded exceptions, and remediation without executable rules.
- APP-V5-042 (GATE-V5-G3): The data lifecycle, records authority, retention dependencies, legal hold, archival, and disposition dependencies are defined without approving any retention period or deletion schedule.
- APP-V5-042 (GATE-V5-G3): Legal hold supersedes disposition.
- APP-V5-042 (GATE-V5-G3): Identity resolution treats similarity as advisory and requires evidence for merge or split.
- APP-V5-042 (GATE-V5-G3): Cross-system reconciliation preserves authority boundaries and resolves conflicts only to the named conflict authority.
- APP-V5-042 (GATE-V5-G3): Data exchange preserves source authority and lineage.
- APP-V5-042 (GATE-V5-G3): Purpose, minimization, and disclosure authority constrain data use and derived data holds no independent authority.
- APP-V5-042 (GATE-V5-G3): Stewardship measures assert no operational assurance until future operational evidence is provided.
- APP-V5-042 (GATE-V5-G3): Person, authenticated account, membership, representative authority, reviewer assignment, and finance authority remain distinct; payment acknowledgement and accounting confirmation remain distinct; affiliation approval, reconciliation, activation authorization, and activation execution remain distinct.
- APP-V5-042 (GATE-V5-G3): No record authorizes implementation.
- APP-V5-042 (GATE-V5-G3): No physical schema, table, column, index, key, DDL, ORM mapping, migration, pipeline, API, event, file contract, or executable quality rule is created.
- APP-V5-042 (GATE-V5-G3): Package 3 receives line-level review and a separate freeze commit.
- APP-V5-043 (PACKAGE-5-3): Package 3 corpus frozen; changes require the recorded amendment process.
- APP-V5-043 (PACKAGE-5-3): Freeze committed separately from authoring per Gate V5-G3 condition.
- APP-V5-043 (PACKAGE-5-3): Authorizes no implementation.
- APP-V5-044 (V5-F): Completes machine-readable Package 3 provenance after mainline merge.
- APP-V5-044 (V5-F): Preserves the Gate V5-G3 disposition and the PACKAGE-5-3 freeze.
- APP-V5-044 (V5-F): Reopens no substantive Package 3 content and authorizes no implementation.
