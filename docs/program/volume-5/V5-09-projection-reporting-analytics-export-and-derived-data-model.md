# V5-09 - Projection, Reporting, Analytics, Export, and Derived-Data Model

Document ID: V5-09
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-09.1 Purpose

This section is normative.

This chapter defines the conceptual model for derived data: projections, reports,
analytics, and exports. It establishes that all derived data is non-authoritative
and rebuildable, and it authorizes no implementation. The authoritative derived
products are DATA-V5-001 through DATA-V5-011 in REG-501.

## V5-09.2 Non-authoritative posture

This section is normative.

All projections, reports, analytics, and exports are non-authoritative
(RULE-V5-005, ADR-V5-004). They are never a source of governed truth and are always
rebuildable from authoritative sources. Every derived product names an authoritative
source that resolves to a governed domain or entity (CTRL-V5-004). A derived product
without a resolvable authoritative source fails closed.

## V5-09.3 Derived products

This section is normative.

Eleven governed derived products are defined, including Button-facing status,
required actions, reviewer queues, aging views, financial-status views, management
reports, operational assurance views, analytics datasets, research extracts, and
further governed exports. Each records its authoritative source, derivation,
consumer, refresh posture, staleness representation, security scope, privacy
minimization, rebuild source, export authority, and retention dependency.

## V5-09.4 Staleness and rebuild

This section is normative.

Every derived product represents staleness explicitly so that consumers can
distinguish current from stale data (RISK-V5-003). Projection rebuild lineage traces
to authoritative sources (LINEAGE-V5-007). Rebuild is the correction mechanism for
projections; projections are never corrected in place as if authoritative.

## V5-09.5 Analytics and export posture

This section is normative.

Analytics datasets and exports are minimized and preserve governed semantics and
lineage. Export requires explicit authority, and analytics purposes are governed and
minimized (RULE-V5-009). Permitted analytics purposes and export authority are
validated by TEST-V5-013. Button-facing and staff-facing products remain scoped and
minimized per V5-05 and V5-07.
