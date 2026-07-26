# V5-12 - Organization, Party, Identity, Membership, and Authority Logical Model

Document ID: V5-12
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-12.1 Purpose

This section is normative.

This chapter defines the logical model for organizations, parties, identities,
memberships, and governed authority. It preserves the strict separation of distinct
facts recorded in the conceptual model and required by Gate V5-G2.

## V5-12.2 Organization entities

This section is normative.

The following logical organization entities are defined and recorded in REG-501:

- Organization (LENT-V5-001): a governed sport organization within a jurisdiction.
- Club (LENT-V5-002): a member organization affiliating through a governing body.
- Provincial or territorial sport organization (LENT-V5-003): a jurisdictional
  governing organization.

Each organization entity names its owning information domain and a governed identity
concept. No physical key is introduced.

## V5-12.3 Party, identity, and membership

This section is normative.

The following logical entities are defined and remain strictly distinct:

- Person (LENT-V5-004): a natural person as a governed party.
- Account (LENT-V5-005): an authenticated identity through which a person acts.
- Membership (LENT-V5-006): the governed relationship of a person to an organization.

A person is not an account, and a membership is not an authority. These facts are
never conflated (INTEG-V5-001, ADR-V5-003).

## V5-12.4 Representative authority and assignment

This section is normative.

The following logical entities represent governed authority and are distinct from
identity and membership:

- Representative authority (LENT-V5-007): the governed authority of a person to act
  for an organization.
- Reviewer assignment (LENT-V5-008): the governed assignment of a reviewer to a case.

A role is not an assignment, and neither is a membership. Authorization,
representation, review authority, and finance authority are separate governed facts.

## V5-12.5 Identity separation invariant

This section is normative.

Identity separation is enforced as integrity rule INTEG-V5-001. Person, authenticated
identity, organization membership, representative authority, reviewer assignment, and
finance authority are distinct facts. Conflation of any of these creates
authorization and privacy defects and is rejected. This invariant is a Gate V5-G2
condition.
