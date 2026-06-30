# JWT / Microsoft Entra auth adapter (HTTP boundary)

## Why this exists

The HTTP boundary previously supported two identity modes (see
[Edge identity adapter](auth-edge-identity-adapter.md)):

- `demo` — tenant/actor read from the request **body** (local/demo only); and
- `trusted_headers` — tenant/actor read from trusted `x-house-*` request **headers**, which
  are only safe **behind a verifying edge** (reverse proxy / API gateway) that authenticates
  the user and overwrites those headers.

`trusted_headers` is insufficient when the API is exposed **directly** to token-bearing
clients: nothing validates the caller at the edge, so the `x-house-*` headers would be
attacker-controlled. This pass adds a third mode, **`entra_jwt`**, which makes the **bearer
token itself the identity boundary**: it validates an `Authorization: Bearer <JWT>` against
Microsoft Entra (or any OIDC issuer) and derives the trusted tenant + actor from verified
claims — **never** from caller-supplied headers or body.

> This is the **identity context** layer only. It is **not** an OAuth login UI, an Entra app
> registration/IaC step, a user-management system, or a centralized policy engine. See
> [Out of scope](#out-of-scope).

## What it does NOT change

- The Governance Kernel remains the sole authority for governed transitions. The JWT
  establishes **identity**; **authorization** of the action still happens in the kernel
  (permission + guard checks against persisted state). Producing an `AuthContext` is not an
  approval.
- No RLS weakening. Validation runs purely at the HTTP boundary and never touches governed
  tables, the kernel, or the tenant context set inside the DB transaction.
- The domain DTOs, service, mapper, FSM, and the `demo` / `trusted_headers` modes are
  unchanged. `entra_jwt` is purely additive.

## Auth modes

Selected by `AUTH_MODE` (validated at config load; an unknown value fails closed). Default:
`demo`.

| Mode | Identity source | Use |
| --- | --- | --- |
| `demo` | Request **body** | **LOCAL/DEMO ONLY.** Never expose publicly. |
| `trusted_headers` | Trusted `x-house-*` **headers** | Behind a verifying edge that authenticates and overwrites the headers. |
| `entra_jwt` | Validated `Authorization: Bearer <JWT>` | API exposed directly to token-bearing clients; no trusted header-injecting edge. |

In `entra_jwt` mode the resolver **ignores** the request body identity and the `x-house-*`
headers entirely — the verified token is the only identity source.

## Bearer token flow

```
Client → Authorization: Bearer <JWT>
  → EntraJwtAuthContextResolver.resolve()
      1. Extract token from the Authorization header (case-insensitive "Bearer " scheme)
      2. JwtVerifier.verify(token)  →  signature + iss + aud + exp validated against JWKS
      3. mapJwtClaimsToAuthContext(claims, mapping)  →  trusted AuthContext { tenantId, actor }
  → existing HTTP adapter → domain service → Governance Kernel (permission + guard checks)
```

The verifier is a **port** (`JwtVerifier`). The production adapter (`EntraJwksJwtVerifier`)
is the **only** file that depends on `jose` and performs JWKS network I/O; it uses
`createRemoteJWKSet` (lazy fetch + automatic signing-key rotation/caching) and `jwtVerify`
with the configured `issuer`/`audience`. Unit tests inject a **fake** verifier, so the
default suite never contacts Entra or a JWKS endpoint.

## Required configuration

Read only when `AUTH_MODE=entra_jwt` (config fails closed on missing/malformed values):

| Variable | Meaning | Required |
| --- | --- | --- |
| `ENTRA_ISSUER` | Expected `iss` (URL), e.g. `https://login.microsoftonline.com/<tenant>/v2.0` | yes (URL) |
| `ENTRA_AUDIENCE` | Expected `aud`, e.g. `api://house-v2` | yes |
| `ENTRA_JWKS_URI` | JWKS endpoint (URL) | yes (URL) |
| `ENTRA_TENANT_ID` | Informational tenant id (not used for validation) | no |

None of these are secrets, and the bearer token is never read from config. Issuer/JWKS URIs
are public.

## Claim mapping

Claim **names** are configurable (NSO-generic; no sport-specific claim names). Defaults match
Entra:

| Variable | Default | Maps to |
| --- | --- | --- |
| `ENTRA_USER_ID_CLAIM` | `oid` | `actor.userId` |
| `ENTRA_TENANT_ID_CLAIM` | `tid` | `tenantId` |
| `ENTRA_ROLE_CLAIM` | `roles` | `actor.roleKeys` |
| `ENTRA_PERMISSION_CLAIM` | `scp` | `actor.permissionKeys` |
| `ENTRA_ORGANIZATION_ID_CLAIM` | _(unset)_ | `actor.organizationId` (only if configured) |
| `ENTRA_ORGANIZATION_UNIT_ID_CLAIM` | _(unset)_ | `actor.organizationUnitId` (only if configured) |

### Role / permission parsing

`mapJwtClaimsToAuthContext` is pure (no network, no verification). A role/permission claim is
read with a unified rule:

- **absent** → empty list;
- **string** → split on whitespace **or** commas (handles the space-delimited `scp` scope
  claim and comma-delimited variants), trimmed, blanks dropped, de-duplicated;
- **array of strings** → trimmed, blanks dropped, de-duplicated;
- **any other shape** (number, object, or array containing non-strings) → **rejected as
  malformed (401)**. _(Design choice: a present-but-malformed claim is treated as an
  authentication failure rather than silently ignored, so a misconfigured token cannot grant
  an empty-but-accepted identity.)_

The tenant and user identity claims must be present, non-empty strings; otherwise the request
is rejected (401). A non-string tenant/user claim is treated as missing.

## Error mapping

All failures collapse to the existing, stable error codes and never leak token contents,
claim values, JWKS internals, or stack traces:

| Condition | Result |
| --- | --- |
| Missing `Authorization` header | `UNAUTHENTICATED` → **401** |
| Non-`Bearer` scheme / empty token | `UNAUTHENTICATED` → **401** |
| Signature / issuer / audience / expiry failure | `UNAUTHENTICATED` → **401** (`"Bearer token is invalid or expired."`) |
| Missing tenant or user claim | `UNAUTHENTICATED` → **401** |
| Malformed roles/permissions claim | `UNAUTHENTICATED` → **401** |
| Insufficient **domain** permission for the action | existing kernel path → **403** |

Coarse, non-sensitive reason codes (`JwtAuthReason`) are attached to error details for
diagnostics only — never the token, header, or key material.

## Observability safety

- Config diagnostics summarize `entra_jwt` with **presence booleans**
  (`issuerConfigured` / `audienceConfigured` / `jwksConfigured`) and the configured **claim
  names** — never tokens, secrets, or claim values.
- The redaction utility now treats `authorization` and `bearer*` keys as sensitive, so any
  accidentally logged `Authorization` header or token field is redacted.

## Local testing

- All unit tests are **hermetic**: a fake `JwtVerifier` injects claims (or throws to simulate
  signature/issuer/audience/expiry failures). **No real Entra, JWKS, network, or DB is
  contacted.**
- An optional production verifier exists (`EntraJwksJwtVerifier`) but is not exercised by the
  default suite.

## Production caveats

- **JWKS caching / key rotation** is handled by `createRemoteJWKSet`; ensure outbound network
  access to the JWKS endpoint.
- Requires an **Entra app registration** (audience/app id, exposed scopes/app roles) — out of
  scope here.
- Manage issuer/audience via **app config / managed secrets**; the bearer token is never
  stored or logged.
- **Conditional access** and tenant onboarding/mapping (Entra tenant → House tenant id) are
  organizational concerns handled by claim configuration, not this adapter.

## Out of scope

- Login UI / interactive OAuth flows.
- Entra app registration or IaC for it.
- SCIM / user provisioning, role administration.
- Centralized authorization policy (kernel guards/permissions remain the authority).
- Multi-issuer federation beyond a single configured issuer/audience.
