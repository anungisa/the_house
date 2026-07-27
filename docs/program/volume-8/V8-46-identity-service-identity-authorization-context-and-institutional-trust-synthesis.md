# V8-46 - Identity, Service Identity, Authorization Context, and Institutional-Trust Synthesis

Document ID: V8-46
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V8-G5
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V8-G5)

## V8-46.1 Purpose

This section is normative.

This chapter synthesises the identity, service-identity, authorization-context, and institutional-trust contracts defined in the frozen packages. It authorizes no implementation and defines no new contract; it restates the governing distinctions that keep authorization resource-aware and fail-closed.

## V8-46.2 Authentication and authorization

This section is normative.

Authentication establishes who or what is making a request; authorization establishes what that authenticated party is permitted to do to a specific governed resource. The two are distinct: a party may be authenticated and still be unauthorized for a given action, and a valid identity is never, by itself, a grant of authority. Authentication failure and authorization failure are governed distinctly and both fail closed.

```
Authentication ≠ authorization
Who you are ≠ what you may do to this resource
```

## V8-46.3 Resource-aware authorization context

This section is normative.

Every governed action is authorized within an authorization context that names the acting identity, the target resource, the organization and jurisdiction scope, the tenant, and the required permission. Authorization is resource-aware: permission is evaluated against the specific resource and scope, not against a global role. Where the authorization context cannot be fully resolved, the action is denied — authorization is fail-closed by default, never fail-open. A missing or ambiguous authorization context is a denial, not a grant.

## V8-46.4 Service identity and institutional trust

This section is normative.

Service identities — the identities under which system components, workers, and integrations act — are governed on the same basis as human identities: they authenticate, they carry an authorization context, and they are bounded by trust boundaries. An external service's identity confers only the authority the House has explicitly granted at the trust boundary; institutional trust is granted, scoped, and revocable, never assumed. Cross-boundary trust is always explicit.

## V8-46.5 No implied authority

This section is normative.

No party — experience layer, staff tool, service identity, or external provider — acquires governed authority by virtue of successful authentication, network position, custody of data, or prior successful requests. Authority is only what has been explicitly granted in an authorization context and remains subject to revocation. Implied, inherited, or ambient authority fails closed.

## V8-46.6 Explicit non-authorizations

This section is normative.

This chapter authorizes no implementation. It defines no executable identity provider, IAM policy, role, credential, token, or cryptographic configuration, and it changes no governed state. Every controlled Package 5 record remains in a not-implemented-or-not-proven posture and authorizes no construction.
