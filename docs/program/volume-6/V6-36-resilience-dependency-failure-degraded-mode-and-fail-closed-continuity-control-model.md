# V6-36 - Resilience, Dependency-Failure, Degraded-Mode, and Fail-Closed Continuity Control Model

Document ID: V6-36
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G4
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G4)

## V6-36.1 Purpose and scope

This section is normative.

This chapter defines the control model for resilience, dependency failure, degraded-mode
operation, and fail-closed continuity for the affiliation service. It defines the
obligations that must exist before any resilience or degraded-mode behaviour may be
operated. It defines a control model only. It builds no failover, sets no availability
target, and authorizes no implementation.

## V6-36.2 Dependency failure is a governed condition

This section is normative.

The governed service depends on components, providers, and boundaries that may fail. Each
dependency-failure context records the dependency it concerns and a failure-detection
requirement so that a failure is observable rather than silent. A dependency failure is a
governed condition with defined obligations, not an undefined outage. No dependency is
operated or failed over by this chapter.

## V6-36.3 Degraded-mode operation preserves authority

This section is normative.

When a dependency fails, the service may operate in a degraded mode. Each degraded-mode
context records the operations permitted in that mode and the operations prohibited in it,
and an authority-retained statement requiring that governed authorization, tenant
isolation, evidence integrity, and consent controls continue to apply. Degraded operation
never relaxes a governed control. No degraded mode is implemented here.

## V6-36.4 Unresolved authorization context fails closed

This section is normative.

Where a degraded mode cannot resolve governed authorization, tenant, or consent context,
the affected operation must fail closed rather than proceed on assumption. Each such
control records a failure posture of fail closed. A degraded mode must never fail open on
authorization. This posture is defined; it is not asserted to be implemented or validated.

## V6-36.5 Visibility and reconciliation of degraded operation

This section is normative.

Degraded operation must be visible and reconcilable. Each degraded-mode control records a
user-visible-status dependency so that affected parties are not misled about service state,
a reconciliation requirement so that work performed or deferred during degradation is
reconciled on recovery, and an audit-evidence requirement so that entry into and exit from
degraded mode is recorded. No status surface, reconciliation, or audit store is built here.

## V6-36.6 Resilience is not a claim of availability

This section is normative.

Defining resilience obligations makes no availability, recovery-time, or recovery-point
commitment. This volume sets no RTO, RPO, availability percentage, or uptime target. Any
such target is deferred to a future volume with evidence and independent validation.
Resilience obligations are recorded as defined and unproven.

## V6-36.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It builds no failover, redundancy, or degraded
path, sets no RTO, RPO, availability, or recovery-time target, and takes no failover or
recovery action. It makes no claim of resilience or continuity readiness. Every record
introduced by this chapter remains `authorizes_implementation: false` and
`implementation_status: NOT_IMPLEMENTED_OR_NOT_PROVEN`.
