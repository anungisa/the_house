# V6-12 - Identity Lifecycle and Authentication-Assurance Model

Document ID: V6-12
Status: RATIFIED
Version: 1.0.0
Owner: Aubert Nungisa (Accountable Program Authority)
Approver: Nolan (Executive Acceptance Authority)
Associated Gate: V6-G2
Ratification: SELF-ATTESTED / AUTHOR-VERIFIED
Effective Date: TBD (Gate V6-G2)

## V6-12.1 Purpose and scope

This section is normative.

This chapter defines identity-lifecycle and authentication-assurance control
objectives. It selects no authentication product, configures no authentication
factor, and creates no credential, secret, or identity-provider connection.

## V6-12.2 Identity classes and separations

This section is normative.

The model distinguishes a person from an authenticated account, from organization
membership, from representative authority, from reviewer assignment, and from a
service identity. A person is not an account; an account is not authority; authority
is not assignment; and a human account is not a service identity. Identity
establishment and account lifecycle are governed by an identity control objective
(CTRL-V6-012), and service and non-human identities are governed separately
(CTRL-V6-015).

## V6-12.3 Authentication assurance

This section is normative.

Authentication assurance, credential lifecycle, and recovery are governed by an
authentication-assurance control objective (CTRL-V6-013). Authentication verifies
who an account holder is; it does not by itself grant access to any governed
resource. Recovery authority, credential issuance, rotation, and compromise
response are control obligations whose implementation and validation are pending
and gated.

## V6-12.4 Session and credential lifecycle

This section is normative.

Session establishment, expiration, and revocation are governed by a
session-and-credential control objective (CTRL-V6-014). Session and credential state
must fail closed on expiry, revocation, or a compromised-account response. Credential
and session material is a protected asset (ASSET-V6-003).

## V6-12.5 Service and external identities

This section is normative.

Service identities and non-human credentials are protected assets (ASSET-V6-009) and
must be explicitly scoped; they do not receive implicit trust. External identities
and identity-provider linkage are governed as a service-trust and federation concern
(V6-19) and are subject to identity-provider-outage failure posture.

## V6-12.6 Per-context attributes

This section is normative.

For each identity or authentication context the model records: identity class;
identity authority; authentication authority; evidence required; account state;
credential or session dependency; recovery authority; revocation trigger; failure
posture; logging requirement; privacy constraint; and future verification. These are
recorded against the identity and authentication control objectives in REG-602.

## V6-12.7 Explicit non-authorizations

This section is normative.

This chapter authorizes no authentication mechanism, factor, product, credential,
secret, session store, or identity-provider configuration. It records control
objectives, distinctions, and evidence requirements only. Future validation
(TEST-V6-005) must prove identity lifecycle and authentication assurance before any
implementation claim.
