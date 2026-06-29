# Workflow decision HTTP endpoints

## Purpose

Reviewers need a way to approve or reject a two-tier review **step** over HTTP. This pass adds
exactly one narrow endpoint that records a single reviewer decision through the existing
[`WorkflowDecisionService`](../../src/governance/workflow/WorkflowDecisionService.ts).

This is **HTTP transport only**. The endpoint records review **metadata**. It deliberately does
**not** change any governed lifecycle state — see [Why lifecycle state does not change](#why-lifecycle-state-does-not-change).

## Route contract

```
POST /v1/workflows/:workflowInstanceId/steps/:stepCode/decision
```

- `:workflowInstanceId` — the workflow instance id (authoritative over any body value).
- `:stepCode` — the step being decided, e.g. `regional_signoff` or `national_signoff`.
- Only `POST` is accepted; other methods return `405`.
- The route is served **only when the workflow transport is wired**; otherwise it returns `404`.

### Request body

```json
{
  "decision": "approve",
  "reason": "optional free-text reason"
}
```

- `decision` is required and must be `approve` or `reject` (validated authoritatively by the
  service).
- `reason` is optional; when present it is preserved on both the step and the append-only
  decision row.
- The body carries **only** the decision. Any `actor`/`tenantId` field in the body is
  **ignored** — identity never comes from the body on this surface.

### Response

`200 OK`

```json
{
  "status": "recorded",
  "workflowInstanceId": "…",
  "workflowStatus": "pending",
  "currentStepCode": "national_signoff",
  "decidedStepCode": "regional_signoff",
  "decision": "approve",
  "requestId": "…"
}
```

- `workflowStatus` is the aggregate workflow status **after** the decision: `pending`,
  `approved`, `rejected`, or `cancelled`.
- `currentStepCode` is the next step awaiting a decision, or `null` when the workflow is fully
  resolved (final approval or any rejection).
- Raw database rows are never exposed; the response is a stable projection of
  `WorkflowDecisionOutcome`.

## Auth behavior

Identity is resolved by the existing edge-identity adapter
([`AuthContextResolver`](../../src/http/auth/AuthContextResolver.ts)) and is **always** carried
in the shared `x-house-*` trusted-header contract, in **both** modes:

- **`trusted_headers`** — tenant and actor are derived from headers a verifying edge injects
  (`x-house-tenant-id`, `x-house-actor-user-id`, …). Body-supplied identity is rejected.
- **`demo`** (local/dev only) — identity is synthesized from the same `x-house-*` headers
  (trusted without verification), mirroring the evidence adapter. The decision body carries no
  identity.

Rules:

- `tenantId` comes from the auth context and is passed to the decision service / store, which
  applies it as the RLS tenant context.
- `actorUserId` comes from the auth context (`x-house-actor-user-id`).
- A missing tenant or actor identity maps to `401`.
- Body `actor`/`tenantId` are ignored (never read on this surface).
- No sport-specific identity fields are required or accepted.

This is **not** JWT/Entra validation. A real deployment must still terminate authentication in
front of this adapter so the trusted headers can be trusted (tracked as a future pass).

## Decision behavior

The endpoint delegates to `WorkflowDecisionService.recordDecision`, which records the decision
as metadata and advances the two-tier review:

- The decision must target the step currently awaiting a decision (`currentStepCode`).
- **approve** marks the step approved and advances to the next required pending step; when no
  further required step remains the whole workflow becomes `approved`.
- **reject** marks the step rejected and the whole workflow `rejected` (review stops).
- The decision is appended to the immutable `governance.workflow_decision` table.

The service fails **closed**: unknown instance, unknown/out-of-order step, an already-decided
workflow, or an invalid decision value all raise an error and write nothing.

## Why lifecycle state does not change

A workflow becoming `approved` is **not** the same as the affiliation application being
approved. This endpoint:

- never mutates `governance.entity_state`,
- never executes the pending transition,
- never calls `GovernanceKernel.transition()`.

Even when both review tiers approve, the affiliation application stays in `under_review`.
Turning an approved workflow into an executed lifecycle transition is a separate, explicit
**governed** pass (the kernel remains the sole authority for lifecycle state). This separation
keeps reviewer sign-off auditable as metadata while preserving the kernel's exclusive control
over governed state.

## Relationship to `transition_request`

The workflow instance was created **atomically** by the Governance Kernel inside the same
transaction that created the approval-required `transition_request` (see
[workflow-metadata-two-tier-review.md](./workflow-metadata-two-tier-review.md)). This endpoint
operates only on that already-existing workflow; it never creates workflows and never touches
the transition request. The pending request remains pending until a future governed execution
pass acts on it.

## Error mapping

| Condition                                              | Error code                 | HTTP |
| ------------------------------------------------------ | -------------------------- | ---- |
| Malformed body / missing `decision` / missing path arg | `INVALID_INPUT`            | 400  |
| Invalid `decision` value (not approve/reject)          | `WORKFLOW_INVALID_DECISION`| 400  |
| Missing tenant/actor identity                          | `UNAUTHENTICATED`          | 401  |
| Identity rejected at the edge / tenant conflict        | `FORBIDDEN` / `PERMISSION_DENIED` | 403 |
| Unknown workflow instance                              | `WORKFLOW_NOT_FOUND`       | 404  |
| Unknown step / not the step awaiting a decision        | `WORKFLOW_STEP_UNKNOWN`    | 409  |
| Workflow or step already decided                       | `WORKFLOW_ALREADY_DECIDED` | 409  |
| Anything unexpected (e.g. a raw driver error)          | opaque `INTERNAL`          | 500  |

Mapping choices (the service emits one code for two cases, so the adapter maps deterministically):

- **Unknown workflow → 404**, **unknown/out-of-order step → 409.** The instance not existing is
  a not-found; a step that is unknown or is not the one currently awaiting a decision is a
  **conflict** with the current workflow state, so both surface as `409`.
- Internal/`AppError`s collapse to an opaque `500` so no internal detail leaks.

## Out of scope (intentional stubs)

- Frontend review screens / any UI.
- Notification delivery (email, webhooks, in-app).
- Auto-execution of an approved workflow into a lifecycle transition.
- SLA / escalation timers.
- Delegation / reassignment rules.
- A configurable per-tenant workflow builder (v1 plan is static two-tier).
- JWT/Entra token validation (the adapter trusts the edge).
