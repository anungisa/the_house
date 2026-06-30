# Approved-workflow transition execution

## Purpose

A two-tier review can reach an **approved** workflow, but recording that approval deliberately
does **not** change any governed lifecycle state (see
[workflow-decision-http-endpoints.md](./workflow-decision-http-endpoints.md) →
"Why lifecycle state does not change"). This pass closes the loop: it adds a single, **explicit**
way to execute the transition that the approved workflow was about — driving the **original
pending transition** through the Governance Kernel **exactly once**.

Approval and execution are **two separate steps on purpose**:

- **Decision** records review *metadata* (who approved which step). It is append-only and
  never mutates governed state.
- **Execution** performs the governed lifecycle transition. It is an explicit command and is
  **never** a side effect of recording a decision.

This separation keeps the kernel the sole authority for lifecycle changes, keeps execution
idempotent and auditable, and lets the review surface and the execution surface evolve
independently.

## Route contract

```
POST /v1/workflows/:workflowInstanceId/execute
```

- `:workflowInstanceId` — the **approved** workflow instance to execute.
- Only `POST` is accepted; other methods return `405`.
- The route is served **only when the execution transport is wired**; otherwise it returns `404`
  (no accidental exposure).

### Idempotency key (required)

An execution command **must** carry an idempotency key (exactly-once execution):

- Preferred: the `Idempotency-Key` request header.
- Fallback: a body field `idempotencyKey`.
- If **both** are present and **differ**, the request is rejected with `400`.
- If **neither** is present, the request is rejected with `400` (the key is never silently
  generated).

### Request body

```json
{
  "reason": "optional free-text reason",
  "correlationId": "optional trace id",
  "idempotencyKey": "optional — prefer the Idempotency-Key header"
}
```

The body carries **only** these optional fields. Any `actor`/`tenantId` in the body is
**ignored** — identity comes exclusively from the trusted `x-house-*` headers, exactly as on the
decision surface.

### Response

`200 OK`

```json
{
  "status": "executed",
  "workflowInstanceId": "…",
  "transitionRequestId": "…",
  "entityType": "AffiliationApplication",
  "entityId": "…",
  "trigger": "approve",
  "fromState": "under_review",
  "toState": "approved",
  "stateTransitionId": "…",
  "idempotentReplay": false,
  "requestId": "…"
}
```

- `idempotentReplay` is `true` when this call **replayed** a previously-executed transition for
  the same idempotency key (no new mutation occurred). It is `false` on first execution.
- Raw database rows are never exposed; the response is a stable projection of the kernel's
  `ExecuteApprovedTransitionResult`.

## Auth behavior

Identity is resolved by the shared edge-identity adapter and the shared workflow auth helper
([`workflowHttpAuth`](../../src/http/workflow/workflowHttpAuth.ts)), identically to the decision
surface: tenant and actor come **only** from the `x-house-*` trusted-header contract in both
`trusted_headers` and `demo` modes. A missing tenant or actor identity fails closed with `401`.

The execution **actor** (not the reviewers who recorded the decisions) is the one whose
permission the kernel re-checks at execution time.

## What execution does (kernel-governed, one transaction)

The HTTP adapter is a thin transport over
[`ApprovedWorkflowExecutionService`](../../src/governance/workflow/ApprovedWorkflowExecutionService.ts),
which maps the workflow **instance** id to its governing **transition request** id and calls
[`GovernanceKernel.executeApprovedTransitionRequest`](../../src/governance/kernel/GovernanceKernel.ts).
The service performs **no** governed writes itself. Inside one database transaction the kernel:

1. Locks the transition request `FOR UPDATE` (serializes concurrent executions).
2. Fails closed if the request is unknown (`404 TRANSITION_REQUEST_NOT_FOUND`).
3. Replays idempotently if the request is already `executed` **and** a journal row exists for
   the same idempotency key; a **different** key against an already-executed request is a
   `409 IDEMPOTENCY_CONFLICT`.
4. Re-verifies that an **approved** review workflow exists for the request
   (`409 WORKFLOW_NOT_APPROVED` otherwise) — the service's pre-check is only fast feedback.
5. Re-resolves the active policy and locks the current `entity_state`; if the current state no
   longer matches the approved transition's source/target, it fails closed with
   `409 TRANSITION_STATE_CONFLICT`.
6. **Re-checks the execution actor's permission** (denies with `403` otherwise).
7. **Re-runs the registered guards** against the **recorded request payload** and the execution
   context; any failing guard fails closed with `409 GUARD_FAILED` and **no** mutation.
8. Updates `entity_state`, appends the immutable `state_transition` (linked to the request),
   appends the `transition.executed` audit event, writes evidence metadata for evidence-required
   transitions, and enqueues the outbox message — all atomically.
9. Marks the transition request `executed` (`status='executed'`, plus `executed_at`,
   `executed_by_user_id`, `execution_state_transition_id`).

External side effects (Service Bus, webhooks, email) never happen inside this transaction; they
flow only through the transactional outbox after commit, exactly as for direct transitions.

## Idempotency & concurrency

- The journal (`state_transition`) is keyed by the **execution command's** idempotency key.
  Re-executing with the **same** key replays the prior result; a **different** key after
  execution is a conflict.
- The `FOR UPDATE` lock on the transition request serializes concurrent executions, so a race
  cannot double-mutate.
- The outbox dedupe key is `:{entityType}:{entityId}:{executionIdempotencyKey}`, so a replay
  never enqueues a duplicate message.

## Error mapping

| Condition | `ErrorCode` | HTTP |
| --- | --- | --- |
| Missing/invalid input (incl. idempotency key) | `INVALID_INPUT` | 400 |
| No tenant/actor identity | `UNAUTHENTICATED` | 401 |
| Execution actor not permitted | `PERMISSION_DENIED` / `FORBIDDEN` | 403 |
| Unknown workflow instance | `WORKFLOW_NOT_FOUND` | 404 |
| Unknown transition request | `TRANSITION_REQUEST_NOT_FOUND` | 404 |
| Workflow not approved | `WORKFLOW_NOT_APPROVED` | 409 |
| Entity state drifted from the approved transition | `TRANSITION_STATE_CONFLICT` | 409 |
| A guard failed at execution | `GUARD_FAILED` | 409 |
| Different idempotency key after execution | `IDEMPOTENCY_CONFLICT` | 409 |
| No active policy / transition resolvable | `UNKNOWN_TRANSITION` | 409 |
| Anything else | opaque | 500 |

## Data model

Migration [`0006_workflow_execution_status.sql`](../../db/migrations/0006_workflow_execution_status.sql)
is **additive only**: it adds audit columns to `governance.transition_request`
(`executed_at`, `executed_by_user_id`, `execution_state_transition_id`). The `status` check
constraint already permitted `executed` (from migration `0001`), so no constraint or value
domain changed. `executed_by_user_id` is `text` to match the existing `actor_user_id` column.

## Out of scope (intentional)

- **No auto-execution** from the decision endpoint — execution is always an explicit call.
- No frontend or admin review/execute UI.
- No notifications, SLA timers, escalation, or reminder workflows.
- No generic workflow/rule builder; no new FSM states.
- No JWT/Entra token validation — identity still terminates at a verifying edge that injects the
  trusted headers.
