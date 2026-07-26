# V5-17 - Temporal Truth, Versioning, Correction, Supersession, and Audit Logical Model

Document ID: V5-17
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-17.1 Purpose

This section is normative.

This chapter defines the logical model for temporal truth, versioning, correction,
supersession, and audit. It establishes how governed facts preserve time and history.

## V5-17.2 Temporal truth

This section is normative.

Governed facts preserve both effective time, when a fact is true in the world, and
recorded time, when the fact was recorded. Applicability is resolved at the relevant
time (INTEG-V5-012). Temporal truth is never overwritten; losing it would break trust
and audit.

## V5-17.3 State records

This section is normative.

Lifecycle state is represented as governed state records (STATE-V5-001) changed only
through governed transitions (ADR-V5-010). Each state change preserves prior state as
history. A state record is never a directly mutable status field.

## V5-17.4 Snapshots and provenance

This section is normative.

A snapshot (SNAP-V5-001) captures governed content as known at a point in time and is
immutable after capture. Provenance records (PROV-V5-001, PROV-V5-002) record the
origin and lineage of governed and derived data. Provenance is preserved so that any
governed or derived fact can be traced to its source.

## V5-17.5 Correction by supersession

This section is normative.

Corrections are applied by supersession. A correction record (CORR-V5-001) preserves
prior state and names a correction authority (INTEG-V5-013). No governed fact is
silently overwritten. Silent overwrite would destroy governed history and is
prohibited.

## V5-17.6 Audit

This section is normative.

The temporal, state, snapshot, provenance, and correction records together form the
audit basis of the logical model. Every governed change is attributable, time-stamped
in both effective and recorded senses, and recoverable from history.
