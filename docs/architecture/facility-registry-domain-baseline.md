# Facility Registry domain baseline

## Purpose

The Facility Registry is the canonical, tenant-scoped catalogue of **facilities** — the places and
sites that belong to an organization in the [Organization Registry](./organization-registry-domain-baseline.md).
It is **reference-data structure**, not a lifecycle engine. It records what a facility *is* (its
descriptive, location, and contact reference fields) and a simple operational reference `status`. It
never approves anything, never participates in the Governance Kernel state machine, and never
mutates governed lifecycle state.

Everything here is **NSO-generic**: types, values, and column names are sport-agnostic. There is no
sport-specific place vocabulary anywhere in the domain.

## Domain model

A single aggregate: the **facility**. Each facility is owned by exactly one organization in the same
tenant (`organizationId` is required — there are no organization-less facilities in v1). A facility
carries:

- identity: `tenantId`, `facilityId`, `organizationId`;
- classification: `name`, `facilityType`, `status`;
- optional location reference: `addressLine1`, `addressLine2`, `locality`, `region`, `postalCode`,
  `countryCode`, `latitude`, `longitude`;
- optional contact reference: `contactName`, `contactEmail`, `contactPhone`;
- optional metadata: `visibility`, `capabilityTags` (generic tenant-defined labels);
- audit timestamps: `createdAt`, `updatedAt`.

Immutable after creation: `organizationId`, `facilityType`, `createdAt`. Everything else is mutable
through the service. Records are never deleted; retiring a facility sets its `status`, retaining the
row.

## Status model

`FacilityStatus` is a flat reference enum — **not** a governed FSM and it carries no kernel
semantics:

`draft` → `active` → `inactive` → `archived` (any target may be set via `changeFacilityStatus`; the
service does not encode a transition graph). New facilities default to `draft`.

## Type model

`FacilityType` is a closed, immutable enum: `venue`, `training_site`, `office`, `storage_site`,
`partner_site`, `other`. Unknown values fail closed at the boundary. `visibility` is an optional
`internal | public` reference label that grants no access and enforces no policy.

## Tenant isolation

Every row is tenant-owned. The `facility_registry.facility` table has `ENABLE`/`FORCE ROW LEVEL
SECURITY` with `SELECT`/`INSERT`/`UPDATE` policies keyed on `governance.current_tenant_id()`. The Pg
store sets `app.tenant_id` inside each transaction before touching the table, so a non-superuser,
non-`BYPASSRLS` application role only ever sees its own tenant's rows. Missing tenant context fails
closed. There is no `DELETE` policy and no cross-schema foreign key — tenant scoping is the single
isolation mechanism.

## Organization dependency

A facility must reference a same-tenant organization. The service confirms existence through a
read-only `OrganizationReader` port before persisting. The reader is satisfied structurally by the
existing Organization Registry stores' tenant-scoped `getById`. The Facility Registry **only reads**
the Organization Registry — it never mutates organizations, and a cross-tenant or missing
organization resolves to a fail-closed `FACILITY_ORGANIZATION_NOT_FOUND`.

## Outbox signals (sanitized)

Writes enqueue a transactional outbox message in the SAME unit of work as the row write:

- `facility.registry.created`
- `facility.registry.updated`
- `facility.registry.status_changed`

Payloads carry routing/identity metadata only: `facilityId`, `tenantId`, `organizationId`,
`facilityType`, `status` (plus `previousStatus`/`newStatus` for status changes), optional
`visibility`, and optional actor/correlation metadata. Dedupe keys are stable per signal
(`facility.registry.created:<id>`, and monotonic-by-`updatedAt` keys for updates and status
changes), so idempotent replays never duplicate a row or a message.

## Telemetry signals

Operational counters/events are emitted through the platform telemetry sink:
`facility.registry.created.count`, `facility.registry.updated.count`,
`facility.registry.status_changed.count`, `facility.registry.write.count`,
`facility.registry.read.count`, and the `facility.registry.created` /
`facility.registry.status_changed` events. Attributes are low-cardinality identifiers and operation
labels only.

