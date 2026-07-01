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

A second gated suite (`tests/integration/governance/facility-registry-http.integration.test.ts`, 29
tests, `RUN_DB_TESTS=1` only) validates the **Facility HTTP read surface** over the same real local
PostgreSQL and restricted runtime role. It drives the three GET routes
(`/v1/facilities`, `/v1/facilities/:facilityId`, `/v1/organizations/:organizationId/facilities`)
through the native HTTP server backed by `PgFacilityRegistryStore` and proves: same-tenant list /
detail / org-scoped list; closed-key `FacilityDto` with no `tenantId`; optional-field
null-normalization; `facility.read` exact permission, `facility_reader` / `facility_admin` roles, and
`platform_admin` wildcard; 401 on missing auth, 403 for `organization_reader` / `participant_reader` /
other actors lacking `facility.read`; cross-tenant detail → 404, missing detail → 404, cross-tenant /
unknown org list → empty; 400 on invalid status / facilityType / limit / cursor; HTTP limit clamping;
opaque cursor pagination that never leaks tenant id or SQL internals; 405 + `Allow: GET` on
non-GET; deeper unknown paths → 404; organization participant routes not shadowed; and non-mutation
of facility, Organization Registry, and governance lifecycle rows with zero outbox rows created by
reads. `FORCE ROW LEVEL SECURITY` on `facility_registry.facility` and the runtime role's
non-superuser / non-`BYPASSRLS` status are re-asserted. Telemetry redaction remains covered by the
hermetic adapter suite.

A third gated suite (`tests/integration/governance/facility-registry-write-http.integration.test.ts`,
68 tests, `RUN_DB_TESTS=1` only) validates the **Facility HTTP write surface (create + update +
status transition)** over a real local PostgreSQL and a dedicated restricted runtime role
(`house_app_facility_http_write_test`; NOSUPERUSER, NOBYPASSRLS; `SELECT`/`INSERT`/`UPDATE` on the
facility table and outbox, `SELECT` on the organization registry, **no `DELETE`**, no
governance-lifecycle grants). It drives `POST /v1/facilities`, `PATCH /v1/facilities/:facilityId`,
and `POST /v1/facilities/:facilityId/status-transitions` through the native HTTP server backed by
`PgFacilityRegistryStore` + `FacilityRegistryService` and
proves: same-tenant create/update/status-transition via the exact permission, `facility_admin`, and
`platform_admin`; 403 for `facility_reader` / exact `facility.read` / `organization_reader` (and, for
status, exact `facility.write` WITHOUT `facility.status.write`); 401 on
missing auth/tenant; 400 on missing `Idempotency-Key`, missing/invalid body fields, invalid enum,
malformed/non-object body, and unknown/misplaced keys; 404 for unknown / cross-tenant organization on create and for missing /
cross-tenant facility on update/status (existence never leaked); 409 on duplicate `facilityId`; closed-key
`FacilityDto` excluding `tenantId` (and `reason`) with null-normalized optionals; exactly one facility row + one
sanitized `facility.registry.created` / `updated` / `status_changed` outbox row per mutation
(payloads exclude name, address, contact, coordinates, capability tags, `reason`, headers, tokens, and
connection strings); a same-status POST that is a 200 no-op emitting no new signal; no Organization Registry or governed-lifecycle (`entity_state` /
`state_transition` / `audit_event`) mutation; 405 with the correct `Allow` header on unsupported methods; and
error responses that leak no PII, SQL, or stack details. It uses the dedicated tenant namespace
`…d5`/`…e6`. The suite skips cleanly when `RUN_DB_TESTS` is unset. This gated suite has been
**executed** against a real local PostgreSQL (`house_pg_test`, `127.0.0.1:55432`) with the restricted
runtime role — **68/68 passing** — and is green inside the full gated integration run
(**328/328** across 16 files). The facility **status-transition** HTTP route is therefore fully
served AND PostgreSQL/RLS-validated: the Facility HTTP write validation loop is closed.

