# V5-32 - Physical Data-Design Doctrine and PostgreSQL Mapping Conventions

Document ID: V5-32
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-32.1 Purpose

This section is normative.

This chapter establishes the doctrine for the Volume 5 physical data model and the
conventions by which the governed logical model of Volume 5 is expressed for PostgreSQL as
the target relational platform. It is documentary. It defines relations, attributes, keys,
constraints, index requirements, and partitioning requirements in prose only. It contains
no executable data-definition, no object-relational mapping, no migration artifact, no
pipeline, no interface, and no event contract, and it authorizes no implementation. The
authoritative physical catalogue is REG-501, the authoritative rules and controls are
REG-502, and the governing decisions are ADR-V5-029 and ADR-V5-030.

## V5-32.2 Documentary status and boundary

This section is normative.

The physical model is a design contract, not an implementation. Every physical record in
REG-501 carries `authorizes_implementation: false`. No downstream reader may infer an
executable schema, key, index, migration, mapping, or interface from these records. The
physical-model leakage control CTRL-V5-016 fails closed against any executable schema or
migration content, and the no-inference decision ADR-V5-042 confirms that implementation
remains a separately authorized activity in a later volume.

## V5-32.3 Platform assumption

This section is normative.

The target persistence platform is PostgreSQL, recorded as assumption ASM-V5-006. No other
engine is assumed or authorized. Where this chapter names a physical capability — relational
integrity, transactional atomicity, uniqueness enforcement, partitioning, or index
requirements — it names the capability as a design obligation to be realized in PostgreSQL
semantics, not as a configured artifact.

## V5-32.4 Relation and attribute conventions

This section is normative.

Each governed logical entity in REG-501 maps to one or more physical relations, and each
physical relation names a resolvable logical source and an owning information domain, per
integrity rule INTEG-V5-019 and decision ADR-V5-030. Physical relations use stable,
language-neutral identifiers. Attribute sets are described with their intended meaning,
nullability posture, and data-class, and are subject to future PostgreSQL data-type mapping
validation TEST-V5-027 and physical naming validation TEST-V5-026. No physical name in this
model is treated as final until validated against reserved-word, length, and case-folding
rules, recorded as risk RISK-V5-007.

## V5-32.5 Identity and key conventions

This section is normative.

Every governed relation declares an explicit primary identity. Natural business keys are
expressed as alternate or unique constraints rather than as the sole identity, so that
identity remains stable while business attributes evolve. Foreign references are explicit
and resolvable. Scope-bearing relations carry composite scope keys rather than implicit
context, as elaborated in V5-33.

## V5-32.6 Classification and minimization posture

This section is normative.

Each physical attribute carries a data classification consistent with the Volume 5
classification model, so that personal, restricted-evidence, financial-status, and
security-audit data are identifiable at the physical layer. Classification informs future
access-control and minimization design; it authorizes none here.

## V5-32.7 Downstream constraint

This section is normative.

No downstream volume may treat this doctrine as an implementation instruction. The physical
model constrains how a faithful implementation must be shaped; it does not perform, approve,
or schedule that implementation.
