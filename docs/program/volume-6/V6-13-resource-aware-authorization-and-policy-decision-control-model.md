# V6-13 - Resource-Aware Authorization and Policy-Decision Control Model

Document ID: V6-13
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G2)

## V6-13.1 Purpose and scope

This section is normative.

This chapter defines the resource-aware authorization and policy-decision control
model. It creates no executable authorization policy, no application permission, and
no access rule. It records the decision inputs, the decision responsibilities, and
the fail-closed rules as governed control objectives.

## V6-13.2 Authorization decision inputs

This section is normative.

The policy-decision control objective (CTRL-V6-016) must evaluate, at minimum: the
authenticated identity and account status; functional authority; organization
membership and representative authority; the target resource and its organization
scope; jurisdiction; reviewer eligibility and assignment; the requested action; the
lifecycle state; evidence sensitivity; delegation; the policy version; purpose; the
administrative context; and any time or effective-period constraint. Role alone is
insufficient.

## V6-13.3 Decision responsibilities and enforcement

This section is normative.

The model separates the policy-decision responsibility, the policy-information
inputs, and the enforcement points. The target resource must be loaded before an
authorization decision is made, so that organization, jurisdiction, and sensitivity
are resolved from the resource rather than assumed. Organization and jurisdiction
isolation, and resource loading before decision, are governed by a
resource-isolation control objective (CTRL-V6-017).

## V6-13.4 Assignment, escalation, and restricted operations

This section is normative.

Assignment enforcement and reviewer eligibility are governed by an assignment
control objective (CTRL-V6-018), which addresses reviewer over-access beyond
assignment (ABUSE-V6-001). National escalation, support restrictions, finance
restrictions, administrative correction, decision reconsideration, restricted-
evidence decisions, and denial evidence are recorded as authorization-decision
obligations bound to these control objectives.

## V6-13.5 Service-to-service authorization

This section is normative.

Internal service-to-service calls are authorized explicitly through a service-trust
control objective (CTRL-V6-019). Internal services do not receive implicit unlimited
trust, and authorization cannot be bypassed by direct data access.

## V6-13.6 Fail-closed rules

This section is normative.

The following rules are governed and fail closed: role alone is insufficient;
missing resource context fails closed; unresolved jurisdiction fails closed; missing
reviewer assignment fails closed when assignment is required; support cannot approve,
reconcile, activate, or alter governed history; finance cannot change affiliation
decisions; internal services do not receive implicit unlimited trust; and
authorization cannot be bypassed by direct data access.

## V6-13.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no executable authorization policy, permission, role, or
access rule, and no row-level access policy or configuration. It records decision
inputs, responsibilities, and fail-closed rules only. Future validation
(TEST-V6-006) must prove resource-aware, fail-closed authorization before any
implementation claim.
