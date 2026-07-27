# Volume 9 — Volume Control, Inheritance, and Test-Definition Authority

Document ID: V9-00
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G1)

## Purpose

This chapter establishes the control, inheritance, and authority of Volume 9, the
Quality and Master-Test-Governance Foundation for The House v2. Volume 9 defines
what must be tested, to what standard, and with what evidence. It does not build,
provision, execute, accept, or prove anything.

## Inherited baseline

Volume 9 inherits the frozen Volume 0 foundation and the released Volume 1 through
Volume 8 baselines. In particular it inherits the released, integrated contract
baseline of Volume 8, recorded under the release tag
central-registration-volume-8-v1.0.0. That baseline is the stable, authoritative
input against which Volume 9 defines its test obligations. Volume 9 does not
reopen, amend, or weaken any released volume.

## Authority and its limits

Volume 9 Package 1 holds authority to define quality attributes, institutional
invariants, a test-level taxonomy, a test-object and test-model vocabulary, an
evidence hierarchy, environment and test-data governance, and a defect and
disposition model. It holds no authority to authorize implementation, to authorize
executable tests, to authorize test environments or test data, to select providers
or products, or to authorize test execution or acceptance.

Every controlled Volume 9 record carries `authorizes_implementation: false` and an
implementation status of `NOT_IMPLEMENTED_OR_NOT_PROVEN`. This is a documentary
foundation only.

## Test definition held distinct from test execution and acceptance

The central discipline of this volume is the separation of test definition from
test execution and from acceptance. Definition names an obligation. Execution
produces evidence. Acceptance weighs that evidence against the obligation. Package 1
performs definition only; it asserts no execution and confers no acceptance. Any
claim that a behaviour has been exercised, that a result has passed, or that a
release is ready lies outside the authority of this package and is reserved to the
later, execution-authorized volumes and their gates.

## Controls

Volume 9 carries its own self-contained, deterministic governance controls
(structural and schema conformance, cross-reference integrity, foundation
projection, provenance integrity, and Gate V9-G1 readiness). The controls report
findings; they never confer ratification, and they never couple to or alter the
frozen Volume 0 through Volume 8 tooling.

## Non-authoritative projections

Generated reports and projections under the Volume 9 `generated/` tree are
non-authoritative. The Markdown chapters, YAML registers, and JSON schemas are the
authoritative record.
