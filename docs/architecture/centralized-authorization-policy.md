# Centralized authorization policy

## Purpose

Several HTTP/admin/security surfaces previously each carried their **own** inline role/permission
check (workflow read, evidence quarantine read, evidence quarantine disposition), and the workflow
**decision** and **execution** surfaces had no edge authorization gate at all. This pass
consolidates those checks into a single, small, testable **authorization policy** under
[`src/authz`](../../src/authz) and routes every affected endpoint through it.

The refactor does **not** change endpoint behavior, response shapes, status codes (other than
making denials consistently `403`), JWT claim mapping, RLS, or any governed lifecycle semantics.

## Three distinct layers — do not conflate

| Layer | Responsibility | Lives in |
| --- | --- | --- |
| **Authentication** | Resolves *who* the actor is: `tenantId` + `actor` (roleKeys, permissionKeys). | `src/http/auth/*` (resolvers) |
| **Authorization policy** *(this pass)* | Decides whether an **authenticated** actor may perform a **named operation**, using only `roleKeys` + `permissionKeys`. Pure, deterministic, no I/O. | `src/authz/*` |
| **Governance lifecycle enforcement** | Decides whether a governed **state transition** may occur (permission + guards + versioned policy). Authoritative for lifecycle. | Governance Kernel (`src/governance/*`) |

The authorization policy is an **edge gate**. It never mutates governed state and **never replaces
the Governance Kernel's permission/guard checks**. For the workflow execution endpoint in
particular, the policy gate runs *before* the executor, but the kernel still independently enforces
the lifecycle transition permission and guards.

## Actions

Actions are NSO-generic named operations (no sport-specific verbs/entities). The catalog lives in
[`AuthorizationActions.ts`](../../src/authz/AuthorizationActions.ts):

| Action | Surface |
| --- | --- |
| `workflow.read` | List/inspect workflow instances (read-only admin surfaces) |
| `workflow.decide` | Record a workflow step decision (approve/reject metadata) |
| `workflow.execute` | Execute an approved transition |
| `evidence.read` | Read evidence objects *(reserved — see deferred below)* |
| `evidence.upload` | Upload evidence objects *(reserved — see deferred below)* |
| `evidence.download` | Download evidence objects *(reserved — see deferred below)* |
| `evidence.quarantine.read` | List/inspect quarantine events |
| `evidence.quarantine.disposition` | Record a quarantine disposition (reviewed/released/discarded) |

## Role → action mappings

Defined in `ROLE_ACTION_MAP` (and the `platform_admin` wildcard) in
[`AuthorizationActions.ts`](../../src/authz/AuthorizationActions.ts):

| Role | Actions |
| --- | --- |
| `workflow_reader` | `workflow.read` |
| `regional_reviewer` | `workflow.read`, `workflow.decide` |
| `national_reviewer` | `workflow.read`, `workflow.decide` |
| `reviewer` | `workflow.read`, `workflow.decide`, `workflow.execute` |
| `approver` | `workflow.read`, `workflow.decide`, `workflow.execute` |
| `workflow_admin` | `workflow.read`, `workflow.decide`, `workflow.execute` |
| `security_reviewer` | `evidence.quarantine.read`, `evidence.quarantine.disposition` |
| `security_admin` | `evidence.quarantine.read`, `evidence.quarantine.disposition` |
| `evidence_admin` | `evidence.read`, `evidence.upload`, `evidence.download` |
| `platform_admin` | **all known actions** (the only wildcard) |

`reviewer` and `approver` are the generic, kernel-aligned reviewer-class roles; they are mapped so
that the centralized policy preserves the pre-existing behavior in which a reviewer-class actor
could drive the approved-transition execution they were authorized for.

## Precedence and fail-closed behavior

`authorize(actor, action)` (see [`AuthorizationPolicy.ts`](../../src/authz/AuthorizationPolicy.ts))
returns an `AuthorizationDecision { allowed, action, reason }` and **never throws**. Precedence:

1. **Exact permission key** present in `actor.permissionKeys` → allowed (`reason: 'permission'`). Authoritative.
2. **`platform_admin`** role present → allowed (`reason: 'platform_admin'`).
3. A **mapped role** grants the action → allowed (`reason: 'role'`).
4. Otherwise → denied (`reason: 'missing_permission'`).

Fail-closed inputs that always **deny**: a missing actor, a missing/unknown action, and empty
role + permission lists.

`assertAuthorized(authContext, action)` is the helper HTTP adapters call after authentication. It
throws [`AuthorizationDeniedError`](../../src/authz/AuthorizationErrors.ts) (HTTP `403`,
`ErrorCode.FORBIDDEN`) when denied and returns `void` when allowed. The thrown message contains
only the non-secret action name — it never leaks role lists, permission keys, tokens, or claim
payloads. The richer `reason` is available to internal callers/tests via `authorize`.

## Endpoint mappings

| Endpoint | Adapter | Action |
| --- | --- | --- |
| `GET /v1/workflows`, `GET /v1/workflows/:id` | `WorkflowReadHttpAdapter` | `workflow.read` |
| `POST /v1/workflows/:id/steps/:code/decision` | `WorkflowHttpAdapter` | `workflow.decide` *(added)* |
| `POST /v1/workflows/:id/execute` | `WorkflowExecutionHttpAdapter` | `workflow.execute` *(added)* |
| `GET /v1/evidence/quarantine`, `GET .../:id` | `EvidenceQuarantineHttpAdapter` | `evidence.quarantine.read` |
| `POST /v1/evidence/quarantine/:id/disposition` | `EvidenceQuarantineHttpAdapter` | `evidence.quarantine.disposition` |

Denials map to `403 FORBIDDEN`; missing authentication stays `401 UNAUTHENTICATED`.

## Deferred: evidence upload/download authorization

The evidence object upload/download surfaces currently enforce **authentication + tenant ownership
+ integrity** only — they have no per-action role/permission gate, and existing local/demo tests and
fixtures rely on that. Introducing `evidence.upload` / `evidence.download` gates here would change
that established behavior broadly. The `evidence.read` / `evidence.upload` / `evidence.download`
actions and the `evidence_admin` mapping are therefore **defined but not yet wired** at those
endpoints. Wiring them is a deliberate, separate decision.

## Out of scope (intentionally not built)

- DB-backed RBAC tables / dynamic role catalog (the v1 map is static, in-code).
- Role administration UI or APIs.
- SCIM / user provisioning.
- Tenant-specific policy builder or per-tenant overrides.
- Delegated administration.
- A policy audit/decision dashboard.

These remain future work; the v1 policy is deliberately a small, NSO-generic, static layer.
