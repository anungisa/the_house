# Volume 9 — Verification, Validation, Assurance, and the Test-Level Taxonomy

Document ID: V9-03
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G1)

## Purpose

This chapter distinguishes verification, validation, assurance, and acceptance, and
defines the test-level taxonomy recorded in register REG-901.

## Four distinct activities

Verification asks whether an artifact was built to its specification. Validation
asks whether the specified behaviour meets the institutional need. Assurance asks
whether the evidence is independent and strong enough to be trusted. Acceptance is
the authoritative decision, by a named authority, that the weighed evidence
discharges the obligation. These are four distinct activities and must never be
collapsed. Package 1 defines the vocabulary for all four and performs none of them.

## Test-level taxonomy

The taxonomy defines the levels at which future evidence may be produced. Each
level recorded in REG-901 names the object under test, the evidence it may
legitimately produce, the inference it may not support, its environment
dependency, and the independence required of the party attesting to it.

The levels span the full range of governed testing: document review, schema
validation, static analysis, unit test, component test, application-service test,
domain-behaviour test, database-behaviour test, contract test, event-contract test,
provider-contract test, integration test, system test, end-to-end test, workflow
test, data-quality test, migration test, security test, privacy test,
accessibility static test, accessibility manual test, assistive-technology test,
bilingual semantic review, performance test, capacity test, resilience test,
backup-restore test, recovery exercise, observability test, deployment-path test,
operational exercise, user-acceptance test, independent assurance, and release
acceptance.

## Level discipline

A level names the strongest inference its evidence may support and no more. Unit
evidence cannot support a system claim; a contract test cannot support a migration
claim; a positive integration result cannot support an invariant claim absent a
negative path. The taxonomy exists precisely to prevent evidence from a weaker
level being read as proof at a stronger one.

## No execution asserted

Defining a level asserts nothing about whether any test at that level has been
authored, provisioned, executed, or passed. The taxonomy is a definitional
scaffold for later, execution-authorized volumes.
