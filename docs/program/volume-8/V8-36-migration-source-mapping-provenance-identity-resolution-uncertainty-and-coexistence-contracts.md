# V8-36 - Migration Source, Mapping, Provenance, Identity Resolution, Uncertainty, and Coexistence Contracts

Document ID: V8-36
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G4)

## V8-36.1 Purpose

This section is normative.

This chapter defines the migration-contract requirements of the governed exchange plane: source inventory, provenance, mapping, identity resolution, uncertainty, coexistence, and cutover. It states what a migration must preserve and what it must never fabricate. It authorizes no migration script, transformation, identity-resolution algorithm, or cutover.

## V8-36.2 Migration-contract requirements

This section is normative.

Migration-contract requirements are defined for source inventory, authoritative-source status, extract provenance, source identifiers, mapping rules, code and value translation, identity candidates, duplicate candidates, unresolved identity, merge and split dependencies, jurisdiction and season mapping, requirement-version mapping, evidence-reference migration, decision and standing history, quarantine, coexistence, cutover dependency, and reconciliation. A migration contract that names no source provenance and no uncertainty treatment fails closed and is not defined.

## V8-36.3 A source record is not a resolved person, account, or authority

This section is normative.

The model preserves the following distinctions:

```
Source record
≠ resolved person
≠ account
≠ membership
≠ representative authority
≠ affiliation standing

Mapped value
≠ validated institutional meaning

Migration completion
≠ business acceptance
≠ source retirement
```

A source record is raw input. It becomes a resolved person, an account, a membership, a representative authority, or an affiliation standing only through governed resolution and determination, never by the act of migration alone. A mapped value is a proposed translation, not a validated institutional meaning.

## V8-36.4 Mapping is not identity resolution

This section is normative.

Mapping rules translate source codes and values into candidate governed forms. Mapping is distinct from identity resolution, which determines whether a source record corresponds to a known governed person or entity, and both are distinct from authority confirmation, which determines what a resolved identity is authorized to be or do. Every migration mapping declares its identity-resolution dependency; it does not itself assert that identity is resolved.

## V8-36.5 Uncertainty remains explicit

This section is normative.

Uncertainty must remain explicit and must not be converted into false authoritative certainty. Unresolved identity, duplicate candidates, and ambiguous mappings are recorded as uncertain and are quarantined rather than forced into a confident but unfounded governed state. Coexistence contracts govern the period in which migrated and source systems both hold data, and cutover dependency records what must be true before the source ceases to be authoritative. Migration completion is distinct from business acceptance and from source retirement, and completing a migration never by itself retires the source or accepts its content.

## V8-36.6 No claim of migration execution

This section is normative.

Nothing in this chapter asserts that any migration is executed, mapped, resolved, accepted, or completed. The migration contracts are documentary. Every controlled record is in a not-implemented-or-not-proven posture.

## V8-36.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no migration script, transformation, importer, exporter, adapter, or identity-resolution algorithm; it retires no source; and it changes no governed state. Every controlled Package 4 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
