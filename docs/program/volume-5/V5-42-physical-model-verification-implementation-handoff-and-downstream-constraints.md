# V5-42 - Physical-Model Verification, Implementation Handoff, and Downstream Constraints

Document ID: V5-42
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-42.1 Purpose

This section is normative.

This chapter records the traceability and verification of the Package 4 physical data model,
the validation-gate reassignment made necessary by the closing of Gate V5-G4, the implementation
handoff posture, and the constraints Package 4 places on downstream volumes. It is documentary
and authorizes no implementation. The authoritative catalogue is REG-501, the authoritative
rules and controls are REG-502, the decisions are REG-503, and the backlog is REG-504.

## V5-42.2 Traceability

This section is normative.

Every physical relation, attribute, key, constraint, index requirement, partitioning requirement,
view, materialized projection, staging relation, quarantine relation, audit relation, and outbox
relation in REG-501 names a resolvable logical source and an owning information domain, per
logical-to-physical traceability rule INTEG-V5-019. Every Package 4 rule and control in REG-502
names its affected entities or a governed condition and traces to a decision or physical record.
The Package 4 controls verify these references and reject any unresolved reference.

## V5-42.3 Verification obligations

This section is normative.

The physical model defines verification obligations to be discharged at implementation:
physical naming validation TEST-V5-026, PostgreSQL data-type mapping validation TEST-V5-027,
concurrency and locking validation TEST-V5-028, index selection validation TEST-V5-029,
partitioning validation TEST-V5-030, archival and retention policy validation TEST-V5-031,
migration rollback feasibility validation TEST-V5-032, and performance baseline validation
TEST-V5-033. None of these is discharged here; each is a governed future obligation.

## V5-42.4 Validation-gate reassignment

This section is normative.

Gate V5-G4 is dispositioned at the close of Package 4. An unresolved obligation must not remain
blocked by an already-passed gate. Accordingly, every unresolved validation obligation,
assumption, risk, and integrity rule that previously named Gate V5-G4 as its future blocking
gate has been reassigned additively to the correct future gate, preserving Gate V5-G4 as a
superseded future blocking gate for audit and recording the decision reference ADR-V5-043. No
unresolved validation item retains Gate V5-G4 as its future blocking gate. The Package 1,
Package 2, and Package 3 chapters remain frozen; the PACKAGE-5-1, PACKAGE-5-2, and PACKAGE-5-3
freezes are preserved.

## V5-42.5 Implementation handoff and no-inference boundary

This section is normative.

The physical model expresses integrity, indexing, and partitioning requirements as design
obligations only. No executable data-definition, migration, or object-relational mapping is
inferred or authorized from these records, per physical-model leakage control CTRL-V5-016 and
decision ADR-V5-042. Implementation remains a separately authorized activity in a downstream
volume. The handoff is a design contract, not a build instruction.

## V5-42.6 Gate-correctness control

This section is normative.

The validation-gate correctness control continues to fail closed if any unresolved obligation or
rule names a governance gate that has already been dispositioned. The set of completed gates —
V5-G1, V5-G2, V5-G3, and V5-G4 — is derived from the ratified gate dispositions in REG-505. No
future obligation may silently point at a passed gate.

## V5-42.7 Downstream constraints

This section is normative.

Downstream volumes inherit the physical design contract of Package 4 and must not weaken explicit
scope, identity namespace separation, evidence externality, submission immutability, financial
authority separation, activation uniqueness, transactional atomicity, idempotency, projection
non-authority, or migration provenance. No downstream volume may treat any Package 4 record as an
executable artifact or as an authorization to implement.
