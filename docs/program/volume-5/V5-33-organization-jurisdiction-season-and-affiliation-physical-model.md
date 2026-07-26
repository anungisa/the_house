# V5-33 - Organization, Jurisdiction, Season, and Affiliation Physical Model

Document ID: V5-33
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G4)

## V5-33.1 Purpose

This section is normative.

This chapter defines the physical model for organizations, jurisdictions, seasons, and
affiliation cases, expressing the corresponding logical entities of Volume 5 as governed
PostgreSQL relations. It is documentary and authorizes no implementation. The authoritative
records are in REG-501 and the governing decision is ADR-V5-031.

## V5-33.2 Organization and hierarchy relations

This section is normative.

Organizations — national, provincial or territorial, and club — are represented as governed
relations that record their identity, type, and governed status. Organizational hierarchy is
represented by explicit parent references rather than implied nesting. The organization
physical relations trace to their logical sources per INTEG-V5-019.

## V5-33.3 Jurisdiction and scope relations

This section is normative.

Jurisdiction is represented explicitly and is never inferred from context. Every scoped
relation carries explicit jurisdiction and organization references, per organization and
jurisdiction scope integrity rule INTEG-V5-020. This makes tenancy verifiable from the data
rather than from application context.

## V5-33.4 Composite parent-child scope integrity

This section is normative.

A child organization's governed scope is a subset of its parent's scope, enforced by
composite scope keys, per composite parent-child scope integrity rule INTEG-V5-021 and
decision ADR-V5-031. The composite scope key relations in REG-501 bind an organization to
the jurisdiction and parent scope within which it is governed, so that a child can never be
scoped outside its parent's authority.

## V5-33.5 Season relations and uniqueness

This section is normative.

Seasons are governed reference periods represented as relations with explicit identity and
temporal bounds. The applicability of an affiliation to a season is unique per case and
season, and the physical model expresses this with a uniqueness constraint so that a case
cannot hold two conflicting affiliations for the same season.

## V5-33.6 Affiliation case relations

This section is normative.

An affiliation case is a governed relation that binds an applicant organization, a
jurisdiction, and a season, and carries its governed lifecycle state by reference to the
governed state relation described in V5-37. The affiliation case relation never mutates its
own status outside the governed transition mechanism; status is a governed effect, not a
free attribute.

## V5-33.7 Downstream constraint

This section is normative.

No downstream volume may implement organization, jurisdiction, season, or affiliation
persistence in a way that weakens explicit scope, composite parent-child integrity, or
season uniqueness. These constraints are design obligations, not configured artifacts.