## Out of scope (intentionally not built)

This baseline is deliberately narrow. It does **not** add, and future work must not smuggle in via
this domain: booking, scheduling, calendars, reservations; maintenance or work-order flows;
inventory; inspections or accreditation workflows; venue contracts; registration or payments;
program enrollment; event or competition flows; eligibility logic; a facility DELETE route; or any
frontend. The Facility Registry never calls the Governance Kernel and never mutates the Organization
or Participant registries. (The facility **status-transition** HTTP route and the
`facility.status.write` action ARE now implemented as a reference-data status change — NOT a governed
lifecycle transition.)

## Future considerations

Deferred, non-committal ideas for later passes: a `virtual` facility type; and richer `visibility`
semantics. None of these are implemented here.

The read-only HTTP surface is now **implemented** (its
[design/contract preflight](./facility-http-read-surface-preflight.md) is retained as the fixed
contract). Three GET routes are live — `/v1/facilities`, `/v1/facilities/:facilityId`, and
`/v1/organizations/:organizationId/facilities` — projecting the existing Facility Registry read
store through the `FacilityReadHttpAdapter`. The `facility.read` authorization action was added and
mapped to the `facility_reader` and `facility_admin` roles. The read surface is GET-only: it never
writes, never enqueues an outbox message, never invokes the Governance Kernel, and never mutates the
Organization or Participant registries. The read `FacilityDto` deliberately omits `tenantId`.

The **write surface (create + update + status transition)** is now **implemented**. Three routes are
live — `POST /v1/facilities` (create), `PATCH /v1/facilities/:facilityId` (update), and
`POST /v1/facilities/:facilityId/status-transitions` (status change) — projecting the validated
`FacilityRegistryService` through the `FacilityWriteHttpAdapter`. A `facility.write` action gates
create + update and a DISTINCT `facility.status.write` action gates the status transition; both are
mapped to `facility_admin` only (`facility_reader` stays read-only, and `facility.write` never
implies `facility.status.write`). Create requires a client-supplied `facilityId` and an
`Idempotency-Key` header, returns `409` on a duplicate id via a read pre-check, and returns `404`
when the same-tenant organization is unknown; update uses a closed allow-list (so `status`,
`facilityType`, `organizationId`, and `facilityId` are rejected as unknown keys) and returns `404`
for a missing or cross-tenant facility. The status-transition route accepts a closed body
(`targetStatus` required; optional `reason` validated but NOT persisted), requires an
`Idempotency-Key`, is an idempotent no-op when already at the target status, and returns `404` for a
missing or cross-tenant facility. The write adapter mutates the registry ONLY through the service,
which owns the transactional outbox — it never enqueues the outbox directly, never invokes the
Governance Kernel, and never mutates the Organization or Participant registries. Write endpoints are
covered by hermetic adapter + server tests; create, update, AND the status transition are all
PostgreSQL/RLS-validated over the real HTTP/Pg path (the Facility HTTP write validation loop is
closed). `facility:check`
guards that the read + write HTTP files are present, the `facility.read` + `facility.write` +
`facility.status.write` actions are present, `facility_admin` maps to all of them, the server wires
create + update + status-transition routes, the gated write integration suite covers the
status-transition route, and the write adapter calls no kernel / enqueues no
outbox / mutates no organization.

A **write-surface preflight** fixes the write boundary:
[facility-http-write-surface-preflight.md](./facility-http-write-surface-preflight.md) specifies the
three write routes (`POST /v1/facilities`, `PATCH /v1/facilities/:facilityId`,
`POST /v1/facilities/:facilityId/status-transitions`), the actions
(`facility.write` / `facility.status.write`), authorization, closed DTO contracts, the create
`409`-via-pre-check and idempotency model, error mapping, privacy/telemetry/outbox rules, server
route ordering, the test matrix, and a phased implementation plan. **All three routes (create +
update + status transition) are now implemented**; the status-transition route's dedicated
PostgreSQL/RLS validation over HTTP is deferred to a later pass.
