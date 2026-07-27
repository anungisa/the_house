# Volume 9 — Data Integrity, Database Behaviour, Migration, Coexistence, and Reconciliation Test Definition

Document ID: V9-19
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G2)

## Purpose

This chapter defines the test obligations for affiliation data integrity, database
behaviour, migration, coexistence, and reconciliation. It defines test requirements
and scenarios only and authorizes no execution.

## Data integrity

Data-integrity testing carries obligations for tenant and parent scoping, monotonic
versioning, complete history, uniqueness, and provenance. A record that violates
tenant scoping, uniqueness, or provenance is detected and fails closed. Every
data-integrity obligation traces to a governed institutional invariant, including
the prohibition on cross-tenant disclosure.

## Database behaviour is not schema inspection

Database behavioural testing is held distinct from schema inspection and from mock
behaviour. Observed governed database behaviour — row-level security, constraints,
and transactional behaviour — is exercised against a governed database, not
inferred from schema inspection or from a mock. A test obligation records that a
schema inspection or a mock treated as behavioural evidence is detected and fails
closed.

## Migration is not business acceptance

Migration testing carries obligations for provenance, uncertainty, duplicate
candidates, quarantine, coexistence, and reconciliation. Migration execution is
held distinct from business acceptance: a completed migration run does not by
itself establish acceptance. A migrated record must carry provenance, an ambiguous
candidate is quarantined, and coexistence is reconciled before any acceptance is
considered. A test obligation records that a migrated record without provenance, or
migration execution treated as business acceptance, is detected and fails closed.

## Coexistence and reconciliation

During coexistence, a legacy record and a governed record may describe the same
club affiliation. The definition records that coexistence is reconciled under
governed provenance rules and that no real production data is named by any test
data requirement; all data used in a future test is synthetic or otherwise
governed.

## Forward disposition

Every requirement and scenario names a forward gate, points at no completed gate,
and authorizes no implementation or execution.
