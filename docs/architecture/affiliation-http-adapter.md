# AffiliationApplication HTTP Adapter

## Purpose

This document describes the **thin HTTP adapter** that exposes the existing
`AffiliationApplication` domain command boundary over HTTP.

The adapter is a **transport seam only**. It translates an HTTP request into a call on
`AffiliationApplicationService.executeCommand(...)` and translates the returned response
DTO (or a thrown `AppError`) into an HTTP status + JSON body. It adds **no new authority**:
every governed lifecycle change still flows through `GovernanceKernel.transition()` exactly
once.

### What the adapter must never do

- contain lifecycle / transition logic or evaluate guards
- write audit / evidence / outbox rows, or mutate `governance.entity_state` / domain status
- touch the `GovernanceStore`, the kernel, or the database directly
- bypass `AffiliationApplicationService` / `GovernanceKernel.transition()`
- treat request-payload "facts" as authoritative guard state
- introduce any frontend code

Source: [src/http/AffiliationHttpAdapter.ts](../../src/http/AffiliationHttpAdapter.ts),
[src/http/server.ts](../../src/http/server.ts),
[src/http/composition.ts](../../src/http/composition.ts).

## Route convention (chosen)

```
POST /v1/affiliation/applications/:applicationId/transitions/:action
```

- `:applicationId` — the governed entity id (authoritative over any body value).
- `:action` — the **FSM trigger verb**, one of:
  `submit`, `review_start`, `approve`, `reject`, `activate`, `suspend`, `reinstate`,
  `revoke`, `close`, `archive`.

The short trigger verbs were chosen over the long domain command names
(`submitAffiliationApplication`, …) for cleaner, conventional REST URLs. The adapter maps
`:action` → domain command using a reverse lookup **derived from the single source of
truth** `AFFILIATION_APPLICATION_COMMANDS` (no parallel vocabulary is introduced). An
unknown `:action` fails closed.

### Health endpoints

- `GET /healthz` → `200` (process is up)
- `GET /readyz` → `200` (adapter wired; deeper dependency checks are a future pass)

## Request contract

Body is `application/json`:

```jsonc
{
  "tenantId": "tenant-uuid",                 // required (validated by the domain)
  "actor": {
    "userId": "user-uuid",                   // required
    "roleKeys": ["reviewer"],                // optional
    "permissionKeys": ["..."],               // optional (forward-compat)
    "scopeType": "national_organization",    // optional, NSO-generic
    "scopeId": "...",                         // optional
    "organizationId": "...",                  // optional hierarchy refs
    "nationalOrganizationId": "...",
    "regionalOrganizationId": "...",
    "localOrganizationId": "..."
  },
  "context": {
    "seasonId": "2025-26",                   // required (NSO-generic temporal scope)
    "scopeType": "...",                       // optional
    "correlationId": "..."                    // optional (echoed in the response)
  },
  "idempotencyKey": "stable-key",            // required (see Idempotency)
  "reason": "operational reason"             // required for high-risk actions
}
```

- `applicationId` comes from the **path**, not the body.
- The `:action` (path) selects the command; callers never send a raw trigger in the body.
- **NSO-generic only.** No sport-specific fields (`ptsoId` / `clubId` / `curlerId` /
  `bonspielId`). Curling terms live in sport profiles / fixtures / examples, never here.
- Field-presence validation (tenantId, actor.userId, seasonId, idempotencyKey, and reason
  for high-risk actions) is performed by the **domain boundary**, so the kernel/domain
  remains the single source of validation truth.

### Idempotency

- Preferred: the `Idempotency-Key` **HTTP header**.
- Also accepted: a body `idempotencyKey`.
- If **both** are present and **differ**, the request is **rejected (400)** — a caller can
  never accidentally submit two keys for one logical action.
- If neither is present, the domain's required-field validation rejects it (400).

### Caller-supplied guard facts are rejected

A request body containing a `facts` field is **rejected (400)**. Guard outcomes derive from
**persisted domain state** (`DomainBackedAffiliationGuardRepository` over the `affiliation.*`
tables), never from caller payloads. Accepting facts over HTTP would let a caller influence
guards — explicitly disallowed.

