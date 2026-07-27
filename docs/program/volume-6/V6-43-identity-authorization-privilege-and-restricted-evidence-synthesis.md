# V6-43 - Identity, Authorization, Privilege, and Restricted-Evidence Synthesis

Document ID: V6-43
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G5)

## V6-43.1 Purpose and scope

This section is normative.

This chapter consolidates the identity, authentication, authorization, delegation,
privileged-access, session, credential, and restricted-evidence definitions
established in Package 2 (V6-12 through V6-16) into a single access-decision
synthesis. It is a consolidation and introduces no new control. It authorizes no
implementation.

## V6-43.2 Identity distinctions preserved

This section is normative.

The synthesis preserves, without weakening, the governed identity distinctions
established in the frozen packages: a person is distinct from an account; an
account is distinct from a membership; a membership is distinct from a
representative relationship; a representative is distinct from a reviewer; a
reviewer is distinct from a finance actor; a finance actor is distinct from a
support actor; and a human identity is distinct from a service or workload
identity (ASSET-V6-009). No distinction is merged, and no identity type acquires
the authority of another.

## V6-43.3 Authentication and authorization distinctions preserved

This section is normative.

The synthesis preserves the following distinctions: authentication is not
authorization; a role is not resource authority; and emergency access is not
permanent authority. Establishing who an actor is never establishes what the actor
may do; holding a role never grants authority over a specific governed resource;
and emergency access is time-bound and reviewed and never becomes standing
authority.

## V6-43.4 Access-decision record

This section is normative.

For every governed access decision consolidated here, the synthesis records the
following governed inputs by reference to the frozen source: the identity input;
the resource input; the organization scope; the jurisdiction; the assignment; the
requested action; the lifecycle state; the sensitivity; any delegation; the
purpose; the policy version; the administrative context; the failure posture; the
required decision evidence; and the future test class. The deterministic
final-closure tooling (V6-51) projects this record set and reports any
access-decision definition missing a governed input as a blocking error.

## V6-43.5 Fail-closed posture

This section is normative.

Where any governed access-decision input is missing, unresolved, or unknown, the
defined decision is to deny. Missing identity, resource, organization,
jurisdiction, assignment, action, lifecycle, sensitivity, delegation, purpose, or
policy-version context fails closed. This fail-closed posture is a definition; it
is not implemented and is not proven, and its verification is deferred to a future
test class in a downstream volume.

## V6-43.6 Restricted-evidence protection

This section is normative.

Restricted-evidence assets (ASSET-V6-004) and their metadata (ASSET-V6-005) carry
the RESTRICTED_EVIDENCE classification and are governed by the restricted-evidence,
document-access, sharing, disclosure, and export definitions of V6-16. Access to
restricted evidence requires the full governed access-decision context, fails
closed on missing context, and is logged under the restrictions defined in V6-16
and V6-18. No restricted-evidence access rule is implemented here.

## V6-43.7 Privileged access and delegation

This section is normative.

Privileged administrative capability (ASSET-V6-007) is governed by the delegation,
privileged-access, emergency-access, and segregation-of-duties definitions of
V6-14. Privileged access is scoped, time-bound where emergency, reviewed, and
separated from the authority to approve one's own actions. Delegation transfers
only the authority explicitly granted and never exceeds the delegator's authority.
These are definitions and are not implemented.

## V6-43.8 Explicit non-authorizations

This section is normative.

This chapter implements no identity, authentication, authorization, delegation,
privileged-access, session, credential, or restricted-evidence control; creates no
executable access rule, policy, role definition, or isolation rule; provisions no
identity, account, credential, secret, or key; merges no governed identity
distinction; makes no operational-readiness or assurance claim; and authorizes no
implementation.