## Privacy stance

Descriptive and contact data stay in the registry row. Facility `name`, all address fields,
coordinates, `capabilityTags`, and all contact fields (`contactName`, `contactEmail`,
`contactPhone`) are **never** projected into outbox payloads or telemetry attributes. Contact email
is normalized (trimmed + lowercased) at the boundary. Downstream consumers read the registry by id
for descriptive data.

## Idempotency

Create is idempotent on `(tenantId, facilityId)`: a repeat returns the existing row as a `conflict`
outcome and enqueues nothing new. `changeFacilityStatus` is a no-op (no mutation, no signal) when the
facility is already at the target status. Outbox dedupe keys make signal delivery idempotent under
retry.

## Service API

`FacilityRegistryService` exposes: `createFacility`, `updateFacility` (mutable descriptive fields
only — never `status`, `facilityType`, or `organizationId`), `changeFacilityStatus`, `getFacility`,
`listFacilities`, and `listFacilitiesForOrganization`. All reads and writes are tenant-scoped and
keyset-paginated where they return collections. Business rules live in the service; the store is thin
and only persists + enqueues.

## PostgreSQL schema and migration

Migration `db/migrations/0011_facility_registry.sql` creates the `facility_registry` schema, the
`facility` table, its `CHECK` constraints, indexes (`(tenant_id, created_at, id)`,
`(tenant_id, organization_id)`, `(tenant_id, status)`, `(tenant_id, facility_type)`, and
`(tenant_id, lower(name))`), RLS policies, and least-privilege `house_app` grants
(`SELECT`/`INSERT`/`UPDATE`, no `DELETE`). Requires PostgreSQL 15+; NSO-generic names only.

## Testing

`FacilityRegistryService` has a hermetic unit suite (in-memory store, in-memory outbox, in-memory
Organization Registry as the read-only reference, deterministic id + clock, in-memory telemetry) —
no DB, Azure, or network. A gated PostgreSQL/RLS integration test
(`tests/integration/governance/facility-registry.integration.test.ts`) runs only when
`RUN_DB_TESTS=1`. The pure `validateFacilityRegistryBaseline` checker (run via `npm run
facility:check`, chained into `ci:check`) statically asserts baseline coherence.

The gated PostgreSQL/RLS suite has been executed against a real local PostgreSQL using a restricted,
self-provisioned runtime role (NOSUPERUSER, NOBYPASSRLS, `SELECT/INSERT/UPDATE` only — no DELETE).
It proves, end to end: migration `0011` applies; `facility_registry.facility` exists with RLS
enabled AND forced; missing tenant context fails closed; same-tenant create/read/update/status-change
succeed; cross-tenant reads and cross-tenant organization references are denied; the facility row and
its sanitized `facility.registry.*` outbox row commit atomically (an in-transaction outbox failure
rolls the facility write back); outbox payloads exclude name, address, contact, coordinates, and
capability tags; no governed lifecycle table (`entity_state` / `state_transition` / `audit_event`)
and no Organization Registry row is mutated; and the restricted role holds no DELETE grant. The
suite skips cleanly when `RUN_DB_TESTS` is unset so the default `npm test` stays hermetic.

## Out of scope (intentionally not built)

This baseline is deliberately narrow. It does **not** add, and future work must not smuggle in via
this domain: booking, scheduling, calendars, reservations; maintenance or work-order flows;
inventory; inspections or accreditation workflows; venue contracts; registration or payments;
program enrollment; event or competition flows; eligibility logic; any HTTP surface; any facility
authorization action; or any frontend. The Facility Registry never calls the Governance Kernel and
never mutates the Organization or Participant registries.

## Future considerations

Deferred, non-committal ideas for later passes: a read-only HTTP surface (preflight-first, mirroring
the participant read surface); a `facility.read` authorization action; a `virtual` facility type; and
richer `visibility` semantics. None of these are implemented here.
