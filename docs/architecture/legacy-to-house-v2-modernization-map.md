# Legacy-to-House v2 Modernization Map

**Status:** Alignment / documentation pass only. No code, migrations, or UI implied by this document.
**Date:** 2026-06-29
**Legacy source:** `legacy/curl-link-hub-extracted/` (Base44 export, app name "TheHouse v2")
**Purpose:** Capture what the legacy app teaches us, what must be preserved *conceptually*, and what must *not* be carried forward *architecturally*, before any House v2 scaffolding or Governance Kernel code is written.

---

## 1. Legacy app summary

- **Stack:** React 18 + Vite + Tailwind + Radix/shadcn frontend; backend is the Base44 low-code platform — JSON-schema **entities** as data models plus **Deno serverless functions** (`Deno.serve`, `@base44/sdk`). App config in `base44/config.jsonc` / `base44/.app.jsonc`.
- **Scale (approximate, as inspected):**
  - **87** entities — `base44/entities/*.jsonc`
  - **99** functions — `base44/functions/*/`
  - **129** pages — `src/pages/*.jsx`
  - **129** governance/design documents — `src/*.md`
- **Domain:** Canadian curling National Sport Organization (NSO) operations — affiliation, membership, compliance, events, finance, governance, and decision/memory intelligence for Curling Canada and its provincial/territorial bodies.
- **Organizational hierarchy:** **Curling Canada (national) → PTSO / MA (province/territory) → Club → Member.** Multi-tenancy is expressed through `org_id` + `ptso` + `club_id` fields and enforced via per-entity `rls` blocks (Mongo-style `$or` / `user_condition` rules).

This is a **mature domain reference** with extensive governance thinking already encoded in documentation and entity design — but it is a low-code prototype lineage, not a governed system-of-record implementation.

---

## 2. Legacy assets to preserve conceptually

These domain concepts are valuable and should inform v2 design, even though their *implementation* will be redesigned:

- **Application / affiliation lifecycle** (`entities/Application.jsonc`) — club affiliation intake and review flow (new affiliation, renewal, transfer), with PTSO and Curling Canada (CC) review stages, fee/insurance/bylaws checks, and tiered sign-offs. This is the seed for the v2 `AffiliationApplication` slice.
- **ApprovalTier** — the notion of staged, role-bound approval gates with sequence and required roles.
- **WorkflowStep** — phased workflow steps (`club_submission`, `ptso_review`, `cc_review`, `post_approval`) with step types (document upload, verification task, approval gate, notification), assignment, and conditional triggers.
- **Policy** — versioned governance policy records with category, owner, status, effective/review dates. Conceptually aligns with v2 versioned policy/state-machine versions.
- **Permission / Role / RolePermission / UserRole** — a scope-aware, relationship-aware, deny-by-default access model (see `functions/enforcePermission`). The *intent* (least privilege, server-side enforcement, scope checks) must be preserved.
- **AuditLog** — audit trail of governed actions. Concept preserved; implementation must become append-only and transactional.
- **DecisionInstance** — explicit decision lifecycle (`identified → prepared → recommended → decided → executed → reviewed → closed_no_go`) with baseline/result signals and precedent memory. A strong governance pattern worth keeping conceptually for later slices.
- **ComplianceRecord / ComplianceAudit** — compliance attestations and audit records that feed club standing.
- **ConsentLog** — recorded consent events for privacy/data governance.
- **OrgLifecycleEvent** — organization-level lifecycle events (provisioning, status changes) across the tenant hierarchy.
- **Affiliation Migration Doctrine / Goodwill Baseline** (`src/AFFILIATION_MIGRATION_DOCTRINE.md`) — the principle that **historical affiliation is inherited** ("known club = affiliated") while **future affiliation is governed**. This is a governance decision the NSO ratifies, not an engineering default, and it shapes how v2 should seed/baseline existing clubs versus governing new transitions.

---

## 3. Legacy patterns to reject in v2

The following legacy patterns must **not** be carried forward into House v2:

