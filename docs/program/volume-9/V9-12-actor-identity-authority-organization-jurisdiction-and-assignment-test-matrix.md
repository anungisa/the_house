# Volume 9 — Actor, Identity, Authority, Organization, Jurisdiction, and Assignment Test Matrix

Document ID: V9-12
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V9-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V9-G2)

## Purpose

This chapter defines the actor, identity, authority, organization, jurisdiction,
and assignment test matrix for club affiliation. It records the actor-authority
matrices held in register REG-901 and the authority and authorization oracle held
in register REG-902. It defines test obligations only and authorizes no execution.

## Authority distinctions

The matrix holds a strict set of distinctions that must never collapse under
implementation pressure:

- Account ≠ membership ≠ representative authority.
- Representative authority ≠ delegation ≠ assignment.
- Finance authority ≠ decision authority.
- Support access ≠ representative authority.

Each distinction is an institutional boundary. An actor holding a lesser standing
must never be able to act with a greater authority merely because both attach to
the same person or the same club.

## Negative and denial obligations

Every authority distinction carries a negative or denial test obligation. It is not
sufficient to test that an authorized actor may act; the matrix requires that an
actor without the required authority is denied and fails closed. A missing
mandatory authority context must never be resolved by assumption: the request must
be denied rather than proceed. These obligations are recorded as governed negative
and denial scenarios in register REG-902.

## Organization and jurisdiction isolation

The matrix records that organization and jurisdiction form isolation boundaries. An
actor scoped to one provincial jurisdiction must be denied access to an affiliation
in another jurisdiction, and a governed query must never disclose cross-tenant or
over-scoped data. Each isolation boundary carries a denial test obligation that
names the jurisdiction context under which denial is expected.

## Oracle basis

The authority and authorization oracle derives from the Volume 8 identity,
authority, delegation, and assignment specifications and the jurisdiction rules. No
authority result may be judged by tester intuition or by an assumption that
authority exists; the governed contract is the sole authoritative basis.

## Forward disposition

Every matrix and oracle names a forward gate, points at no completed gate, and
authorizes no implementation or execution.
