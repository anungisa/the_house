# Volume 9 — Affiliation Test Domain, Scope, and Coverage Decomposition

Document ID: V9-11
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G2)

## Purpose

This chapter opens Package 2 by decomposing the club-affiliation lifecycle into a
bounded set of governed test domains. It defines what must be tested, not how any
test is written or run. Package 2 is documentary: it defines test requirements,
scenarios, oracles, evidence expectations, and coverage, and authorizes no
construction, execution, environment, test data, provider selection, or acceptance.

## Scope

The scope is the club-affiliation journey inherited from the Volume 7 experience
obligations and the Volume 8 contracts: club identity and representative authority,
requirements and evidence, draft and submission, review and return, decision,
finance and reconciliation, activation and standing, the command, query, event,
webhook, and provider-exchange contracts, and data integrity, database behaviour,
migration, and coexistence. Nothing outside the club-affiliation journey is in
scope for this package.

## Domain decomposition

Every affiliation journey stage is decomposed into a governed test domain recorded
in register REG-901. A domain names its coverage dimension, its coverage basis, its
measurement posture, and its authoritative source. A domain confers no execution
authority: it records an obligation to test a bounded stage against a governed
basis. The domains collectively span club and representative context, requirements
and evidence, submission and confirmation, review and resubmission, decision,
finance, activation and standing, contract surfaces, and data and migration.

## Coverage basis and measurement posture

Coverage in Package 2 is definitional. The coverage basis is the enumerated set of
governed actions and contracts inherited from Volumes 7 and 8. The measurement
posture is that coverage is measured against defined obligations, never against
executed results. No coverage record asserts that any behaviour has passed, that
any contract has been shown compatible, or that any migration has been accepted.

## Oracles derive from governed authority

Every affiliation oracle derives from a governed specification rather than tester
intuition or implementation output. A result can be judged only against an
authoritative basis, and each domain names the governed source from which its
oracle is drawn. This preserves the institutional invariant that documentation
confers no implementation authorization.

## Forward disposition

Each domain names a forward gate. No domain points at a completed gate, and no
domain authorizes implementation or execution. Authorization to execute any
affiliation test remains reserved to a later governed gate.
