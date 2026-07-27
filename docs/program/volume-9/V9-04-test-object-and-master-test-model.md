# Volume 9 — Test Object, Requirement, Scenario, Case, Oracle, Evidence, and Result Model

Document ID: V9-04
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G1)

## Purpose

This chapter defines the master test model of The House v2: the vocabulary of test
objects, requirements, scenarios, cases, oracles, evidence, and results recorded in
register REG-902. The model is definitional; it contains no executable code and
asserts no result.

## Test object

A test object is a governed thing that may be placed under test: the Governance
Kernel, the guard registry, the transactional outbox processor, the row-level
security policy, the schema-migration set, and the API and event contracts. Each
object recorded in REG-901 names its type and its authoritative source.

## Test requirement

A test requirement binds an object to an institutional invariant it must uphold. A
requirement names its source, the object under test, the governed invariant it
protects, the level at which it will be exercised, the expected outcome, the
negative outcome that must be exercised, the evidence tier required, and the
independence required. A requirement without a negative outcome is incomplete.

## Test scenario

A scenario places a requirement into a concrete governed context: the acting party
or service, the tenant context, the jurisdiction context, the resource context,
and the lifecycle-state context. A scenario also records its disposition, whether
it exercises a positive path or a negative path. Scenarios that assert isolation or
authorization must be expressed as negative paths.

## Test case

A test case is the fully specified shape of a future exercise: its preconditions,
the stimulus applied, and the oracle by which its result will be judged. A case
names an oracle; it never encodes its own expected value. Package 1 records the
case shape only, never executable test code.

## Test oracle

An oracle is the authoritative basis for judging a result. Each oracle names the
authoritative source it derives from and, explicitly, the basis it must never rest
on: tester intuition, undocumented expectation, or the output of the very
implementation under test. An oracle grounded in implementation output proves
nothing.

## Test evidence and result model

Evidence obligations require provenance, configuration, environment, version, and
reproducibility. The result model defines the disposition vocabulary and holds an
inconclusive result strictly distinct from a passing result: an absence of failure
is not a pass. Acceptance of any result rests with the named acceptance authority,
not with the party that produced the evidence.
