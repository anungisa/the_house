# V5-03 - Conceptual Identity, Organization, Party, and Relationship Model

Document ID: V5-03
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-03.1 Purpose

This section is normative.

This chapter defines the conceptual entities and party relationships of The House
v2 at the meaning level only. It designs no physical structure, key, or index. The
authoritative catalogue of entities and relationships is REG-501. Each conceptual
entity names an owning domain that resolves to a governed information domain, and
each conceptual relationship names at least two resolvable endpoints.

## V5-03.2 Conceptual entities

This section is normative.

The following fourteen conceptual entities are defined (ENTITY-V5-001 through
ENTITY-V5-014): Organization; Club; PTSO or Member Association; National
Organization; Person; Authenticated Identity; Organization Representative;
Organization Membership; Delegated Authority; Reviewer Assignment; Finance
Authority; Support Relationship; External-System Identity; and Historical Identity
Reference.

Each entity records its meaning, natural identity, governed identity, lifecycle,
authority, cardinality, temporal posture, correction posture, merge/split posture,
and audit expectation. Governed identity is a conceptual reference; it is not a
physical key.

## V5-03.3 Required conceptual distinctions

This section is normative.

The model preserves the following distinctions, each of which is governing:

- A person is not equal to an authenticated account. A person (ENTITY-V5-005) may
  reference many authenticated identities (ENTITY-V5-006) through a governed
  relationship (REL-V5-004).
- Organization membership (ENTITY-V5-008) does not by itself confer representative
  authority (ENTITY-V5-007) or delegated authority (ENTITY-V5-009). Membership and
  authority are separate governed facts (REL-V5-003).
- A role is not a resource authority. Representative authority is scoped by explicit
  delegation (REL-V5-007), never implied by role or membership.
- An assigned reviewer (ENTITY-V5-010) is not the same as any person holding the
  reviewer role. Assignment is a distinct governed fact (REL-V5-005).
- An external-system identity (ENTITY-V5-013) retains its source provenance and is
  reconciled to a governed party only through a governed match, never silently.
- A historical identity reference (ENTITY-V5-014) is not current authority; it
  preserves point-in-time truth (REL-V5-008).

## V5-03.4 Party relationships

This section is normative.

Conceptual relationships REL-V5-002, REL-V5-003, REL-V5-004, REL-V5-007, and
REL-V5-008 express party structure: representatives act for organizations;
membership is distinct from authority; persons hold authenticated identities;
delegation scopes representatives; and historical identities reference the current
party. Each relationship states an invariant that binds downstream logical design.

## V5-03.5 Identity resolution posture

This section is normative.

Identity resolution — merging duplicate organizations or persons, or rebinding
accounts — is always a governed operation that preserves prior history. It is never
a silent overwrite. Identity resolution obligations are tracked by TEST-V5-002,
TEST-V5-003, TEST-V5-004, and TEST-V5-018, and depend on the uniqueness quality
dimension (QUALITY-V5-004).