## Response contract

Success/known-outcome bodies are the **stable domain response DTO** plus a generated
`requestId` (and `correlationId` when supplied). Raw DB rows and SQL are never returned.

| Outcome | HTTP status | Body `status` |
| --- | --- | --- |
| Executed (incl. idempotent replay) | `200` | `executed` |
| Approval required (no state mutation) | `202` | `approval_required` |
| Rejected — permission denied | `403` | `rejected` (`code: PERMISSION_DENIED`) |
| Rejected — guard failure | `409` | `rejected` (`code: GUARD_FAILED`, `failedGuards: [...]`) |
| Rejected — other governed code | `409` | `rejected` |

### Error mapping (thrown `AppError`)

The kernel **returns** permission/guard rejections as `rejected` DTOs (mapped above). It
**throws** for fail-closed conditions, which the adapter maps as follows:

| `AppError.code` | HTTP status | Typical cause |
| --- | --- | --- |
| `INVALID_INPUT` | `400` | missing required field, unknown action/command, idempotency-key mismatch, oversized/invalid JSON, `facts` present |
| `PERMISSION_DENIED` | `403` | (if ever thrown) |
| `UNKNOWN_TRANSITION` | `409` | known command, but invalid from the current state (state conflict) |
| `GUARD_FAILED` | `409` | (if ever thrown) |
| `IDEMPOTENCY_CONFLICT` | `409` | replay with conflicting payload |
| `NOT_IMPLEMENTED` | `501` | unimplemented dependency |
| `UNKNOWN_GUARD` / `TENANT_CONTEXT_MISSING` / `CONFIG_ERROR` | `500` | server misconfiguration / fail-closed |
| anything else (non-`AppError`, e.g. raw SQL/driver error) | `500` | collapsed to an opaque `INTERNAL` body — internals never leak |

**Distinction chosen and documented:** an **unknown action/command** (not one of the ten
verbs) is `400` (a non-existent endpoint/command — fail closed), while a **known command
that is invalid from the current state** surfaces as `UNKNOWN_TRANSITION` → `409` (a state
conflict).

Error bodies are `{ "status": "error", "code", "message", "requestId" }`. `AppError`
messages are platform-authored and NSO-generic (safe to surface); unexpected errors return
a generic `INTERNAL` / "Internal server error." body.

## Dependency composition

The composition root ([src/http/composition.ts](../../src/http/composition.ts)) wires the
production graph in one place:

```
HTTP adapter (server.ts / AffiliationHttpAdapter.ts)
  → AffiliationApplicationService            (domain command boundary)
    → GovernanceKernel.transition()          (sole authority for governed transitions)
      → PgGovernanceStore                     (governed tables + transactional outbox, RLS)
      → GuardRegistry + registerAffiliationGuards(
          DomainBackedAffiliationGuardRepository(PgAffiliationApplicationStore))
                                              (guards read PERSISTED domain facts)
```

`createAffiliationHttpServer({ executor })` builds (but does not start) a native Node
`http.Server`; the caller owns `listen()`, so the same factory serves dev, prod, and tests.

## Why this does not weaken the kernel

- The adapter's only collaborator is `executeCommand` on the boundary; it holds no store /
  transaction / kernel reference and cannot perform governed writes.
- It calls the boundary **exactly once** per request and derives all outcome state from the
  returned DTO — it never invents state.
- Validation, permission checks, guard evaluation, idempotency enforcement, tenant/RLS
  isolation, audit/evidence/outbox writes all remain inside the kernel transaction.

## Intentional stubs / out of scope (future passes)

- **Edge authentication/authorization** is not implemented. The adapter trusts the parsed
  `actor` / `tenantId`. A real deployment must terminate auth in front of this adapter
  (gateway / identity) and derive these from verified claims.
- **Outbox publishing** still uses the Noop Service Bus publisher (no real broker in v1).
- No real **document/blob evidence storage**, **workflow executor**, or **payment processor**.
- No **local/demo runtime script** (no `listen()` bootstrap / npm script) — recommended as
  the next pass.
- `/readyz` does not yet perform a deep dependency (DB) probe.
- No frontend.
