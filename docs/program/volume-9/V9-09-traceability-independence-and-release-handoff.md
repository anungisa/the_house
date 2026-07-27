# Volume 9 — Traceability, Coverage, Independence, Acceptance, and Release-Evidence Handoff

Document ID: V9-09
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G1)

## Purpose

This chapter defines how obligations are traced, how coverage is understood, how
independence is graded, how acceptance is decided, and how the test-definition
foundation is handed off to the later release volumes.

## Traceability

Every test requirement traces to a governed institutional invariant, and every test
case traces to an authoritative oracle. Traceability is definitional: it records
that an obligation is connected to the invariant it protects and the oracle by
which it will be judged. The deterministic controls fail closed on any requirement
whose invariant does not resolve or any case whose oracle does not resolve.

## Coverage

Coverage in Package 1 is definitional, not measured. A coverage record states that
every institutional invariant is traced to at least one future test requirement and
that every defined test level is traced to at least one object under test. No
executed or measured coverage is claimed.

## Independence

Independence is graded into eight levels, from author self-check to executive
acceptance, passing through peer review, domain review, security-or-privacy review,
accessibility-or-bilingual review, operational review, and independent assurance.
The stronger the claim, the greater the independence required of the party
attesting to its evidence. Author self-check can never support an acceptance claim.

## Acceptance

Acceptance is the authoritative decision, by a named acceptance authority, that
weighed evidence discharges an obligation. A result model keeps an inconclusive
result strictly distinct from a pass, and acceptance rests with the named
authority, never with the party that produced the evidence.

## Release-evidence handoff to Volumes 10, 11, and 12

This test-definition foundation is an input to the later release volumes. Volume 10
will govern test execution and the production of evidence against these
obligations. Volume 11 will govern environment provisioning, operational proof, and
resilience and recovery exercises. Volume 12 will govern independent assurance and
release acceptance. The handoff is definitional only: Volume 9 hands forward a set
of obligations for V10, V11, and V12 to discharge; it discharges none of them and
authorizes none of their work.
