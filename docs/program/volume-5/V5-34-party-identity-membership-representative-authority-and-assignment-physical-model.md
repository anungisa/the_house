# V5-34 - Party, Identity, Membership, Representative Authority, and Assignment Physical Model

Document ID: V5-34
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-34.1 Purpose

This section is normative.

This chapter defines the physical model for persons, authenticated identities, organization
memberships, representative authority, and reviewer assignment. It is documentary and
authorizes no implementation. The authoritative records are in REG-501 and the governing
decision is ADR-V5-032.

## V5-34.2 Namespace separation

This section is normative.

Person, authenticated identity, organization membership, representative authority, and
reviewer assignment are physically distinct relations and are never conflated, per identity
namespace separation rule INTEG-V5-022 and decision ADR-V5-032. Each concept holds its own
identity, and bindings between concepts are explicit references. This structural separation
preserves authorization and privacy boundaries.

## V5-34.3 Person relations

This section is normative.

A person is a governed relation recording the natural person's governed attributes, carrying
a personal data classification. A person relation asserts no authority by itself; authority
is expressed only through explicit membership, representative-authority, or assignment
bindings.

## V5-34.4 Authenticated identity relations

This section is normative.

An authenticated identity — an account — is a distinct relation bound to at most one person
by explicit reference. Separating account from person allows credential lifecycle to evolve
independently of the governed person record and prevents credential facts from contaminating
the person namespace.

## V5-34.5 Membership and representative authority relations

This section is normative.

Organization membership binds a person to an organization with a governed role and period.
Representative authority — the right to act for an organization in an affiliation matter — is
a distinct relation with its own governed scope and period. Neither membership nor
representative authority is inferred; each is an explicit, governed binding.

## V5-34.6 Reviewer assignment relations

This section is normative.

Reviewer assignment binds a reviewing actor to an affiliation case under a governed scope and
is distinct from eligibility, membership, and authority. Assignment is the physical basis for
reviewer authorization checks and never substitutes for representative authority or
membership.

## V5-34.7 Downstream constraint

This section is normative.

No downstream volume may collapse person, account, membership, representative authority, and
reviewer assignment into a shared structure. The separation is a governed integrity
obligation that protects authorization and privacy.
