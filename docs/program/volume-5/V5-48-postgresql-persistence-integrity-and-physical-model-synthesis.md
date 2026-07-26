# V5-48 - PostgreSQL Persistence, Integrity, and Physical-Model Synthesis

Document ID: V5-48
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G5)

## V5-48.1 Purpose

This section is normative.

This chapter consolidates the documentary PostgreSQL physical-model definitions of Package 4 into
a single controlled baseline. It contains no executable data-definition language and authorizes
no implementation. The authoritative physical records remain the physical catalogue kinds in
REG-501. This synthesis is governed by decision ADR-V5-045, which clarifies that Gate V5-G4
ratified the documentary physical model but established no implementation effective date.

## V5-48.2 Consolidated physical subjects

This section is normative.

The synthesis consolidates:

- relations;
- attributes;
- identity strategies;
- primary and alternate keys;
- foreign and composite-scope integrity;
- uniqueness;
- check requirements;
- evidence metadata and binary references;
- temporal patterns;
- correction records;
- audit;
- command deduplication;
- transactional outbox;
- projections;
- staging;
- quarantine;
- index requirements;
- partition considerations;
- archival and retention dependencies.

Each subject resolves to governed physical records already ratified in Package 4.

## V5-48.3 Material physical-structure record

This section is normative.

For every material physical structure the synthesis records the physical identifier, logical
source, owning domain, owning module, authority, scope key, identity posture, temporal posture,
classification, integrity requirement, access pattern, index or partition requirement, correction
posture, verification class, and implementation status. Every physical relation names a
resolvable logical source, an owning module, and an implementation status; every projection names
a governed source and a consistency posture and is never authoritative; every migration relation
names a source provenance; and every audit and outbox relation names an integrity responsibility.

## V5-48.4 Documentary posture

This section is normative.

The synthesis remains documentary. It expresses integrity, indexing, and partitioning as design
obligations only; it infers no executable data-definition, migration, or object-relational
mapping, and it invents no physical quantities. Implementation status remains BASELINE_PENDING or
NOT_IMPLEMENTED_OR_NOT_PROVEN. This synthesis authorizes no implementation.
