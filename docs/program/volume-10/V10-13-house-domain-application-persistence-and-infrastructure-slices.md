# Volume 10 — House Domain, Application, Persistence, and Infrastructure Delivery Slices

Document ID: V10-13
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V10-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED

## 1. Purpose

This chapter defines the documentary implementation slices for the House
modular-monolith baseline that the club-affiliation vertical requires. Each slice
is a plan; no slice authorizes construction, persistence changes, or execution.

## 2. Slice layers

Delivery slices are defined across the House modular-monolith layers: domain
model; application services; authorization context; repository and persistence
boundary; transactional state change; outbox; read projections; audit evidence;
administrative operations; configuration; and observability. These slices are
recorded in REG-1001 as technical-delivery-slice records.

## 3. Delivery destinations

The House slices include delivery destinations for: account versus membership
versus authority distinctions; organization and jurisdiction isolation;
representative authority and delegation; reviewer eligibility and assignment; the
affiliation lifecycle state machine; requirement versions; evidence bindings;
immutable submission versions; governed decisions; reconciliation state;
activation uniqueness; and standing and expiry.

## 4. Per-slice obligations

For every technical slice, the delivery model identifies: the domain boundary; the
application boundary; the persistence dependency; the contract dependency; the
security boundary; the data-integrity invariant; the migration dependency; the
required database-behaviour evidence; the required integration evidence; the
rollback dependency; and the completion evidence.

Database-integrity and PostgreSQL-behaviour evidence destinations are defined for
every slice that changes governed state. PostgreSQL-behaviour evidence is planned
as a reproducible verification obligation, not a claim of proven behaviour.

## 5. Governing distinctions

The following distinctions are preserved:

- A schema created is not an invariant enforced.
- A service implemented is not a production composition proven.
- An outbox implemented is not delivery and reconciliation proven.

Exactly-once activation is a business invariant and is not a transport claim. The
activation-uniqueness slice plans the business invariant; it does not assert any
message-transport guarantee.

## 6. House P0 delivery destinations

The fourteen House P0 findings each receive an implementation, test-enablement,
operational-proof, and release-evidence destination in this package. The findings
are: resource-aware authorization; reviewer assignment and jurisdiction; evidence
binding; production-dependency completeness; composite tenant-parent integrity;
affiliation lifecycle; versioned requirements; return and resubmission;
exactly-once activation; fail-closed configuration; outbox publication;
PostgreSQL behavioural verification; production-composition verification; and
deployment-path, secret, and entry-point configuration.

These destinations are recorded in REG-1001 as house-P0-delivery-destination
records and projected non-authoritatively in the generated
house-p0-implementation-and-proof-destination map.

## 7. Boundary

No House slice authorizes implementation. All slice records carry the
not-implemented, documentary-plan-only, and not-committed posture and are bound to
a future authorization gate that has not been dispositioned as passed for
implementation.
