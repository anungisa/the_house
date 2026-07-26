# V5-13 - Jurisdiction, Season, Policy, Requirement, and Applicability Logical Model

Document ID: V5-13
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V5-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V5-G2)

## V5-13.1 Purpose

This section is normative.

This chapter defines the logical model for jurisdiction, season, policy version,
requirement version, and applicability. These entities establish the governed scope
in which affiliation truth is resolved.

## V5-13.2 Jurisdiction and season

This section is normative.

The following logical entities are defined and recorded in REG-501:

- Jurisdiction (LENT-V5-009): a governed jurisdictional scope.
- Season (LENT-V5-010): a governed operating period within a jurisdiction.

Seasons are unique and do not overlap within a jurisdiction (INTEG-V5-003). Scope by
jurisdiction and season is fail-closed; cross-scope access is denied absent explicit
governed authority (ADR-V5-016).

## V5-13.3 Policy and requirement versions

This section is normative.

The following logical entities are defined:

- Policy version (LENT-V5-011): a governed, versioned policy in effect for a scope.
- Requirement version (LENT-V5-012): a governed, versioned requirement derived from a
  policy version.

Policy and requirement versions preserve effective time and recorded time. Neither is
overwritten in place; new versions supersede prior versions while prior versions
remain part of governed history.

## V5-13.4 Applicability

This section is normative.

Applicability resolves which requirement version applies to a case. A response
satisfies only the requirement version applicable to the case at its relevant time,
determined by the effective policy version and jurisdiction (INTEG-V5-004). Applying
the wrong version invalidates completeness and is rejected.

## V5-13.5 Scope invariant

This section is normative.

Scope is an explicit property of governed entities and relationships. Access outside
the resolved jurisdiction and season fails closed. This scope invariant addresses the
cross-jurisdiction leakage risk RISK-V5-002 and is a Gate V5-G2 condition.
