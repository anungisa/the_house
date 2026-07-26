# V5-40 - Migration Staging, Quarantine, Identity Resolution, and Reconciliation Data Model

Document ID: V5-40
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-40.1 Purpose

This section is normative.

This chapter defines the physical model for migration staging, quarantine, identity
resolution, and migration reconciliation. It is documentary and authorizes no implementation.
The authoritative records are in REG-501 and the governing decision is ADR-V5-041.

## V5-40.2 Staging relations

This section is normative.

Migration staging relations hold source values received from legacy systems together with
their provenance. Staging relations confer no governed authority; they are a transitional
holding area from which governed load is a separate, authority-recorded step, per migration
provenance and quarantine control CTRL-V5-014 and decision ADR-V5-041. Staged data carries a
transitional data-class.

## V5-40.3 Provenance preservation

This section is normative.

Every staged row preserves its source system, source identifier, and intake context, so that a
governed record loaded from migration can always be traced back to its source. Source access is
assumed to be granted under governed authority, recorded as assumption ASM-V5-010.

## V5-40.4 Quarantine relations

This section is normative.

Quarantine relations hold source rows that cannot yet be safely loaded — because of quality
defects, ambiguity, or uncertain identity matches. Quarantined rows are held for governed
steward review and never auto-merged, per control CTRL-V5-014. Poor source-data quality that
inflates quarantine volume is recorded as risk RISK-V5-010.

## V5-40.5 Identity resolution

This section is normative.

Identity resolution against governed persons and organizations treats similarity as advisory
only. A suspected match is surfaced as a governed issue for evidence-based steward decision and
is never automatically merged. This preserves the identity namespace separation of V5-34 during
migration.

## V5-40.6 Migration reconciliation

This section is normative.

Migration reconciliation relations record the comparison of staged and loaded data against
governed truth and the named authoritative source, so that a migration can be proven complete
and consistent. Reconciliation resolves conflicts only to the named authority and preserves
evidence.

## V5-40.7 Rollback and cutover

This section is normative.

Because a large governed migration may be difficult to reverse in place, a rollback and cutover
strategy is a required future validation, recorded as risk RISK-V5-011 and validation
TEST-V5-032. This chapter approves no migration execution.

## V5-40.8 Downstream constraint

This section is normative.

No downstream volume may treat staging or quarantine as authoritative, auto-merge uncertain
identity matches, load migrated data without provenance, or execute a production migration
without a validated rollback strategy.
