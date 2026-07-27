# Volume 9 — Club Identity, Representative Authority, Initiation, Jurisdiction, Season, and Applicability Test Definition

Document ID: V9-13
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G2)

## Purpose

This chapter defines the test obligations for club identity, representative
authority, affiliation initiation, jurisdiction, season, and applicability. It
defines test requirements and scenarios only and authorizes no execution.

## Club identity and representative authority

The definition holds that a club identity is distinct from the accounts and
memberships associated with it, and that representative authority to initiate an
affiliation is a governed standing distinct from membership. A test obligation
records that only an actor holding representative authority for a specific club may
initiate an affiliation for that club, and that any other actor is denied.

## Initiation and applicability

Affiliation initiation carries obligations that the club is eligible, that the
season is current, and that the affiliation is applicable to the club and its
jurisdiction. Applicability is a derived determination from governed inputs, not a
free assertion. A test obligation records that an initiation against a non-current
season, an ineligible club, or an inapplicable jurisdiction is rejected.

## Jurisdiction and season

Jurisdiction and season are governed reference contexts. The definition records
that jurisdiction forms an isolation boundary and that a cross-jurisdiction access
attempt must be denied and fail closed. Season currency is a governed guard: a
submission against a superseded or non-current season must be rejected rather than
silently accepted.

## Scenario coverage

The scenario coverage for this domain includes a denial scenario for
cross-jurisdiction access and a negative scenario for an actor without
representative authority. Each scenario names the actor, the tenant context, the
jurisdiction context, the resource context, the lifecycle state context, its
disposition, and the governed oracle against which its result would be judged.

## Forward disposition

Every requirement and scenario names a forward gate, points at no completed gate,
and authorizes no implementation or execution.
