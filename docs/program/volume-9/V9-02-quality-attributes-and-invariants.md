# Volume 9 — Quality Attributes and Institutional Invariants

Document ID: V9-02
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G1)

## Purpose

This chapter catalogues the governed quality attributes of The House v2 and the
institutional invariants that must never be violated. The catalogue is recorded in
register REG-901; this chapter states its intent and its rules.

## Quality attributes

A quality attribute is a governed property that the platform must uphold. Each
attribute recorded in REG-901 names an institutional purpose, an authoritative
source, the test levels at which it will be exercised, the evidence tier required
to support a claim about it, the inference that is prohibited, and the acceptance
authority empowered to accept evidence for it. Attributes include correctness of
governed lifecycle behaviour, tenant isolation, authorization integrity,
auditability, evidence integrity, idempotency, data quality, migration safety,
contract fidelity, workflow determinism, security, privacy, accessibility,
bilingual equivalence, resilience, recoverability, observability, and operational
readiness.

Naming an attribute does not assert that it is achieved. It records an obligation
to be exercised and weighed later.

## Institutional invariants

An institutional invariant is a property that must never be false. Each invariant
recorded in REG-901 carries an explicit negative-expectation requirement: the
invariant is only satisfied once a future test deliberately attempts to violate it
and the platform fails closed. A positive path alone can never satisfy an
invariant.

The invariants include: no cross-tenant disclosure; no governed-state mutation
outside the Governance Kernel; no unknown transition; no unknown guard execution;
no implementation authorization derived from documentation; no unauthorized use of
real production data in test; no substitution of a lower evidence tier for a
required higher tier; and no acceptance in the absence of required evidence.

## Prohibited inference

For every attribute and invariant, the same prohibition applies: the definition
confers no assertion that any corresponding test has been authored, provisioned,
executed, or passed. The catalogue is a set of obligations, not a set of results.
