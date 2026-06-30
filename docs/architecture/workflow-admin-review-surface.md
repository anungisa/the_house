# Workflow admin review surface

## Purpose

Operators and reviewers need a way to **work** governed review workflows — see what is awaiting
review, inspect a single workflow, record approve/reject decisions, and explicitly execute an
approved workflow — without becoming a second source of workflow truth.

This pass adds a **thin, framework-neutral admin/reviewer surface** that consumes the existing
workflow HTTP APIs. It is a **client** of the backend: it never reaches the database, never
bypasses an endpoint, never invents workflow status, and never auto-executes. The Governance
Kernel remains authoritative for every decision and for the single explicit execution.

There is no UI framework in this repository, so this pass deliberately ships the **client + view-model
layer** (typed, pure, fully unit-tested) and leaves the concrete renderer (React/Vue/Svelte/etc.)
as **future work** — see [Out of scope](#out-of-scope-intentional).

## What it is (and is not)

| It MAY                                             | It MUST NOT                                  |
| -------------------------------------------------- | -------------------------------------------- |
| list pending/resolved workflows                    | mutate lifecycle state directly              |
| show a workflow's detail and ordered steps         | call the database directly                   |
| show execution readiness (a backend hint)          | invent or infer workflow status              |
| submit approve/reject decisions via the API        | bypass the decision endpoint                 |
| execute an approved workflow explicitly via the API | bypass the execution endpoint                |
| show success/error states                          | auto-execute after a final approval          |

## Code layout

```
src/admin/workflows/
  workflowAdminTypes.ts      # NSO-generic wire types + client contracts (self-contained)
  workflowAdminClient.ts     # typed HTTP client over the workflow APIs
  workflowAdminViewModel.ts  # pure view-model helpers + list/detail view builders
  index.ts                   # public barrel
```

The admin surface is intentionally **self-contained**: it does not import backend modules. The
wire types are duplicated as stable, platform-generic projections so the surface could later be
extracted into a separate frontend package without coupling it to server internals.

## Backend APIs consumed

| Action            | Method + path                                                       |
| ----------------- | ------------------------------------------------------------------- |
| list workflows    | `GET /v1/workflows`                                                 |
| workflow detail   | `GET /v1/workflows/:workflowInstanceId`                             |
| record a decision | `POST /v1/workflows/:workflowInstanceId/steps/:stepCode/decision`   |
| execute approved  | `POST /v1/workflows/:workflowInstanceId/execute`                    |

See [workflow-admin-read-surfaces.md](./workflow-admin-read-surfaces.md),
[workflow-decision-http-endpoints.md](./workflow-decision-http-endpoints.md), and
[approved-workflow-transition-execution.md](./approved-workflow-transition-execution.md) for the
authoritative endpoint contracts.

## List behavior

`WorkflowAdminClient.listWorkflows(filters)` calls `GET /v1/workflows`, forwarding any of the
optional filters as query parameters: `status`, `entityType`, `entityId`, `reviewTier`,
`assignedRoleKey`, `limit`, `cursor`. The result is a typed page (`items` + opaque `nextCursor`).

`buildWorkflowListView(page)` produces display-ready rows that surface the workflow status, a
human status label, the current step, the execution-readiness label, and `isPending` /
`isExecutable` flags, plus an `isEmpty` flag for the empty state. Loading and error states are the
renderer's responsibility; the client distinguishes them via the `ApiResult` envelope.

## Detail behavior

`WorkflowAdminClient.getWorkflowDetail(id)` calls `GET /v1/workflows/:id`. `buildWorkflowDetailView(detail)`
returns the steps **ordered by `stepOrder`**, flags the single current actionable step, and mirrors
the backend execution hint exactly via `canExecute`. Helpers:

- `getCurrentActionableStep(detail)` / `decisionTargetStepCode(detail)` — the earliest `pending`
  step, but only while the workflow itself is `pending`; `null` once resolved.
- `canDecideStep(detail, step, actorRoleKeys?)` — true only for the current actionable step;
  when role keys are supplied and the step is role-assigned, the actor must hold that role
  (the backend re-checks authorization regardless).
- `canExecuteWorkflow(detail)` — defers **entirely** to `detail.execution.executable`.

## Decision action behavior

`recordWorkflowDecision(workflowInstanceId, stepCode, decision, reason?)` posts `{ decision, reason? }`
to the decision endpoint. The caller targets the **current pending step** (use
`decisionTargetStepCode`). `reason` is optional at the transport boundary; the renderer may
require it for `reject`. After a successful decision the UI should re-fetch the detail/list.

## Execution action behavior

`executeWorkflow(workflowInstanceId, { reason?, idempotencyKey? })` posts to the execution endpoint
and **always** sends an `Idempotency-Key` header (a key is generated when the caller omits one),
giving exactly-once execution and safe retries.

The execute action is enabled **only** when `execution.executable === true`. After a successful
execution the UI should re-fetch the detail/list and make clear the execution was explicit and
audited (the backend records the journal/audit/outbox).

### No auto-execution (hard rule)

Execution is **never** a side effect of recording the final approval. The client exposes
`executeWorkflow` as a separate, explicit method; it never chains an execute after a decision, and
the view-model never executes anything (it is pure). This is enforced by tests
(`does not auto-execute after recording a decision`, `never auto-executes`).

## Auth assumptions

Identity is injected, never hardcoded. `WorkflowAdminClientConfig.authHeaderProvider` supplies the
request authorization headers per call — an `Authorization: Bearer …` token for Microsoft Entra
(see [jwt-entra-auth-adapter.md](./jwt-entra-auth-adapter.md)), or the `x-house-*` trusted headers
in local dev (see [local-api-runtime.md](./local-api-runtime.md)). With no provider configured the
backend fails closed (`401`). Tenant scoping and RLS remain enforced server-side; the client adds
no trust.

**Bearer tokens are never logged.** The optional structured logger receives only
`{ method, path, status, code?, requestId? }` — never headers or tokens. This is enforced by a test.

## Error handling

Every client call resolves to an `ApiResult<T>` and **never throws** for non-2xx responses:

- success → `{ ok: true, data, requestId }`
- API error → `{ ok: false, status, code, message, requestId }` using the backend's stable error
  code + message (e.g. `WORKFLOW_NOT_APPROVED` → `409`)
- transport failure → `{ ok: false, status: 0, code: 'NETWORK_ERROR', message }`

The backend `requestId` is preserved on the result for support/correlation.

## Out of scope (intentional)

- A concrete UI rendering framework (React/Vue/Svelte) and its routes/components — **future work**.
- Role / permission administration.
- SCIM / user provisioning.
- A configurable workflow builder.
- A reporting / analytics warehouse.
- Production deployment / IaC.
- Advanced delegation, SLA timers, or escalation logic.
- Any new backend workflow semantics, FSM states, or a `more_info_needed` state.
