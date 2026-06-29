# AffiliationApplication Domain API Boundary

Status: implemented (v1)
Scope: `src/domains/affiliation/` — the first domain module and first consumer of the
Governance Kernel.

## Purpose

Give consumers a thin, typed, NSO-generic request/service layer to reach the Governance
Kernel for `AffiliationApplication` lifecycle changes — **without** allowing callers to
bypass the kernel.

The governed path is:

```
external request DTO
  → AffiliationApplicationService command
    → AffiliationApplicationMapper (DTO → TransitionInput)
      → GovernanceKernel.transition()   ← the ONLY place governed state changes
    → AffiliationApplicationMapper (TransitionResult → response DTO)
  → typed response DTO
```

## Why this is not a frontend or an API server

This boundary is intentionally transport-agnostic:

- No HTTP server, no web framework (no Express/Fastify/Nest).
- No UI, no routing, no serialization framework.

`handleAffiliationApplicationTransition(service, command, request)` is the single entry
point a future transport adapter (HTTP route, message consumer, CLI, test harness) would
call. The adapter owns parsing/authn and maps the returned response DTO — or a thrown
`AppError` — onto its own protocol. Building that adapter is a later pass, not part of
this slice.

## What the boundary must never do

The boundary has no store/transaction access, so by construction it cannot:

- update `entity_state` / status fields directly,
- bypass or duplicate the kernel's transition logic,
- evaluate guards,
- write audit / evidence / outbox rows,
- call external services,
- enforce its own permissions / tenant isolation / idempotency.

All of that remains the Governance Kernel's responsibility.

## Command → trigger mapping

Each command maps to exactly **one** kernel-resolved FSM trigger. The boundary never
invents new triggers or states. (`AFFILIATION_APPLICATION_COMMANDS`)

| Command                          | Trigger        |
| -------------------------------- | -------------- |
| `submitAffiliationApplication`   | `submit`       |
| `startAffiliationReview`         | `review_start` |
| `approveAffiliationApplication`  | `approve`      |
| `rejectAffiliationApplication`   | `reject`       |
| `activateAffiliationApplication` | `activate`     |
| `suspendAffiliationApplication`  | `suspend`      |
| `reinstateAffiliationApplication`| `reinstate`    |
| `revokeAffiliationApplication`   | `revoke`       |
| `closeAffiliationApplication`    | `close`        |
| `archiveAffiliationApplication`  | `archive`      |

Unknown commands fail closed (`INVALID_INPUT`) before any kernel call.

## Request DTO

`AffiliationApplicationTransitionRequest`:

- `tenantId` (required)
- `applicationId` (required)
- `actor` — `userId` (required), optional `roleKeys`, `permissionKeys`, `scopeType`,
  `scopeId`, and NSO-generic hierarchy ids (`organizationId`, `organizationUnitId`,
  `nationalOrganizationId`, `regionalOrganizationId`, `localOrganizationId`)
- `context` — `seasonId` (required), optional `scopeType`/`scopeId`, hierarchy ids,
  `correlationId`, `causationId`
- `idempotencyKey` (required — never auto-generated; see Idempotency)
- `reason` (required for high-risk triggers)
- `facts` — intentional stub bridge to the in-memory guard repository (`payload.facts`)
- `payload` — optional opaque domain payload

Mapping notes:

- `actor.userId → TransitionActor.actorId`; `actor.roleKeys → TransitionActor.roles`.
- `scopeType` defaults to `platform` when omitted (a classification, not an authority).
- `seasonId`, `reason`, and `permissionKeys` are carried as opaque
  `context.workflowMetadata` — the v1 FSM has no season/review state, and the v1
  `DefaultPermissionChecker` uses roles only. A richer RBAC `PermissionChecker` can
  consume `permissionKeys` later.

## Response DTO

Discriminated union on `status` (`AffiliationApplicationTransitionResponse`). Raw DB rows
are never leaked.

- `executed` → `applicationId`, `fromState`, `toState`, `transitionId`, `auditEventId`,
  optional `evidenceObjectId`. (`transitionId`/`auditEventId` are present for a fresh
  execution and omitted on idempotent replay.)
- `approval_required` → `applicationId`, `transitionRequestId`, `currentState`,
  `requestedToState`, optional `workflowInstanceId` (not available in v1).
- `rejected` → `applicationId`, `code`, `message`, optional `failedGuards`.

An `idempotent_replay` kernel result is mapped to `executed` (or `approval_required` when
it carries a `transitionRequestId`) with `replayed: true`.

> Kernel change required by this slice: `TransitionResult` now surfaces
> `stateTransitionId`, `auditEventId`, and `evidenceObjectId` for executed transitions so
> the boundary can return governed-record ids for correlation. This is additive — no FSM,
> guard, or transaction-boundary change.

## Idempotency expectations

The service **requires** a caller-supplied `idempotencyKey` for every governed action and
never fabricates one. `suggestIdempotencyKey()` offers a recommended deterministic shape
but does not enforce it:

```
tenantId:AffiliationApplication:applicationId:trigger:seasonId:userId
```

Idempotency is enforced inside the kernel (pre-check, in-transaction re-check, DB unique
constraint, stable outbox dedupe key). The boundary does not duplicate that enforcement.

## How the boundary stays non-bypassable

- The service depends only on `AffiliationKernelPort.transition()` — it holds no store,
  transaction, or repository. It physically cannot mutate governed state.
- Every command funnels through one private `run()` that validates, maps, calls
  `transition()` exactly once, and maps the result back.
- Fail-closed: unknown command, missing required fields, and missing reason for high-risk
  triggers all throw `AppError` before reaching the kernel; the kernel independently fails
  closed on unknown transition / unknown guard / permission denial / guard failure.

## What remains stubbed

- `facts` → `payload.facts` is an intentional bridge to the in-memory
  `PayloadBackedAffiliationGuardRepository`; real affiliation-domain persistence will
  replace it.
- `workflowInstanceId` is never populated (no workflow engine wired in v1).
- `permissionKeys` is carried but not consumed by the v1 `DefaultPermissionChecker`.

## Next passes (out of scope here)

- Real affiliation-domain persistence behind the guard repository.
- A real Azure Service Bus publisher for the outbox processor.
- An HTTP adapter / API endpoint layer over `handleAffiliationApplicationTransition`.
- Workflow metadata for a future two-tier review / return-for-more-info flow (carried via
  `workflowMetadata` without expanding the v1 FSM).

HARD STOP: this slice ends at the boundary. No frontend, no Service Bus wiring, no new FSM
states, no generic workflow builder.