- **Direct status mutations from pages/functions** — legacy code writes lifecycle `status` fields directly from many pages and functions. v2 forbids this; only the Governance Kernel may change governed state.
- **App-layer-only RLS** — legacy tenancy lives in entity `rls` blocks evaluated by the platform, not in the database. v2 must enforce tenancy with PostgreSQL RLS at the DB layer.
- **Scattered lifecycle logic** — lifecycle rules are spread across functions, pages, and workflow records. v2 centralizes lifecycle in one kernel.
- **Ad hoc audit writes** — audit entries are written opportunistically. v2 requires append-only audit written inside the same transaction as the transition.
- **Implicit workflow state** — workflow progress inferred from scattered flags/fields. v2 requires explicit, versioned, kernel-owned state.
- **Non-idempotent side effects** — legacy side effects can duplicate on retry. v2 requires idempotency keys and a transactional outbox.
- **Base44-specific backend abstractions** — `@base44/sdk`, `createClientFromRequest`, `asServiceRole`, Deno function deployment model. v2 must not recreate these in TypeScript.
- **UI-owned governance logic** — frontend checks treated as enforcement. v2 treats UI as request-only; governance enforcement is server-side and non-bypassable.

---

## 4. Legacy affiliation lifecycle mapping

Legacy `Application.status` enum mapped to the proposed v2 `AffiliationApplication` FSM:

| Legacy status | Proposed v2 state | Notes |
|---|---|---|
| *(none — intake form)* | `draft` | v2 adds an explicit pre-submission draft state the legacy app lacks. |
| `submitted` | `submitted` | Direct conceptual match (post-submit, pre-review). |
| `ptso_review` | `under_review` | Legacy splits review by org tier (PTSO vs CC); v2 v1 collapses to a single `under_review`. |
| `ptso_approved` | `under_review` (substate, deferred) | Intermediate PTSO sign-off; in v1 this is a sign-off *within* review, not a distinct FSM state. |
| `cc_review` | `under_review` | National-level review stage; same v1 `under_review` state, distinguished by workflow metadata later. |
| `approved` | `approved` | Direct match. v2 then transitions `approved → active` via an explicit `activate`. |
| `rejected` | `rejected` | Direct match. |
| `more_info_needed` | `under_review` (return-for-info, deferred) | Modeled as a review outcome / guard result, not a separate v1 FSM state. |
| *(no legacy equivalent)* | `active` | Governed standing after activation (post-approval lifecycle). |
| *(no legacy equivalent)* | `suspended` | Governed suspension of an active affiliation. |
| *(no legacy equivalent)* | `revoked` | Governed revocation. |
| *(no legacy equivalent)* | `closed` | Terminal closure from rejected/revoked. |
| *(no legacy equivalent)* | `archived` | Terminal archival of closed records. |

**Guidance:** v2 may later need richer review substates (PTSO vs CC review, return-for-more-info) or workflow metadata to fully represent the legacy two-tier review. **The first kernel slice should stay with the proposed v1 FSM** (`draft → submitted → under_review → approved/rejected → active → suspended → revoked → closed → archived`) **unless a hard blocker is found.** The legacy `ptso_approved`, `cc_review`, and `more_info_needed` distinctions are captured as workflow metadata, approval-tier sign-offs, and guard/transition-request results rather than as additional v1 FSM states.

---

## 5. Governance Kernel migration principle

> **The legacy app is a domain reference, not an implementation authority.**
> The House v2 must centralize lifecycle control in the PostgreSQL-backed Governance Kernel. Domain modules may **request** transitions, but they must **not** directly mutate governed state. Every governed lifecycle change resolves to a versioned policy/state-machine, evaluates registered guards, enforces tenant-scoped authorization, records append-only history and audit, produces evidence metadata when required, and enqueues outbox messages — all within a single transaction. External side effects happen only after commit, via the outbox.

---

## 6. Entity / domain mapping table

