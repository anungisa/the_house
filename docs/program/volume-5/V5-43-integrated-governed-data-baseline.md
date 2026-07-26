# V5-43 - Integrated Governed-Data Baseline

Document ID: V5-43
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G5)

## V5-43.1 Purpose

This section is normative.

This chapter consolidates the complete Volume 5 data definition into a single integrated
governed-data baseline. It is a consolidation of Packages 1 through 4; it adds no unsupported
data decision merely to manufacture completeness, and it authorizes no implementation. The
authoritative catalogue remains REG-501, the authoritative rules and controls remain REG-502,
the decisions remain REG-503, and the assumptions, risks, exceptions, and validation backlog
remain REG-504. This consolidation is governed by decision ADR-V5-046.

## V5-43.2 Scope of consolidation

This section is normative.

The integrated baseline consolidates, without re-deciding, the following defined layers of the
Volume 5 corpus:

- information authority, ownership, stewardship, and custody (Package 1, Package 3);
- conceptual entities and relationships (Package 1);
- canonical logical records (Package 2);
- jurisdiction, organization, season, and scope (Packages 1 and 2);
- temporal truth and provenance (Packages 1, 2, and 4);
- lifecycle governance (Packages 1 through 4);
- reference data and bilingual semantics (Package 3);
- quality and reconciliation (Package 3);
- physical persistence (Package 4);
- migration staging (Package 4);
- projections and analytics (Packages 1 through 4);
- records and retention dependencies (Package 3).

## V5-43.3 Material data-capability record

This section is normative.

For every material data capability inherited from the business-capability layers, the integrated
baseline records the following consolidated attributes, sourced from the governed registers:

- data capability;
- business outcome inherited;
- owning information domain;
- business authority;
- system-of-record authority;
- stewardship responsibility;
- logical records;
- physical structures;
- scope;
- temporal posture;
- classification;
- integrity controls;
- correction authority;
- lineage;
- verification requirement;
- unresolved dependency;
- implementation status.

Each attribute resolves to governed records already ratified in Packages 1 through 4. The
affiliation, evidence, decision, financial, and activation capabilities are consolidated in
V5-46; the identity, relationship, scope, temporal, and lineage capabilities are consolidated
in V5-45; the reference-data, quality, records, privacy, and stewardship capabilities are
consolidated in V5-47; the physical persistence capabilities are consolidated in V5-48; and the
migration, reconciliation, exchange, projection, and analytics capabilities are consolidated in
V5-49.

## V5-43.4 Implementation neutrality

This section is normative.

The integrated baseline is implementation-neutral. It defines what is authoritative, consistent,
traceable, and controlled; it does not implement the physical model, provision infrastructure,
select additional technology, approve retention periods, authorize procurement, define delivery
sequencing, or create a master development plan. Implementation status for every physical
structure remains BASELINE_PENDING or NOT_IMPLEMENTED_OR_NOT_PROVEN as recorded in REG-501 and
V5-50.
