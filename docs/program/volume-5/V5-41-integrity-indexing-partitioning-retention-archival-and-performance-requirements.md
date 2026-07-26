# V5-41 - Integrity, Indexing, Partitioning, Retention, Archival, and Performance Requirements

Document ID: V5-41
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-41.1 Purpose

This section is normative.

This chapter defines the physical integrity, indexing, partitioning, retention, archival, and
performance requirements of the Volume 5 physical model as design obligations. It is
documentary and authorizes no implementation. The authoritative records are in REG-501 and the
governing decisions include ADR-V5-042.

## V5-41.2 Integrity requirements

This section is normative.

The physical model requires primary identity on every relation, explicit resolvable foreign
references, composite scope keys on scoped relations, uniqueness constraints where the logical
model requires singularity, and check constraints where the logical model requires bounded
values. These requirements are described; no executable constraint is created here.

## V5-41.3 Index requirements

This section is normative.

Index requirements are expressed as the query families each relation must serve efficiently —
lookups by identity, by scope, by lifecycle state, and by temporal range. Index requirements
are design intent to be validated against measured workloads, per index selection risk
RISK-V5-008 and validation TEST-V5-029. No index is created and none is treated as final before
validation.

## V5-41.4 Partitioning requirements

This section is normative.

Partitioning requirements apply to high-volume history, audit, and outbox relations, described
by the partitioning consideration and expected growth rather than by a chosen partition key.
Partition strategy is subject to future validation against measured growth, per risk
RISK-V5-009 and validation TEST-V5-030.

## V5-41.5 Retention and archival dependency

This section is normative.

The physical model approves no retention period, archival schedule, or deletion. Retention and
archival remain reserved to a future records-policy authority, and legal hold supersedes
disposition, per retention authority dependency control CTRL-V5-015 and validation
TEST-V5-031. Retention structures are described only; no schedule is authorized.

## V5-41.6 Performance requirements

This section is normative.

Each relation carries an access-or-integrity objective describing what the physical design must
achieve. Because operational baselines do not yet exist, performance objectives are design
targets pending validation, per risk RISK-V5-012 and validation TEST-V5-033. Capacity
assumptions are recorded as ASM-V5-007 and ASM-V5-009.

## V5-41.7 Downstream constraint

This section is normative.

No downstream volume may treat these integrity, indexing, partitioning, retention, archival, or
performance requirements as executable artifacts, approve a retention schedule from this
chapter, or adopt an index or partition strategy without the required validation.