| Legacy Concept | Legacy Location | V2 Concept | V2 Owner | Migration Decision |
|---|---|---|---|---|
| Application (affiliation) | `entities/Application.jsonc` | `AffiliationApplication` + `entity_state` | `domains/affiliation` + `governance` | Preserve concept, redesign implementation (state owned by kernel). |
| AuditLog | `entities/AuditLog.jsonc` | `audit_event` | `governance/audit` | Preserve concept; make append-only & transactional. |
| ApprovalTier | `entities/ApprovalTier.jsonc` | `approval_step` / approval definition | `governance/workflow` | Preserve concept; centralize under kernel-driven approvals. |
| WorkflowStep | `entities/WorkflowStep.jsonc` | `workflow_definition` / `workflow_instance` | `governance/workflow` | Preserve concept; make explicit & versioned. |
| Policy | `entities/Policy.jsonc` | `policy_version` / `state_machine` version | `governance/policy` | Preserve concept; bind every transition to a versioned policy. |
| Permission / Role / RolePermission / UserRole | `entities/*.jsonc`, `functions/enforcePermission` | identity/access model + kernel permission checks | `identity` + `governance` | Preserve concept; harden (server-side, fail-closed, DB-backed). |
| DecisionInstance | `entities/DecisionInstance.jsonc` | decision lifecycle (later slice) | `governance` (future) | Preserve concept; defer beyond first slice. |
| ComplianceRecord / ComplianceAudit | `entities/Compliance*.jsonc` | compliance records / guards | `governance/compliance` (future) | Preserve concept; defer; surfaces as affiliation guards (e.g. no open compliance flags). |
| ConsentLog | `entities/ConsentLog.jsonc` | `consent_record` | `governance/consent` (future) | Preserve concept; defer if outside first slice. |
| OrgLifecycleEvent | `entities/OrgLifecycleEvent.jsonc` | org lifecycle via kernel transitions | `governance` (future) | Preserve concept; route through kernel later. |
| Base44 RLS rules | per-entity `rls` blocks | PostgreSQL RLS policies | `db/governance` | Reject implementation, preserve intent (tenant isolation, fail-closed). |
| Affiliation Migration Doctrine / Goodwill Baseline | `src/AFFILIATION_MIGRATION_DOCTRINE.md` | seeding/baseline policy for existing clubs | `governance/policy` + `domains/affiliation` | Preserve as governance decision; inform baseline seeding, not runtime mutation. |
| Base44 functions (general) | `base44/functions/*/` | TypeScript domain services + outbox processor | `domains/*` + `governance` | Reject implementation; re-express only the slices in scope. |

---

## 7. First vertical slice boundary

The first implementation slice remains:

- Governance Kernel FSM
- `AffiliationApplication` lifecycle
- Registered guards
- Audit event (append-only, transactional)
- Evidence metadata (for high-risk transitions)
- Idempotency (keys + DB constraint + outbox dedupe)
- Transactional outbox
- Azure Service Bus publisher **skeleton** (abstraction only; no sessions in v1)

**Explicitly out of scope for the first slice:**

- Full legacy app migration
- Frontend rebuild / any UI
- Every legacy entity (all 87)
- Every Base44 function (all 99)
- NSO white-label / microsite portals
- Payments integration beyond guard/outbox placeholders
- Safe Sport module
- Event module
- Grants module

---

## 8. Risks from legacy migration

- **Accidentally recreating Base44 architecture in TypeScript** — porting the entity/function/RLS-block shape instead of designing a governed modular monolith.
- **Copying direct status updates** — reintroducing scattered `status = ...` mutations instead of routing through the kernel.
- **Treating legacy RLS as sufficient** — relying on app-layer rules instead of PostgreSQL RLS.
- **Overfitting v2 to curling-only names** — baking sport-specific terminology into platform-core primitives that should be NSO-generic.
- **Dragging 87 entities into v1** — scope explosion; v1 needs only the governance + affiliation slice tables.
- **Creating UI before kernel** — building pages before the non-bypassable system of record exists.
- **Replacing the Governance Kernel with a generic workflow engine** — diluting governed lifecycle control into a configurable/JSON rule engine instead of a typed FSM with named guards.

---

## 9. Conclusion

The next step is **initial TypeScript backend scaffolding for The House v2**, using the legacy app only as a **domain reference** and preserving the **Governance Kernel as the non-bypassable system of record for governed lifecycle changes.**
