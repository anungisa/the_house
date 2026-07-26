# Volume 5 Package 4 Physical-Model Report (NON-AUTHORITATIVE)

Generated: 2026-07-26T19:32:33.450Z

> Generated projection of the source-controlled Volume 5 corpus. Not a source of
> truth and not a basis for ratification. Volume 5 Package 4 defines a DOCUMENTARY
> physical (PostgreSQL) data model only; it authorizes no implementation,
> executable DDL, migration, ORM mapping, executable pipeline, API, event,
> infrastructure, technology selection, retention period, deletion schedule,
> delivery sequence, staffing, or cost. Row volumes, query rates, index counts,
> latency targets, partition thresholds, and retention periods are not fabricated;
> unknown quantities are marked BASELINE_PENDING. Volume 0 through Volume 4, and the
> frozen Package 1 through Package 3 corpus, are not modified by Package 4 work.

## Package 4 counts

| Category | Count |
| --- | --- |
| Physical, staging, quarantine, audit, outbox relations | 34 |
| Physical attributes | 1 |
| Keys (primary/alternate/foreign/composite-scope/unique) | 19 |
| Check constraints | 3 |
| Index requirements | 3 |
| Partition requirements | 1 |
| Views and materialized projections | 3 |
| Staging and quarantine relations | 3 |
| Physical integrity/control rules | 44 |
| Validation/assumption/risk/exception backlog | 58 |

## Physical-model provenance and integrity coverage

- Physical relations without a governed logical source (must be 0): 0
- Physical attributes without a classification (must be 0): 0
- Keys without key columns (must be 0): 0
- Foreign keys without a referenced relation (must be 0): 0
- Check constraints without a condition (must be 0): 0
- Composite scope keys without a scope strategy (must be 0): 0
- Projections without a governed source (must be 0): 0
- Projections without a consistency posture (must be 0): 0
- Migration structures without source provenance (must be 0): 0
- Audit/outbox relations without an integrity responsibility (must be 0): 0

## Invariants asserted (definition-only)

- Every physical relation traces to a governed logical source and owning domain.
- Parent-child organization scope is enforced by composite scope keys.
- Person, account, membership, representative authority, and assignment are physically distinct.
- Evidence binary content is never held in an authoritative relational record.
- Financial acknowledgement, accounting confirmation, reconciliation, approval, and activation are distinct facts.
- Exactly one authoritative activation effect exists per affiliation and season.
- State, audit, and outbox effects share one transaction; corrections reference the corrected record.
- Projections, search, analytics, and exports are non-authoritative and retain lineage.
- Quarantine confers no authority; uncertain matches produce no governed merge.
- No row volume, query rate, index count, latency target, partition threshold, or retention period is fabricated.

## Validation-gate correctness

- Completed (passed) gates: V5-G1, V5-G2, V5-G3, V5-G4
- Backlog items pointing at a completed gate (must be 0): 0
