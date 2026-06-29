# Two-Tier Review Workflow Metadata

Status: implemented (Pass G). Scope: AffiliationApplication v1.

## Why metadata, not new FSM states

The AffiliationApplication lifecycle FSM (see
[governance-kernel-fsm-slice.md](governance-kernel-fsm-slice.md)) is intentionally small and
deterministic: `draft → submitted → under_review → approved/rejected → …`. Multi-step review
routing (a regional body signs off, then a national body signs off) is an **organizational
process around a pending decision**, not a new lifecycle status of the application itself.

Modelling each review tier as an FSM state (e.g. `regional_review`, `national_review`,
`more_info_needed`) would:

- explode the state model combinatorially as tiers/branches grow,
- entangle governance lifecycle rules with org-chart routing,
- and tempt domain code to drive review by mutating governed state directly.

Instead, two-tier review is recorded as **metadata attached to the approval-required
`transition_request`**. The application stays in `under_review` the entire time the review is
in flight. The FSM is unchanged; there is no `regional_review`/`national_review`/
`more_info_needed` state.

## Generic regional → national model

All vocabulary is **NSO-generic**. Platform core knows only two tiers:

| Generic tier      | Step code          | Default required | Default role key      |
| ----------------- | ------------------ | ---------------- | --------------------- |
| `regional_review` | `regional_signoff` | yes              | `regional_reviewer`   |
| `national_review` | `national_signoff` | yes              | `national_reviewer`   |

Sport profiles map their own bodies onto these tiers **outside** platform core (e.g. a sport
may treat its provincial/territorial member bodies as `regional_review` and its national body
as `national_review`). Sport- or organization-specific terminology must never appear in
`src/governance/workflow/` — a unit test scans the module to enforce this
(`tests/unit/governance/workflow/workflow-no-domain-leak.test.ts`).

The plan is produced by `AffiliationWorkflowPlanner` (a pure, side-effect-free
`WorkflowPlanner`). v1 is static: every approval-required AffiliationApplication transition
(`approve`, `reject`, `suspend`, `reinstate`, `revoke`) gets the same two-step
regional → national plan.

## Database tables (`db/migrations/0005_workflow_metadata.sql`)

- `governance.workflow_instance` — one review workflow per approval-required
  `transition_request` (`UNIQUE (tenant_id, transition_request_id)`). Tracks the aggregate
  `status` (`pending` | `approved` | `rejected` | `cancelled`) and `current_step_code`.
- `governance.workflow_step` — ordered steps (`step_order`), each with its generic
  `review_tier`, `required` flag, optional generic assignment (`assigned_scope_type/_id`,
  `assigned_role_key`), and decision outcome (`status`, `decided_by_user_id`, `decided_at`,
  `decision_reason`). `UNIQUE (tenant_id, workflow_instance_id, step_code)`.
- `governance.workflow_decision` — append-only audit row per recorded step decision.

### RLS

All three tables are tenant-owned: `ENABLE` + `FORCE ROW LEVEL SECURITY` keyed on
`governance.current_tenant_id()` (defined in `0001`, raises `TENANT_CONTEXT_MISSING` when
`app.tenant_id` is unset, i.e. **fail closed**). `workflow_instance` and `workflow_step` are
mutable (SELECT/INSERT/UPDATE policies); `workflow_decision` is append-only (SELECT/INSERT
only). No DELETE policy anywhere. Grants to the restricted `house_app` role are applied
conditionally.

## Kernel integration (atomic creation)

Workflow creation is **kernel-owned and atomic** — there is no standalone "create workflow"
API. In the approval-required branch, after the kernel inserts the `transition_request`, it
calls the optional injected `workflowPlanner`. If a plan is returned, the kernel persists the
`workflow_instance` (with `current_step_code` = first step) and the ordered `workflow_step`
rows via two new `GovernanceTx` methods (`insertWorkflowInstance`, `insertWorkflowSteps`) — in
the **same transaction** as the request. The `TransitionResult` then carries
`workflowInstanceId`.

This guarantees a workflow can never exist without its governing request, and that creating
review metadata never mutates `entity_state`, never enqueues outbox messages, and never
executes the pending transition.

When no planner is configured (or it returns no plan), approval-required transitions behave
exactly as before.

## Recording decisions

`WorkflowDecisionService.recordDecision()` records a single reviewer decision on the step
currently awaiting one and advances the workflow, inside a tenant-scoped transaction
(PostgreSQL locks the instance `FOR UPDATE`):

- `approve` → mark the step approved; advance `current_step_code` to the next required pending
  step, or mark the whole instance `approved` when none remain.
- `reject` → mark the step rejected; mark the whole instance `rejected` (review stops).

It **fails closed** (`AppError`) on: unknown instance (`WORKFLOW_NOT_FOUND`), unknown or
out-of-order step (`WORKFLOW_STEP_UNKNOWN`), an already-decided step/workflow
(`WORKFLOW_ALREADY_DECIDED`), or an invalid decision value (`WORKFLOW_INVALID_DECISION`).

Crucially, recording decisions **never** mutates governance `entity_state` and **never** calls
`GovernanceKernel.transition()`. Even when both tiers approve, the workflow simply becomes
`approved` — turning that into an executed lifecycle transition is deliberately left to a
future pass.

## Out of scope (intentionally not built in this pass)

- HTTP endpoints for submitting review decisions (next pass).
- Auto-execution of the pending transition once a workflow is `approved`.
- A `more_info_needed` lifecycle state or any new FSM states.
- Frontend review screens / dashboards.
- Reviewer notifications, SLA timers, escalation, or delegation rules.
- A configurable/per-tenant workflow builder (v1 plan is static).
- Sport- or organization-specific tier naming inside platform core.
