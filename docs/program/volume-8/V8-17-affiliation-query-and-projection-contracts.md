# V8-17 - Affiliation Query and Projection Contracts

Document ID: V8-17
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-17.1 Purpose

This section is normative.

This chapter defines the query and projection contracts of the affiliation domain. It defines the read contracts that expose affiliation state to authorized actors and the staleness posture each read carries. It defines the query classes and their authority and staleness semantics; it defines no read model, index, cache, or transport.

## V8-17.2 Query catalogue

This section is normative.

The affiliation domain defines three query classes: the applicant's view of an affiliation subject, the reviewer's queue of affiliations awaiting a decision, and the affiliation status projection for integration consumers. Each query resolves to the House as institutional authority and to affiliation lifecycle state as authoritative source. No query exposes state the acting authorization context is not entitled to read.

## V8-17.3 Authority and entitlement

This section is normative.

Every affiliation query resolves to a named authorization context and returns only the affiliation subjects that context is entitled to read. The applicant query returns the applicant's own affiliation subjects within tenant scope. The reviewer query returns affiliations within the reviewer's delegated scope. A query that cannot resolve an entitled authorization context fails closed and returns nothing.

## V8-17.4 Staleness posture

This section is normative.

Each affiliation query declares a staleness posture consistent with the Package 1 query doctrine. Applicant and reviewer queries express an authoritative, read-your-writes posture against affiliation lifecycle state. The integration status projection may express an eventually-consistent posture and states so explicitly. A query that does not declare a staleness posture is not well defined.

## V8-17.5 Projection boundaries

This section is normative.

Projections are read shapes over affiliation lifecycle state; they are not authoritative sources and they hold no governed state of their own. A projection never becomes a place where affiliation state is changed, and it never discloses restricted evidence or another tenant's data. A projection contract records the query it serves and the entitlement it enforces; it defines no materialization, index, or cache mechanism.

## V8-17.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no read model, index, cache, materialized view, or transport, and it mutates no governed state. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
