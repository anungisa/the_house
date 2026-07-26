# V4-20 - PostgreSQL Persistence, Integrity, Concurrency, and Migration-Boundary Architecture

Document ID: V4-20  
Title: PostgreSQL Persistence, Integrity, Concurrency, and Migration-Boundary Architecture  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 authoring; basis Accountable Program Authority (Aubert Nungisa); evidence AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-405 APP-V4-029)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V4-G3)  
Supersedes: None  
Review Cycle: Frozen at Volume 4 Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-4/

## V4-20.1 Purpose and scope

This section is normative.

This chapter defines the target relational-persistence architecture on PostgreSQL for the governed
affiliation domain, without creating DDL. It defines aggregate and module persistence boundaries,
integrity constraints, concurrency posture, the migration governance boundary, and the requirement
for PostgreSQL behavioural verification. It authors no table names, column names, indexes, ORM
mappings, or migration files, and it provisions no database.

## V4-20.2 PostgreSQL as authoritative relational persistence

This section is normative.

PostgreSQL is the target authoritative relational persistence engine for governed state
(ARCH-V4-020, DEP-V4-017). Governed authoritative records reside in PostgreSQL; object and binary
content resides in the evidence-storage service defined in V4-21. This is an architecture decision
(ADR-V4-019); no PostgreSQL instance is provisioned and no vendor-managed service is selected in this
package.

## V4-20.3 Persistence boundaries and integrity

This section is normative.

Each domain module owns its persistence boundary (DATA-V4-016). Organization-scoped child records
must reference the same organization or tenant context as their authoritative parent
(CTRL-V4-020): a child record cannot bind to a parent in a different tenant or jurisdiction context.
The architecture defines the invariant families that must be enforced: tenant and jurisdiction
integrity, parent-child identity constraints, season uniqueness (one active seasonal affiliation per
recognized organization per season), lifecycle-state consistency, and referential integrity.

## V4-20.4 Invariant allocation

This section is normative.

The architecture allocates each invariant to database enforcement, domain-logic enforcement, or both
(ADR-V4-020). Structural and relational invariants - tenant-parent integrity, referential integrity,
uniqueness - are candidates for database enforcement; governed lifecycle and authorization invariants
remain in domain logic; invariants that protect against concurrent corruption may require both.
Database-enforced invariants are architectural expectations, not authored constraints.

## V4-20.5 Concurrency, deduplication, and atomicity

This section is normative.

The architecture defines optimistic or explicit concurrency for governed aggregates, command
deduplication keyed on the idempotency key defined in V4-16, and transaction isolation considerations
for governed transitions (CTRL-V4-021). Audit and outbox records commit atomically with governed
state (inherits CTRL-V4-015). Concurrency conflicts surface to application services as explicit,
retryable outcomes rather than silent overwrites.

## V4-20.6 Migration governance boundary and behavioural verification

This section is normative.

Migrations are **governed but not authored** in this package: the architecture defines that schema
change is a controlled, reviewed, forward-only-by-default activity subject to a future gate, and it
does not author migration files. PostgreSQL-specific behaviour - concurrency, isolation, constraint
enforcement, and atomicity - must later be verified against PostgreSQL itself and not only against
in-memory doubles (FIT-V4-037). This chapter authorizes no migration, no schema, and no database
provisioning, and every element it introduces carries `authorizes_implementation: false`.
