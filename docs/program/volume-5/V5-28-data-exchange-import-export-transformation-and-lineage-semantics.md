# V5-28 - Data Exchange, Import, Export, Transformation, and Lineage Semantics

Document ID: V5-28
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G3
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G3)

## V5-28.1 Purpose

This section is normative.

This chapter governs data exchange: the semantics of import, export, transformation, and
lineage. It defines the meaning of moving data across a boundary without approving any
executable pipeline, file contract, interface, or event. The authoritative catalogue is
REG-501 and the authoritative rules are REG-502. This chapter authorizes no implementation
and creates no import, export, pipeline, transformation, API, event, or file contract.

## V5-28.2 Exchange records

This section is normative.

An exchange record (REG-501, EXCH-V5-001 through EXCH-V5-005) names a source authority, a
receiving domain, a source reference, and either a transformation or a lineage
(INTEG-V5-018). Every governed intake or export names a source authority and preserves
lineage to its governed representation.

## V5-28.3 Import and intake

This section is normative.

Imported data preserves lineage from its external source reference to its governed
representation (LINEAGE-V5-009). Imported data validated against governed semantics has a
validation outcome; data that fails is rejected or quarantined and may be reprocessed under
governed rules. Transitional intake data carries no governed authority until validated and
promoted. External-authority data retains its external authority and is never re-authored
(RULE-V5-013).

## V5-28.4 Export and transformation

This section is normative.

Exported data preserves the meaning and authority of its source. A transformation records
the mapping from source to target so that meaning is not lost. Derived and analytical
outputs remain non-authoritative and preserve lineage (RULE-V5-014).

## V5-28.5 Lineage

This section is normative.

Lineage records the path from authoritative source to governed representation and is
auditable end to end. Lineage-less exchange breaks traceability and authority and is not
permitted (INTEG-V5-018).

## V5-28.6 Downstream constraints and no authorization

This section is normative.

Downstream volumes must implement exchange so that source authority and lineage are
preserved. No record in this chapter authorizes implementation, integration or storage
technology selection, file contracts, or procurement. The exchange-lineage validation
obligation remains open in REG-504 (TEST-V5-023).
