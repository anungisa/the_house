# AffiliationApplication Domain Persistence (Guard Facts)

## Why this pass exists

Earlier slices wired the AffiliationApplication guards to a **payload/facts bridge**: the
caller supplied `payload.facts`, and `PayloadBackedAffiliationGuardRepository` treated those
facts as authoritative. That was an explicit, documented stub. It let the governed path be
exercised end-to-end before any domain persistence existed, but it is unsafe for real use —
a caller could make any guard pass by sending its own "facts".

This pass replaces that bridge with **real AffiliationApplication domain persistence**.
Guard evaluation now reads from persisted domain state instead of caller-supplied facts.

## Ownership boundary (unchanged invariant)

The affiliation domain stores **application facts** required by guards. It does **not** own
governed lifecycle state.

- Lifecycle state remains owned by `governance.entity_state`, written **only** by the
  Governance Kernel.
- The affiliation domain never mutates governed status, never writes audit/evidence/outbox,
  never evaluates transition permissions, and never bypasses `GovernanceKernel.transition()`.
- The domain tables hold facts (completeness, documents, compliance flags, payments, season
  currency). The kernel reads those facts through the guard repository; it does not read
  governed state from the domain.

## What moved from payload facts to persisted state

| Guard | Old source (`payload.facts`) | New source (persisted) |
| --- | --- | --- |
| `AFFILIATION_REQUIRED_FIELDS_COMPLETE` | `requiredFieldsComplete` | `affiliation_application.required_fields_complete` |
| `AFFILIATION_REQUIRED_DOCS_PRESENT` | `requiredDocsPresent` | `affiliation.application_document` rows (required & status) |
| `AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS` | `openComplianceFlags` | `affiliation.compliance_flag` rows (status='open') |
| `AFFILIATION_FEES_PAID` | `feesPaid` | `affiliation.payment_obligation` rows (status) |
| `SEASON_IS_CURRENT` | `seasonIsCurrent` | application's persisted `season_id` ⋈ `affiliation.season.is_current` |
| `ACTOR_HAS_REVIEWER_SCOPE` | actor roles | actor roles (identity, **not** persisted domain data) |

`ACTOR_HAS_REVIEWER_SCOPE` intentionally stays identity-driven: reviewer scope is a property
of the acting principal, not of the application record.

## Schema (migration `0003_affiliation_domain_schema.sql`)

Schema `affiliation`, five tenant-owned tables (all `ENABLE` + `FORCE ROW LEVEL SECURITY`,
policies `USING (tenant_id = governance.current_tenant_id())`, SELECT/INSERT/UPDATE only — no
DELETE):

- `affiliation.affiliation_application` — `id` (uuid PK, **equals** the governed
  `entity_id`), `tenant_id`, `season_id`, `required_fields_complete`, `documents_verified`,
  `payment_status` (denormalized convenience), plus generic organization/scope/applicant
  columns.
- `affiliation.application_document` — required documents and their approval status.
- `affiliation.compliance_flag` — open/resolved/dismissed compliance flags.
- `affiliation.payment_obligation` — **authoritative** fee obligations (the
  `payment_status` column on the application is a denormalized convenience only).
- `affiliation.season` — per-tenant season currency (`is_current`).

`required_fields_complete` is modeled as a computed boolean on the application (completeness
is a derived property), whereas documents are row-based so individual document states drive
the guard. This distinction is intentional.

The migration grants `SELECT, INSERT, UPDATE` on these tables to the runtime role
`house_app` via a conditional `DO` block (applied only when the role exists).

## RLS behavior

Every affiliation table is tenant-owned and RLS-forced. Application code sets `app.tenant_id`
transaction-locally (`withTenantTransaction`) before any access. With no tenant context,
`governance.current_tenant_id()` raises `TENANT_CONTEXT_MISSING`, so reads/writes **fail
closed** at the database. The runtime role is non-superuser / non-BYPASSRLS, so cross-tenant
reads return zero rows.

## Guard repository behavior

`DomainBackedAffiliationGuardRepository` (in `src/domains/affiliation/`) implements the
governance `AffiliationGuardRepository` port by delegating to an
`AffiliationApplicationStore`:

- `PgAffiliationApplicationStore` — production reads, each inside its own
  `withTenantTransaction` (a connection separate from the kernel transaction; it reads
  committed domain facts under RLS).
- `InMemoryAffiliationApplicationStore` — unit-test double with seed helpers.

Dependency direction: the **domain depends on the governance interface**, never the reverse;
the governance core does not import the domain. `registerAffiliationGuards(registry, repo)`
now requires an explicit repository — production passes the domain-backed repository; tests
may pass the `PayloadBackedAffiliationGuardRepository` **fake**.

Fail-closed semantics (identical for in-memory and Postgres):

- Missing application → required fields = false, documents present = false, **open
  compliance flags = true (blocks)**, payment satisfied = false, facts = undefined.
- Season currency is false unless a matching `is_current` season row exists.

## What remains stubbed (deliberately out of scope)

- Real payment processor (obligations are recorded facts; no gateway integration).
- Real document/evidence storage (documents are status rows; no blob storage).
- Workflow engine for approval-required transitions (kernel still records a
  `transition_request`; no executor).
- HTTP/API endpoint layer and any frontend.
- Azure Service Bus publisher wiring (outbox rows are enqueued; no real publisher).
- Two-tier (PTSO/CC) review states, `more_info_needed`, and any new FSM states.

## Recommended next pass

One of: real Azure Service Bus publisher for the outbox · an HTTP adapter/API endpoint layer
over the domain service · real document-evidence storage · workflow metadata for two-tier
review.
