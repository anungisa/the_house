# V5-11 - Logical Data-Model Doctrine and Modelling Conventions

Document ID: V5-11
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-11.1 Purpose

This section is normative.

This chapter opens Volume 5 Package 2. It defines the doctrine and conventions for
the logical data model of The House. Package 2 is a logical definition only. It
describes what governed information means, how it is identified, how it relates, and
how its integrity is preserved. It does not authorize implementation. No record in
Package 2 authorizes implementation, and every Package 2 record carries
`authorizes_implementation: false`.

## V5-11.2 Scope and prohibitions

This section is normative.

Package 2 defines logical entities, value objects, reference data, code sets, state
records, snapshots, provenance records, correction records, logical relationships,
integrity rules, and derived data products. Package 2 does not define physical
storage, keys, indexes, schemas, migrations, executable interfaces, event contracts,
pipelines, infrastructure, vendor or storage selection, retention or deletion
approval, procurement, delivery sequencing, staffing, or cost. Those decisions are
reserved for later volumes and gates.

## V5-11.3 Modelling conventions

This section is normative.

The logical model observes the following conventions:

- Logical entities are identified by governed identity concepts, never by physical
  keys, columns, indexes, or storage identifiers (ADR-V5-008).
- Every logical entity, value object, reference set, state, snapshot, provenance
  record, and correction record names exactly one owning information domain
  (ADR-V5-009).
- Logical relationships name two resolvable endpoints and a relationship invariant.
- Value objects and reference or code sets carry governed values but hold no
  independent entity identity and have no lifecycle of their own (ADR-V5-015).
- Lifecycle state is represented as governed state records changed only through
  governed transitions, never as a directly mutable status field (ADR-V5-010).
- Every derived data product is non-authoritative, names an authoritative source,
  and preserves lineage (ADR-V5-014).

## V5-11.4 Fail-closed posture

This section is normative.

The logical model is fail-closed. A logical entity without an owning domain, an
identity concept, or a lifecycle is rejected. A logical relationship without two
endpoints or without an invariant is rejected. An integrity rule without affected
entities or a logical condition is rejected. Cross-scope access is denied absent
explicit governed authority (ADR-V5-016). These controls are recorded as CTRL-V5-008
and enforced by the Package 2 validation controls.

## V5-11.5 Authoritative registers

This section is normative.

The authoritative logical catalogue is REG-501. Logical rules, integrity rules, and
controls are recorded in REG-502. Logical-model decisions are recorded in REG-503.
Unresolved obligations and their future blocking gates are recorded in REG-504. The
corpus index is REG-500 and approvals are REG-505. Where narrative and register
differ, the register governs.
