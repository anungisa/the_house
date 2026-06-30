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
| Gated PostgreSQL/RLS integration tests | [tests/integration/governance/organization-registry.integration.test.ts](../../tests/integration/governance/organization-registry.integration.test.ts) |

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

## PostgreSQL/RLS validation

The registry's persistence guarantees are proven against **real PostgreSQL** by a gated
integration suite
([tests/integration/governance/organization-registry.integration.test.ts](../../tests/integration/governance/organization-registry.integration.test.ts)).
The suite is **hermetic by default**: it runs only when `RUN_DB_TESTS=1` and an admin connection
URL is set, otherwise every case is skipped so `npm test` needs no database, container, or
network. It contacts no Azure, Entra/JWKS, antivirus, Service Bus, Key Vault, registry, Cosign,
or transparency-log service.

Using the admin connection it applies migrations idempotently and self-provisions one
least-privilege role, `house_app_org_registry_test` (`LOGIN`, **`NOSUPERUSER`**,
**`NOBYPASSRLS`**, `NOCREATEDB`, `NOCREATEROLE`), granted only `SELECT, INSERT, UPDATE` on
`organization_registry.organization` and `governance.outbox_message` plus `EXECUTE` on
`governance.current_tenant_id()` — no `DELETE`, no `TRUNCATE`, no superuser, no BYPASSRLS. The
store/service run as that restricted, RLS-confined role.

It proves, against that role:

- **FORCE RLS** — the table reports `relrowsecurity` and `relforcerowsecurity` both true, so the
  policies apply even to the table owner.
- **Fail closed** — a read or write with no `app.tenant_id` set raises `P0001`
  (`current_tenant_id()` fails closed); the registry is never reachable without tenant context.
- **Tenant isolation** — Tenant Alpha inserts and reads its own national → regional → local
  hierarchy; Tenant Alpha cannot read Tenant Beta's organizations (detail and list); a
  cross-tenant parent id is unresolvable and rejected as `ORGANIZATION_PARENT_NOT_FOUND`; a
  cycle is rejected as `ORGANIZATION_PARENT_CYCLE`.
- **Least privilege** — the role is `NOSUPERUSER` / `NOBYPASSRLS` and holds exactly
  `{SELECT, INSERT, UPDATE}` on the registry table (no `DELETE`/`TRUNCATE`).
- **Outbox atomicity** — a create/status-change writes the organization row and its sanitized
  `organization.registry.*` outbox message in one transaction; if the outbox insert is denied
  (`42501`) the organization insert rolls back with it (no silent partial write). Payloads carry
  no `displayName`/`legalName`, headers, bearer tokens, secrets, or bytes.
- **No governed lifecycle mutation** — across create, status change, and affiliation projection,
  the counts of `governance.entity_state`, `governance.state_transition`, and
  `governance.audit_event` for the suite's tenants stay at zero. The registry is reference data;
  governed lifecycle stays with the kernel/workflow.
- **NSO-generic schema** — no registry column carries sport-specific terminology.

### Running the gated DB integration

```sh
RUN_DB_TESTS=1 \
MIGRATE_DATABASE_URL=postgres://<admin-user>:<admin-password>@127.0.0.1:55432/the_house_test \
DATABASE_URL=postgres://<app-user>:<app-password>@127.0.0.1:55432/the_house_test \
npx vitest run tests/integration
```

`MIGRATE_DATABASE_URL` is the elevated/admin connection used for DDL and role provisioning; the
restricted runtime role is derived internally. Connection strings come from the environment —
none are hardcoded, and no secrets are logged.

## HTTP read surface

Read-only HTTP endpoints expose the registry to authorized operators. The endpoints are a THIN
transport over the read store: they never mutate the registry, never enqueue an outbox message,
never touch governed state, and never invoke the Governance Kernel.

| Method & path | Purpose |
| --- | --- |
| `GET /v1/organizations` | List the authenticated tenant's organizations (keyset-paginated). |
| `GET /v1/organizations/:organizationId` | Read a single organization for the tenant. |

Key properties:

- **Authorization** is the centralized `organization.read` action (see
  `src/authz/AuthorizationActions.ts`). The `organization_reader` and `organization_admin` roles
  imply it, as does the platform-admin wildcard and the exact `organization.read` permission key.
  Authorization fails closed: an unauthenticated request is `401`, an authenticated-but-unauthorized
  request is `403`, and a denial emits the sanitized `authz.denied` signal.
- **Tenant isolation**: tenant identity comes EXCLUSIVELY from the resolved auth context
  (`x-house-*` trusted headers) — never from the query string, path, or body. A detail read of
  another tenant's organization returns `404` and never reveals cross-tenant existence (RLS makes
  the row invisible to the read).
- **Pagination & filters**: list supports `limit` (positive integer; clamped to the domain
  maximum), an opaque base64url `cursor`, and the optional `organizationType`, `status`, and
  `parentOrganizationId` filters. Invalid input is rejected with `400`.
- **Safe projection**: responses expose a CLOSED DTO field set (identity / reference / status
  fields only) — never secrets, raw headers, connection strings, or payload bytes.
- **Telemetry**: each read emits the `organization.registry.read.count` counter tagged with the
  operation (`list`/`detail`) and result (`success`/`failure`). Names stay NSO-generic.

Reads run through the same RLS-enforced `PgOrganizationRegistryStore` used elsewhere, so a
non-superuser, non-BYPASSRLS role with `SELECT` only is sufficient — no write privileges are
required for the read surface. **Write endpoints remain out of scope** (see below).

## Out of scope (intentionally not built)

- Write/admin HTTP endpoints or a generic CRUD API (only the read surface above is exposed).
- New authorization actions beyond `organization.read`.
- Sport-specific organization vocabulary or attributes.
- A second `organization_relationship` table — the self-referencing parent column models the
  hierarchy for this baseline.
- Any governed lifecycle / kernel integration for organizations.
