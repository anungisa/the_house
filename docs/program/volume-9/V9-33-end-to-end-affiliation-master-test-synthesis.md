# Volume 9 — End-to-End Affiliation Master-Test Synthesis

Document ID: V9-33
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G4)

## Purpose

This chapter synthesizes the Package 2 affiliation test definition into an
end-to-end master-test view of the affiliation lifecycle. It confirms that every
affiliation stage, interface surface, authority relationship, and isolation boundary
carries a governed master-test disposition. It is a documentary synthesis only and
authorizes no execution.

## Affiliation lifecycle stages

The affiliation lifecycle stages remain distinct and each carries full scenario-family
coverage in the integrated baseline: submission, approval, reconciliation, activation,
standing, and expiry. Submission is distinct from approval; approval is distinct from
reconciliation; reconciliation is distinct from activation; activation is distinct
from active standing; and standing is distinct from expiry. Each stage carries a
governed positive scenario and a governed scenario family of negative, denial,
conflict, stale-state, degraded, interruption, duplicate, replay, and recovery
situations.

## Exactly-once activation

Exactly-once activation is preserved as a business invariant of the affiliation
lifecycle. A duplicate activation stimulus, a replayed activation message, or an
interrupted-then-retried activation must not produce two activations; the master-test
synthesis records exactly-once activation as an institutional invariant with a
duplicate scenario, a replay scenario, and a recovery scenario, so that at-least-once
delivery never becomes more-than-once activation.

## Interface surfaces

Every affiliation interface surface carries a master-test disposition. Command
interfaces and query interfaces are dispositioned distinctly. Resource surfaces,
domain events, webhook callbacks, provider callbacks, file exchanges, and batch runs
each carry a governed test disposition. Data migration carries its own disposition
with a reconciliation oracle. No interface surface is left without a disposition.

## Authority relationships and denial

Account, membership, representative authority, delegation, assignment, finance
authority, and support authority remain distinct and each carries a denial test. An
actor without the resolved authority for a specific organization, jurisdiction,
resource, and lifecycle state is denied, and the denial expectation is exercised.
Finance authority is distinct from membership; delegation is distinct from
assignment; and support authority is distinct from representative authority.

## Isolation

Organization isolation and jurisdiction isolation are represented as master-test
obligations. A read, write, or action scoped to one organization or one jurisdiction
must not reach another; the isolation boundary carries a denial scenario, and
missing authority context fails closed.

## Versioning

Requirement versioning and evidence versioning are represented in the synthesis. A
requirement under test names the version it governs, and evidence names the artifact,
schema, and policy versions it was produced against, so that a later result cannot be
mistaken for a result against a different version.

## Documentary boundary

This synthesis exercises no affiliation behaviour. No submission is processed, no
approval is granted, no activation is executed, no migration is run, and no isolation
is proven. It records governed dispositions only.
