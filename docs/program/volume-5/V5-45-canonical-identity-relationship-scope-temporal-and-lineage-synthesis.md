# V5-45 - Canonical Identity, Relationship, Scope, Temporal, and Lineage Synthesis

Document ID: V5-45
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G5)

## V5-45.1 Purpose

This section is normative.

This chapter consolidates the conceptual and logical models for identity, relationship, scope,
temporal truth, and lineage into a single synthesis. It is documentary and authorizes no
implementation. It consolidates the Package 1 conceptual identity model, the Package 2 logical
identity and authority model, and the Package 4 physical identity structures.

## V5-45.2 Consolidated identity, relationship, and scope subjects

This section is normative.

The synthesis consolidates the governed definitions of:

- organizations;
- clubs;
- people;
- authenticated identities;
- memberships;
- representative authority;
- delegation;
- reviewer eligibility and assignment;
- jurisdiction;
- season;
- affiliation;
- external identifiers;
- merge and split;
- effective and recorded time;
- versioning;
- correction;
- supersession;
- provenance and lineage.

Each subject resolves to governed catalogue and rule records already ratified in Packages 1, 2,
and 4.

## V5-45.3 Required distinctions

This section is normative.

The synthesis preserves the required distinctions:

- a person is not an account;
- a person is not an organization membership;
- a person is not a representative authority;
- a person is not a reviewer assignment;
- a person is not a finance authority;
- a person is not a support relationship.

These distinctions are enforced conceptually by integrity rule INTEG-V5-001 and persist from
conceptual meaning (Package 1) through logical records (Package 2) to documentary physical
structures (Package 4).

## V5-45.4 Temporal, scope, and lineage continuity

This section is normative.

The synthesis shows that organization, jurisdiction, season, and parent-child scope integrity,
effective and recorded time, versioning, correction by supersession, and provenance and lineage
are defined consistently across the conceptual, logical, and physical layers. Scope integrity is
carried by composite scope keys; temporal truth is carried by effective and recorded time on
state records; correction is carried by supersession that preserves prior history; and lineage
is carried by provenance records and derived-data lineage. No definition in this synthesis
authorizes implementation.
