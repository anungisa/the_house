# V5-39 - Projection, Search, Reporting, Analytics, and Export Physical Model

Document ID: V5-39
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-39.1 Purpose

This section is normative.

This chapter defines the physical model for projections, search, reporting, analytics, and
export. It is documentary and authorizes no implementation. The authoritative records are in
REG-501 and the governing decision is ADR-V5-040.

## V5-39.2 Non-authoritative projections

This section is normative.

Views, materialized projections, search structures, analytics structures, and export
structures are non-authoritative, read-only, and always rebuildable from authoritative
sources, per projection write prohibition control CTRL-V5-013 and decision ADR-V5-040.
Governed writes never target a projection; a projection is a derived view of governed truth.

## V5-39.3 View and materialized projection relations

This section is normative.

Database views express derived reads over authoritative relations without holding independent
state. Materialized projections hold precomputed reads for performance and carry an explicit
consistency posture and staleness indicator, so that consumers understand that a materialized
projection may lag its authoritative source and can be rebuilt.

## V5-39.4 Search and analytics relations

This section is normative.

Search and analytics structures are derived projections optimized for retrieval and
aggregation. They hold no independent governed authority and confer no status. Analytical
aggregates carry an analytics-aggregate classification and are minimized and purpose-bound
consistent with the Volume 5 data-use model.

## V5-39.5 Export relations and lineage

This section is normative.

Export structures represent governed extracts for downstream consumers. Every export preserves
lineage to its authoritative source, per logical-to-physical lineage preservation lineage
record LINEAGE-V5-011. An export asserts no authority and is a point-in-time derived
representation.

## V5-39.6 Rebuildability

This section is normative.

Because projections are derived and non-authoritative, any projection can be reconstructed from
authoritative relations. Loss or corruption of a projection is a recoverable operational event,
never a loss of governed truth.

## V5-39.7 Downstream constraint

This section is normative.

No downstream volume may treat a projection, search structure, analytics structure, or export
as authoritative, permit governed writes against it, or produce an export without preserved
lineage.
