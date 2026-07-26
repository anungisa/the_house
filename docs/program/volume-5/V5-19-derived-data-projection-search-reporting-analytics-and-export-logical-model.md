# V5-19 - Derived Data, Projection, Search, Reporting, Analytics, and Export Logical Model

Document ID: V5-19
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-19.1 Purpose

This section is normative.

This chapter defines the logical model for derived data. Derived data includes
projections, search, reporting, analytics, and export. All derived data is
non-authoritative.

## V5-19.2 Derived data products

This section is normative.

The following derived data products are defined and recorded in REG-501:

- Case status projection (DERV-V5-001): a projected view of affiliation case state.
- Affiliation search view (DERV-V5-002): a governed search projection.
- Governance reporting view (DERV-V5-003): a reporting projection over governed facts.
- Analytics dataset (DERV-V5-004): an analytics projection for governed purposes.
- Export extract (DERV-V5-005): a governed export projection.

Each derived product names an authoritative source that resolves to governed logical
entities or domains.

## V5-19.3 Non-authority principle

This section is normative.

Every derived data product is non-authoritative and rebuildable. A derived product
never becomes a competing source of truth (INTEG-V5-014, ADR-V5-014). Where a derived
product and its authoritative source differ, the source governs.

## V5-19.4 Lineage and staleness

This section is normative.

Every derived product preserves lineage back to its authoritative source through
provenance records (PROV-V5-002). Derived products carry a logical representation of
staleness so that consumers can understand how current a projection is relative to its
source.

## V5-19.5 Purpose and scope

This section is normative.

Derived data is produced for governed purposes and honours the same jurisdiction and
season scope as its source. Cross-scope derivation is denied absent explicit governed
authority. Analytics purposes and privacy minimization are deferred for validation to
the trust and privacy volume.
