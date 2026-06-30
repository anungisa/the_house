# Organization Registry domain baseline

## Purpose

The Organization Registry is the canonical, tenant-scoped catalogue of **organizations** and
their **parent/child hierarchy** in The House v2. It exists so future domains (participant,
facility, program, event, membership) have a single, governed structure to attach to instead of
re-modelling "who the organizations are" in each module.

It is deliberately **generic NSO vocabulary** — national / regional / local / external /
applicant organizations only. No sport-specific terms appear anywhere in the domain code,
migration, tests, or this document.

This is **reference-data structure, not lifecycle governance.** The registry NEVER:

- calls the Governance Kernel (`GovernanceKernel.transition()`);
- reads or mutates `governance.entity_state`;
- approves, rejects, or activates an affiliation application;
- substitutes for a kernel-approved transition;
- bypasses Row-Level Security or tenant isolation.

## Where it lives

| Concern | File |
| --- | --- |
| Types, enums, payloads, guards | [src/domains/organization-registry/OrganizationTypes.ts](../../src/domains/organization-registry/OrganizationTypes.ts) |
| Boundary validation + error factories | [src/domains/organization-registry/OrganizationRegistryErrors.ts](../../src/domains/organization-registry/OrganizationRegistryErrors.ts) |
| Store port + outbox builders | [src/domains/organization-registry/OrganizationRegistryStore.ts](../../src/domains/organization-registry/OrganizationRegistryStore.ts) |
| In-memory store (local/demo/test) | [src/domains/organization-registry/InMemoryOrganizationRegistryStore.ts](../../src/domains/organization-registry/InMemoryOrganizationRegistryStore.ts) |
| PostgreSQL store (integration) | [src/domains/organization-registry/PgOrganizationRegistryStore.ts](../../src/domains/organization-registry/PgOrganizationRegistryStore.ts) |
| Service (business rules) | [src/domains/organization-registry/OrganizationRegistryService.ts](../../src/domains/organization-registry/OrganizationRegistryService.ts) |
| Barrel | [src/domains/organization-registry/index.ts](../../src/domains/organization-registry/index.ts) |
| Migration + RLS | [db/migrations/0009_organization_registry.sql](../../db/migrations/0009_organization_registry.sql) |
| Unit tests | [tests/unit/domains/organization-registry/OrganizationRegistryService.test.ts](../../tests/unit/domains/organization-registry/OrganizationRegistryService.test.ts) |

## Domain model

A single canonical record, `organization_registry.organization`, with a self-referencing parent.

| Field | Type | Notes |
| --- | --- | --- |
| `organizationId` (`id`) | uuid | Unique **per tenant**. Generated when not supplied. |
| `tenantId` | uuid | Tenant owner. RLS-scoped. |
| `organizationType` | enum | `national` \| `regional` \| `local` \| `external` \| `applicant`. Immutable. |
| `displayName` | text | Required, non-blank. Mutable. |
| `legalName` | text? | Optional. Mutable. |
| `status` | enum | `draft` \| `active` \| `suspended` \| `archived`. Defaults `draft`. |
| `parentOrganizationId` | uuid? | Same-tenant parent. Validated for existence + no cycle. |
| `source` | enum | `manual` \| `affiliation_application` \| `import` \| `system`. Immutable. |
| `sourceEntityType` | text? | Provenance type (e.g. `AffiliationApplication`). Immutable. |
| `sourceEntityId` | text? | Provenance id (e.g. the approved application id). Immutable. |
| `createdAt` / `updatedAt` | timestamptz | Set from a clock; `createdAt` immutable. |

### Statuses

`status` is **registry reference status**, not a governed FSM. There is no kernel policy behind
it and no guard evaluation. Records are **never deleted**: `suspended` and `archived` retain the
row so history and references stay intact.

### Hierarchy rules

- A parent must **exist for the calling tenant**. A parent id owned by a different tenant simply
  does not resolve (RLS / tenant-scoped read) and is rejected as
  `ORGANIZATION_PARENT_NOT_FOUND` — this is also how cross-tenant parents are blocked.
