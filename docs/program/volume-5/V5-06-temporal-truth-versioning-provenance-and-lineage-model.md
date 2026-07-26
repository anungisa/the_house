# V5-06 - Temporal Truth, Versioning, Provenance, and Lineage Model

Document ID: V5-06
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G1)

## V5-06.1 Purpose

This section is normative.

This chapter defines how The House v2 represents time, versioning, provenance, and
lineage for governed information. It defines meaning only and authorizes no
physical temporal structure. The authoritative lineage rules are LINEAGE-V5-001
through LINEAGE-V5-008 in REG-502.

## V5-06.2 Dual-time model

This section is normative.

Governed facts distinguish effective time (when a fact is true in the real world)
from recorded time (when the fact was recorded in the system) (LINEAGE-V5-001).
Both are represented for governed facts so that the system can answer what was true,
and what was known, at any point in time. The temporal-correctness quality
dimension (QUALITY-V5-010) governs this distinction.

## V5-06.3 Versioning and applicability

This section is normative.

Policy and requirement versions are explicit, and each governed response records
the versions applicable at the relevant time (LINEAGE-V5-002). Applicable versions
are fixed at submission and preserved in an immutable submission snapshot
(LINEAGE-V5-004). Later versions never silently re-base prior governed facts.

## V5-06.4 Provenance

This section is normative.

Every governed fact traces to its authority and source. Imported facts retain their
source system and import lineage (LINEAGE-V5-005); exports preserve source and
transformation lineage (LINEAGE-V5-006). Evidence replacement preserves the
provenance of prior evidence versions (LINEAGE-V5-003). Provenance completeness is
governed by the traceability quality dimension (QUALITY-V5-007).

## V5-06.5 Lineage and supersession

This section is normative.

Corrections and decisions supersede prior governed facts while preserving the prior
record and the supersession relationship (LINEAGE-V5-008). Projections trace to the
authoritative sources from which they are rebuilt (LINEAGE-V5-007). No governed
history is erased by correction; history is preserved by supersession.

## V5-06.6 Audit expectation

This section is normative.

Temporal changes, version applicability, imports, exports, projection rebuilds, and
supersessions are auditable. Audit (DOMAIN-V5-023) is append-only and is not
correctable in place. This chapter is consistent with the inherited append-only
audit and immutable evidence posture of The House v2.
