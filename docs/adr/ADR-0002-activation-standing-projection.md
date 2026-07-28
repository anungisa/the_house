# ADR-0002 — Activation → Standing Cross-Aggregate Projection

## Status

Proposed

## Context

When an `AffiliationApplication` reaches the `active` state, a corresponding governed
`AffiliationStanding` must be established (opened) so that downstream representative-facing and
institutional views have a first-class standing record to reason about (validity period, renewal,
clearance, lifecycle).

`AffiliationApplication` and `AffiliationStanding` are **distinct governed aggregates**, each with
its own lifecycle owned by the Governance Kernel. The activation transition and the standing `open`
transition are therefore **two separate governed transactions** — they cannot share a single
kernel transaction without one aggregate mutating another aggregate's governed state, which the
platform forbids.

We need a way to reliably establish the standing after activation **without**:

- letting the activation domain directly open or mutate the standing,
- coupling the two transactions into one (which would break aggregate boundaries and the kernel's
  single-aggregate transaction model),
- losing the standing if the projection is briefly delayed, retried, or duplicated,
- minting duplicate standings under at-least-once delivery or concurrent workers.

The Governance Kernel already writes an `AffiliationApplication.activate` message to the
transactional **outbox** inside the same transaction as the activation. That committed event is the
durable trigger for establishing the standing.

## Decision

Establish the standing through an **asynchronous, at-least-once, idempotent, reconcilable
projection** driven by the activation outbox event, and open the standing **only** through the
Governance Kernel.

Concretely:

1. **Trigger** — the committed `AffiliationApplication.activate` outbox event.
2. **Discovery** — a cross-tenant `SECURITY DEFINER` function
   `affiliation_standing.list_pending_standing_activations(integer)` finds activation events that do
   not yet have a completed standing projection. The projection worker runs across all tenants with
   no tenant context; a non-`BYPASSRLS` application role cannot read tenant-owned rows directly, so
   this narrow, read-only function is the explicit cross-tenant surface (mirroring the outbox
   worker's cross-tenant pattern). It resolves the affiliation **subject**
   (`COALESCE(scope_id, local_organization_id, organization_id)`) and season using the same subject
   definition the affiliation guards/serialization use.
3. **Deterministic identity** — the standing id is a **UUID v5 of `tenant:subject:season`**, so
   every replay resolves to the SAME standing identity without coordination. The kernel idempotency
   key for the `open` transition is derived from that identity.
4. **Governed open** — the orchestrator requests the standing `open` transition through the kernel
   in a per-tenant governed transaction (RLS enforced). The kernel's own idempotency (stable key)
   guarantees a replay returns the prior result rather than opening a second standing.
5. **Reconcilable bookkeeping** — an `affiliation_standing.standing_projection` row per
   `(tenant_id, affiliation_application_id)` (UNIQUE) records the projection outcome: `projected`,
   `failed` (governed rejection or retries exhausted — terminal, never auto-retried), or `pending`
   (retry scheduled with true full jitter). This table is NOT a second source of truth for governed
   state; it exists so support/reconciliation can see every activation that has not yet produced a
   standing and why.

The activation stays committed even if the standing projection is delayed. This is explicitly
**not** atomic exactly-once establishment; it is at-least-once and **reconcilable**.

## Idempotency / No Duplication

- One projection row per `(tenant, application)` via `ON CONFLICT` upsert — a duplicated event
  never creates a second bookkeeping row.
- Deterministic standing id + stable kernel idempotency key — a duplicated or concurrent open
  resolves to the SAME standing (kernel replay), never a second standing.
- Concurrency-safe **without a lease/inbox table**: parallel workers both call `openStanding`
  (kernel-idempotent) and both upsert the projection; the last writer wins on bookkeeping while the
  governed standing remains singular.
- Two DIFFERENT applications for the same subject+season converge on the SAME standing (same
  deterministic id → kernel replay → `projected`), rather than conflicting.

## Consequences

Positive:

- Aggregate boundaries are preserved: the activation domain never mutates standing state; the
  standing is opened only through the kernel.
- Durable and self-healing under at-least-once delivery, retries, and worker concurrency.
- Reconciliation has an explicit, tenant-scoped view of unestablished/failed projections.
- No new leasing infrastructure and only ONE additional cross-tenant `SECURITY DEFINER` surface.

Negative / accepted trade-offs:

- Establishment is eventually consistent, not atomic with activation. A standing may lag its
  activation briefly.
- A governed rejection of `open` (e.g. permission) is terminal and surfaced for reconciliation
  rather than silently retried.

## Follow-ups (intentional stubs)

- The worker **runtime host** (interval loop / function entrypoint) is a deliberate follow-up; the
  `processBatch()` entrypoint is implemented and exercised directly.
- `pathway` defaults to `new_affiliation` and the effective period is clock-derived
  (`now → now + 365d`) pending an authoritative policy source.
