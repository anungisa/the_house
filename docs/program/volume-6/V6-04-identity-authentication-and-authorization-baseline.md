# V6-04 - Identity, Authentication, and Authorization Baseline

Document ID: V6-04
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G1
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G1)

## V6-04.1 Purpose and scope

This section is normative.

This chapter defines the identity, authentication, and authorization baseline as
governed control objectives. It authorizes no identity or access roles,
permissions, access policies, or configuration; those are designed only downstream
under the security gate sequence.

## V6-04.2 Identity and authentication baseline

This section is normative.

Every governed action must be attributable to a strongly authenticated actor
identity (CTRL-V6-001). Authentication and secret material is a protected asset
whose compromise defeats downstream controls; its protection, rotation, and strong
verification are governed obligations (CTRL-V6-007). Authentication design,
implementation, and independent validation are pending and gated.

## V6-04.3 Authorization baseline

This section is normative.

Authorization must be resource-aware and fail closed (CTRL-V6-002). Actor role
alone is insufficient. A future authorization control must evaluate, at minimum,
the target resource and its classification, the owning organization, the
jurisdiction and tenant scope, the reviewer or actor assignment, the requested
action, the lifecycle state of the target entity, and the sensitivity of the
affected data. These authorization inputs are recorded as a governed obligation and
supply the fail-closed tenant and jurisdiction isolation required by THREAT-V6-001
and ABUSE-V6-001.

## V6-04.4 Privileged access

This section is normative.

Privileged administrative capability must be least privilege, approved, time-bound,
and fully audited (CTRL-V6-003). Privileged-access misuse (THREAT-V6-004) is
addressed by approval, just-in-time scope, and comprehensive audit as governed
intent, not implemented control.

## V6-04.5 Logging and audit dependency

This section is normative.

Security-relevant and governed events must be recorded in an integrity-protected,
append-only audit journal (CTRL-V6-005). The audit journal is a protected asset
(ASSET-V6-005); its integrity is an obligation, and its use for accountability is
subject to the privacy purpose recorded in V6-05.

## V6-04.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no identity or access roles, permissions, access policies,
authentication mechanisms, or configuration. It records control objectives and
their required inputs and evidence only. Future validation (TEST-V6-001) must prove
authorization fails closed and enforces tenant and jurisdiction scope.
