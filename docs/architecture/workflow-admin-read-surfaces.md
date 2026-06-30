# Workflow admin read surfaces

## Purpose

Authorized operators and reviewers need to **see** review work without changing anything:

- list workflow instances that are awaiting (or have completed) review, and
- inspect a single workflow — its steps, decisions, and whether it is currently executable.

This pass adds exactly two **read-only** HTTP endpoints over the existing
[`WorkflowReadStore`](../../src/governance/workflow/WorkflowStore.ts). They are **HTTP transport
only**: they never mutate governed lifecycle state, never record decisions, and never execute a
transition. The execution-readiness field they return is an operational **hint** — see
[Execution readiness is a hint](#execution-readiness-is-a-hint).

## Route contract

```
GET /v1/workflows
GET /v1/workflows/:workflowInstanceId
```

- Only `GET` is accepted; other methods return `405`.
- Both routes are served **only when the workflow read transport is wired**; otherwise `404`.
- The detail route matches a **single** trailing segment, so it never collides with the
  decision (`/v1/workflows/:id/steps/:code/decision`) or execute (`/v1/workflows/:id/execute`)
  routes, which carry more path segments.

### List query parameters

All are optional and combine with `AND`:

| Param            | Meaning                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `status`         | `pending` \| `approved` \| `rejected` \| `cancelled`                    |
| `entityType`     | governed entity type, e.g. `AffiliationApplication`                     |
| `entityId`       | a specific governed entity id                                           |
| `reviewTier`     | `regional_review` \| `national_review` (matches a step in that tier)    |
| `assignedRoleKey`| a reviewer role key, e.g. `regional_reviewer` (matches an assigned step)|
| `limit`          | page size; **default 50, maximum 100** (oversized values are clamped)   |
| `cursor`         | opaque keyset cursor returned by a previous page                        |

Invalid values (unknown `status`/`reviewTier`, non-positive `limit`, malformed `cursor`) return
`400`.

### List response

`200 OK`

```json
{
  "status": "ok",
  "items": [
    {
      "workflowInstanceId": "…",
      "transitionRequestId": "…",
      "entityType": "AffiliationApplication",
      "entityId": "…",
      "workflowType": "affiliation_two_tier_review",
      "status": "pending",
      "currentStepCode": "regional_signoff",
      "createdAt": "…",
      "updatedAt": "…",
      "execution": { "executable": false, "reason": "workflow_not_approved" }
    }
  ],
  "nextCursor": "…or null",
  "requestId": "…"
}
```

`nextCursor` is an opaque base64url token (keyset on `(createdAt, id)`); pass it back as
`?cursor=` to fetch the next page. It is `null` when the result set is exhausted.

### Detail response

`200 OK`

```json
{
  "status": "ok",
  "workflowInstanceId": "…",
  "transitionRequestId": "…",
  "entityType": "AffiliationApplication",
  "entityId": "…",
  "workflowType": "affiliation_two_tier_review",
  "workflowStatus": "pending",
  "currentStepCode": "regional_signoff",
  "createdAt": "…",
  "updatedAt": "…",
  "steps": [
    {
      "stepCode": "regional_signoff",
      "stepOrder": 1,
      "reviewTier": "regional_review",
      "required": true,
      "status": "pending",
      "assignedRoleKey": "regional_reviewer",
      "decidedByUserId": null,
      "decidedAt": null,
      "decisionReason": null
    }
  ],
  "execution": { "executable": false, "reason": "workflow_not_approved" },
  "requestId": "…"
}
```

Steps are returned in `step_order`. An unknown instance returns `404`. Raw database rows are
never exposed; responses are stable projections.

## Authentication and tenancy

- Identity is resolved by the same edge-identity resolver as the other surfaces (`demo`,
  `trusted_headers`, or `entra_jwt`); see [auth edge identity adapter](./auth-edge-identity-adapter.md)
  and [jwt entra auth adapter](./jwt-entra-auth-adapter.md).
- **Tenant comes exclusively from the resolved identity.** Query/path inputs never carry
  identity, and any `tenantId` in the query is ignored. A missing tenant identity returns `401`.
- The PostgreSQL read store applies tenant context per read, so **RLS** scopes every row to the
  caller's tenant. Reads never run without tenant context.

## Authorization (v1 workflow-read gate)

Once identity is established, the adapter enforces a narrow read gate. The actor must hold
**either**:

- the `workflow.read` permission, **or**
- one of the reader/reviewer roles: `workflow_reader`, `regional_reviewer`, `national_reviewer`.

Otherwise the request returns `403` (**fail closed**). This is a deliberately minimal gate.
Centralized role/permission policy administration — and finer-grained scoping (e.g. limiting a
regional reviewer to their own region's work) — is **future work**, not part of this pass.

## Execution readiness is a hint

Each read response embeds an `execution` block computed by the pure
[`WorkflowExecutionReadiness`](../../src/governance/workflow/WorkflowExecutionReadiness.ts) helper:

| Derived status | `executable` | `reason`                    |
| -------------- | ------------ | --------------------------- |
| `approved`     | `true`       | `null`                      |
| `pending`      | `false`      | `workflow_not_approved`     |
| `rejected`     | `false`      | `workflow_rejected`         |
| `cancelled`    | `false`      | `workflow_cancelled`        |
| `executed`     | `false`      | `workflow_already_executed` |

The `executed` status is **derived** by the read layer: a workflow instance stays `approved`
after execution, and the consumed marker lives on the governing
`transition_request.status = 'executed'`. The PostgreSQL store derives this via a `LEFT JOIN`
on `transition_request`.

This field is an **operational hint only**. It deliberately does **not**:

- query governance state, lock rows, or re-run guards;
- guarantee that a future execute call will succeed (the Governance Kernel re-resolves policy,
  re-checks permissions, re-runs guards, and re-verifies the approval atomically under a row
  lock at execution time — see [approved workflow transition execution](./approved-workflow-transition-execution.md));
- trigger execution. Execution remains the exclusive job of the explicit
  `POST /v1/workflows/:id/execute` endpoint.

## Why these surfaces are read-only

The Governance Kernel is the sole authority for lifecycle state. These endpoints exist to
**observe** review work, never to change it. Recording a decision and executing an approved
transition remain separate, explicit, governed passes. Keeping reads strictly read-only
preserves the kernel's authority and keeps audit/evidence/idempotency controls intact.

## Out of scope (intentional)

- Frontend/admin UI (no React/Vue/Svelte, no screens).
- Role/permission administration, SCIM, or user provisioning.
- Delegation, SLA timers, or escalation logic.
- A reporting/analytics warehouse or a separate read database.
- Any mutation: no decision recording, no execution, no `entity_state` changes, no new FSM
  states.