- A parent relationship that would introduce a **cycle** (self-parent, or any ancestor chain
  that loops back to the organization) is rejected as `ORGANIZATION_PARENT_CYCLE`. Cycle
  detection walks the proposed ancestor chain with a bounded depth + visited set.

### Source-reference rules

- If `sourceEntityType` is provided, `sourceEntityId` must also be provided (and vice versa).
- An **active** organization sourced from an affiliation application must record its
  `sourceEntityId`, so every active projected record is traceable to its approved application.

## Tenant isolation

Every read and write is tenant-scoped. The Pg store sets `app.tenant_id` inside each
transaction before touching `organization_registry.organization`, which is under `ENABLE` +
`FORCE` Row-Level Security keyed on `governance.current_tenant_id()` (defined in migration
0001, fails closed when the tenant context is unset). The in-memory store mirrors this by
filtering on `tenantId`. Unit test (and synthetic scenario 21) prove Tenant Beta cannot read
Tenant Alpha's organizations.

## Affiliation linkage (one-way projection)

`OrganizationRegistryService.registerOrganizationFromApprovedAffiliationApplication(...)` is the
only seam connecting affiliation to the registry. It is a **one-way projection**:

- it does **not** call the kernel, does **not** mutate governed state, and is **not** an
  approval path;
- it **trusts its caller** to have confirmed the application is approved (the governed decision
  stays with the kernel/workflow) — this trust boundary is intentional and documented here;
- it records `source = 'affiliation_application'`, `sourceEntityType = 'AffiliationApplication'`,
  and `sourceEntityId = <affiliation application id>` immutably, and creates an `active`
  organization.

The affiliation application's own lifecycle remains entirely kernel- and workflow-controlled.

## Outbox signals (sanitized)

Each mutation enqueues a transactional-outbox message in the **same unit of work** as the row
write (atomic; mirrors the platform outbox pattern, default 10 retries, stable dedupe keys):

| Message type | When | Dedupe key |
| --- | --- | --- |
| `organization.registry.created` | create / projection | `organization.registry.created:<id>` |
| `organization.registry.updated` | attribute change | `organization.registry.updated:<id>:<updatedAt>` |
| `organization.registry.status_changed` | status change | `organization.registry.status_changed:<id>:<status>:<updatedAt>` |

Payloads carry **routing/identity metadata only** — `organizationId`, `tenantId`,
`organizationType`, `status`/`source`, optional `parentOrganizationId` / `sourceEntity*` /
`actorUserId` / `requestId` / `correlationId`. They deliberately **exclude** `displayName` and
`legalName` (downstream consumers read the registry by id) and never contain secrets or raw
bytes.

Idempotency: a replayed create returns the existing row and enqueues nothing new; a status
change to the current status is a no-op (no row change, no signal).

## Telemetry signals

Emitted through the centralized `Telemetry` seam (NSO-generic names; a guard test asserts no
domain terminology in telemetry names):

- Counters: `organization.registry.created.count`, `organization.registry.updated.count`,
  `organization.registry.read.count`.
- Events: `organization.registry.created`, `organization.registry.status_changed`.

## HTTP surfaces — deferred (out of scope this pass)

No HTTP endpoints and no new authorization actions are added in this pass. Reads are proven at
the **service level** (`getOrganization`, `listOrganizations`, both tenant-scoped and
keyset-paginated). Exposing an admin read surface (with `organization.read` authorization, an
`OrganizationReadHttpAdapter`, and cursor pagination over the native server) is a deliberate
follow-up so this pass stays a focused domain baseline.

## Out of scope (intentionally not built)

- Any HTTP/admin UI or read endpoints (deferred, above).
- Write endpoints or a generic CRUD API.
- New authorization actions / roles.
- Sport-specific organization vocabulary or attributes.
- A second `organization_relationship` table — the self-referencing parent column models the
  hierarchy for this baseline.
- Any governed lifecycle / kernel integration for organizations.
