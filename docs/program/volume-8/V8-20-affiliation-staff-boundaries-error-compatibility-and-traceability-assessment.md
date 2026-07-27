# V8-20 - Affiliation Staff Boundaries, Error, Compatibility, and Traceability Assessment

Document ID: V8-20
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G2)

## V8-20.1 Purpose

This section is normative.

This chapter closes the affiliation contract definition. It defines the staff-boundary contracts of the affiliation domain, the affiliation-specific error semantics, the compatibility rules governing later change, and the traceability assessment linking affiliation contracts to their governing chapters. It defines assessment and boundary obligations only; it authorizes no construction and defines no tooling.

## V8-20.2 Staff boundaries

This section is normative.

House staff act under an operational authorization context that is bounded away from applicant self-service and reviewer decision authority. The staff boundary is a fail-closed trust boundary: a staff action that cannot be attributed to a named staff context and a scoped affiliation subject is refused. Staff may operate the affiliation domain under operational authority; staff hold no authority to author or override an affiliation decision outside the reviewer decision contract.

## V8-20.3 Affiliation error semantics

This section is normative.

The affiliation domain defines its error semantics as specializations of the Package 1 canonical error taxonomy. A completeness failure, an entitlement failure, and a reconciliation-mismatch failure each resolve to a canonical code and a user-safe semantic, respecting the privacy and logging constraints of the data-classification doctrine. Affiliation errors never disclose restricted evidence, reviewer notes, or another tenant's data. A failure that cannot resolve to a canonical code fails closed as an internal error.

## V8-20.4 Compatibility rules

This section is normative.

Affiliation contracts evolve under the Package 1 versioning and compatibility discipline. A backward-compatible change may add optional context or new query projections without breaking existing consumers; a breaking change to a command class, event envelope, or resource authority requires a new contract version and consumer evidence. Each affiliation compatibility rule records its compatibility state and the consumer evidence required before change. No compatibility rule authorizes silent breaking change.

## V8-20.5 Traceability assessment

This section is normative.

Every affiliation contract record traces to the governing chapter of this package and, through it, to the Package 1 foundation and the released Volume 7 baseline. The traceability assessment confirms that each affiliation resource, command, query, event, error, and compatibility rule resolves to a named authority, a governing chapter, and a forward gate. A contract record that cannot be traced fails closed and is not part of the affiliation definition.

## V8-20.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no staff console, tool, report, integration, or client, and it mutates no governed state. Every controlled affiliation record remains in a not-implemented-or-not-proven posture and authorizes no construction.
