# V8-10 - Versioning, Compatibility, and Deprecation

Document ID: V8-10
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G1)

## V8-10.1 Purpose

This section is normative.

This chapter governs the versioning, compatibility, and deprecation obligations that constrain how a contract may change over time and what a producer must prove about downstream consumers before it changes one. It governs change discipline, not the executable versioning mechanism.

## V8-10.2 Compatibility states

This section is normative.

Every compatibility rule names the compatibility state of a proposed change: backward-compatible, forward-compatible, bidirectionally compatible, conditionally compatible, a breaking change, deprecation-pending, replacement-available, or sunset-validation-pending. A change whose compatibility state cannot be named is treated as a breaking change and fails closed.

## V8-10.3 Consumer-evidence requirement

This section is normative.

Every compatibility rule names the consumer evidence required before the change is made. A producer may not assert that a change is compatible without evidence about the consumers that depend on the contract. A compatibility rule that names no consumer evidence fails closed. A breaking change may proceed only through an explicit, evidenced deprecation path.

## V8-10.4 Deprecation discipline

This section is normative.

Every deprecation names its deprecation rule: the notice, the coexistence period during which the old and new contracts both remain valid, the migration path for consumers, and the sunset condition under which the old contract is withdrawn. A contract is never withdrawn while an unmigrated consumer depends on it and no sunset condition has been satisfied.

## V8-10.5 Downstream package constraints

This section is normative.

This chapter constrains every downstream package. No later package may introduce a breaking change without a compatibility rule, consumer evidence, and a deprecation path, and no later package may weaken the contract-governance, authority, identity, delivery, idempotency, error, privacy, provider, or compatibility obligations of this volume. Later packages extend these obligations; they do not relax them.

## V8-10.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It builds no versioning scheme, compatibility test, or deprecation tooling, and it withdraws no contract. Every controlled compatibility record remains in a not-implemented-or-not-proven posture and authorizes no construction.
