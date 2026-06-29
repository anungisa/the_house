# Edge identity adapter (HTTP boundary auth)

## Why this exists

The AffiliationApplication HTTP adapter previously trusted the request **body** to declare
who the caller was: `tenantId` and `actor` came straight off the JSON payload. That is
acceptable for local development and demos, but it is **not** authentication — any client
could claim any tenant and any actor.

This pass adds an **edge identity adapter**: a small, replaceable component that derives the
*trusted* tenant + actor for a request from a configured identity source, and feeds only that
trusted context into the existing domain boundary. The body can no longer assert identity in
production mode.

> This is the **identity context** layer only. It is **not** full token/JWT validation, not an
> OAuth login flow, and not a user-management system. See [Out of scope](#out-of-scope).

## What it does NOT change

- The Governance Kernel remains the sole authority for governed transitions. Identity is
  established at the edge; **authorization** of the action still happens in the kernel
  (permission + guard checks against persisted state).
- No RLS weakening. Auth runs purely at the HTTP boundary and never touches governed tables,
  the kernel, or the tenant context set inside the DB transaction.
- The domain DTOs, service, mapper, and FSM are unchanged.

## Auth modes

Selected by the `AUTH_MODE` environment variable (validated at config load; an unknown value
fails closed). Default: `demo`.

| Mode | Identity source | Use |
| --- | --- | --- |
| `demo` | Request **body** (`tenantId`, `actor`) | **LOCAL/DEMO ONLY.** Preserves pre-auth ergonomics. Never expose publicly. |
| `trusted_headers` | Trusted `x-house-*` request **headers** | Behind a verifying edge that authenticates the user and sets these headers. |

### Single switch (intentional deviation)

The original spec suggested a separate `AUTH_TRUSTED_HEADERS_ENABLED` flag in addition to a
mode. We use `AUTH_MODE` as the **single** switch to avoid ambiguous/contradictory states
(e.g. `mode=demo` + trusted-enabled). This keeps the fail-closed contract unambiguous.

## Trusted header contract (v1)

`trusted_headers` mode reads these headers (lowercased; all NSO-generic, no sport-specific
terms). They MUST be set by the trusted edge and MUST NOT be accepted from arbitrary clients.

| Header | Meaning | Required |
| --- | --- | --- |
| `x-house-tenant-id` | Trusted tenant | yes (else 401) |
| `x-house-actor-user-id` | Trusted acting user | yes (else 401) |
| `x-house-actor-role-keys` | Comma-separated role keys | no |
| `x-house-actor-permission-keys` | Comma-separated permission keys | no |
| `x-house-scope-type` | Generic org scope type (validated against the known set; invalid → omitted) | no |
| `x-house-scope-id` | Generic scope id | no |
| `x-house-organization-id` | Organization reference | no |
| `x-house-organization-unit-id` | Organization unit reference | no |

### Body-supplied identity is rejected

In `trusted_headers` mode:

- a request body `actor` (any non-`undefined` value) → **403 Forbidden**;
- a request body `tenantId` that **conflicts** with the trusted tenant → **403 Forbidden**;
- a request body `tenantId` that **equals** the trusted tenant is ignored (allowed).

The rest of the body (`context`, `reason`, `idempotencyKey`, `payload`) is still read for
operational data — but never for identity.

## Deployment assumption

`trusted_headers` mode assumes a **trusted upstream edge** (reverse proxy / API gateway /
identity provider) that:

1. authenticates the end user (validates the real token/session), and
2. **overwrites** the `x-house-*` headers from verified claims, stripping any client-supplied
   copies.

Without such an edge, do not enable `trusted_headers` — the headers are only as trustworthy as
whatever sets them.

## Request flow

```mermaid
flowchart LR
  C[Client] --> E[Trusted edge<br/>gateway / IdP]
  E -->|sets x-house-* from verified claims| S[HTTP server]
  S --> R{AuthContextResolver<br/>(AUTH_MODE)}
  R -->|demo: from body| A[AuthContext]
  R -->|trusted_headers: from headers| A
  R -->|missing identity| U[401 UNAUTHENTICATED]
  R -->|body overrides identity| F[403 FORBIDDEN]
  A --> AD[HTTP adapter<br/>buildCommandRequest]
  AD --> SVC[AffiliationApplicationService]
  SVC --> K[GovernanceKernel.transition]
```

## Error mapping

| Condition | Code | HTTP |
| --- | --- | --- |
| Missing/invalid trusted identity | `UNAUTHENTICATED` | 401 |
| Body attempts to supply/override identity | `FORBIDDEN` | 403 |
| Body/header tenant conflict | `FORBIDDEN` | 403 |
| Unknown action / bad body / facts present | `INVALID_INPUT` | 400 |
| Unknown `AUTH_MODE` | fails at **config load** (process won't start) | — |

Auth errors carry only a stable code + message; internal/stack/SQL detail is never returned
(`errorToHttpResult` collapses any non-`AppError` to an opaque 500).

## Code map

- `src/http/auth/AuthContext.ts` — `AuthActor`, `AuthContext` types (NSO-generic).
- `src/http/auth/AuthErrors.ts` — `UnauthenticatedError` (401), `ForbiddenError` (403).
- `src/http/auth/AuthContextResolver.ts` — resolver interface, `AuthResolveInput`,
  `createAuthContextResolver(config)` factory, re-exports `TRUSTED_HEADER_NAMES`.
- `src/http/auth/DemoAuthContextResolver.ts` — body-trusted resolver (default).
- `src/http/auth/TrustedHeadersAuthContextResolver.ts` — header-trusted resolver +
  `TRUSTED_HEADER_NAMES`.
- `src/http/AffiliationHttpAdapter.ts` — accepts a resolver (demo default), derives tenant +
  actor from the resolved `AuthContext`, maps 401/403.
- `src/http/server.ts` — optional `resolver` in deps (defaults to demo).
- `src/http/composition.ts` — selects the resolver from `loadConfig()` for the Pg server.

## Out of scope (future passes)

- Real token/JWT validation (e.g. Microsoft Entra ID) — a future `JwtAuthContextResolver`
  implementing the same `AuthContextResolver` interface.
- Entra app registration / IaC / secrets wiring.
- User provisioning, role administration UI, SCIM, directory sync.
- Production deployment wiring and observability hardening.
