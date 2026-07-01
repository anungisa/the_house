# Facility HTTP write-surface preflight

> **Status: PHASE 1 IMPLEMENTED (create + update). STATUS-TRANSITION STILL DESIGN-ONLY.** The
> Facility HTTP write **create** (`POST /v1/facilities`) and **update** (`PATCH /v1/facilities/:facilityId`)
> routes, their write DTO file and write adapter, the `facility.write` authorization action (mapped
> to `facility_admin`), and the server/composition write wiring now exist and are covered by hermetic
> adapter + server tests. The facility **status-transition** route
> (`POST /v1/facilities/:facilityId/status-transitions`) and the `facility.status.write` action remain
> **DESIGN / CONTRACT ONLY — NOT IMPLEMENTED**; that sub-resource does not match any wired route and
> falls through to 404. No Facility DELETE route exists. This document fixes the write boundary —
> endpoints, authorization, request/response DTO contracts, idempotency, error mapping, privacy /
> telemetry / outbox rules, server route sequencing, the test matrix, validator expectations, and a
> phased implementation plan — so the remaining **status-transition** surface can be implemented
> deterministically in a later pass without re-litigating scope, the kernel boundary, or the
> create-conflict/idempotency semantics mid-implementation.
>
> A gated PostgreSQL/RLS integration suite now exists for the phase-1 write endpoints:
> [facility-registry-write-http.integration.test.ts](../../tests/integration/governance/facility-registry-write-http.integration.test.ts)
> (45 tests). Driven through the REAL native HTTP server (`createAffiliationHttpServer` + `fetch`)
> over an ephemeral loopback listener, backed by the REAL `PgFacilityRegistryStore` +
> `FacilityRegistryService` running as a restricted `NOSUPERUSER`, `NOBYPASSRLS` role
> (`house_app_facility_http_write_test`; `SELECT`/`INSERT`/`UPDATE` on the facility table and the
> outbox, `SELECT` on the organization registry, **no `DELETE`**, no governance-lifecycle grants),
> it proves create/update work end-to-end and that tenant/RLS/outbox/privacy/non-mutation invariants
> hold (one facility row + one sanitized outbox row per mutation; no Organization Registry or
> governed-lifecycle mutation; closed `FacilityDto` excluding `tenantId`; sanitized outbox payloads).
> The suite skips cleanly when `RUN_DB_TESTS` is unset, so default `npm test` stays hermetic. It uses
> the dedicated tenant namespace `…d5`/`…e6` (distinct from every other gated suite). The facility
> **status-transition** surface remains deferred and is NOT exercised.
>
> The Facility Registry stays a **reference-data** domain. The write surface is a thin projection
> over the already-validated `FacilityRegistryService`, which owns the transactional outbox. It
> NEVER invokes the Governance Kernel, NEVER mutates governed lifecycle state, and NEVER mutates the
> Organization or Participant registries (it only READS the Organization Registry to confirm
> same-tenant existence on create).

## 1. Purpose

The Facility Registry today exposes only a read-only HTTP surface — `GET /v1/facilities`,
`GET /v1/facilities/:facilityId`, `GET /v1/organizations/:organizationId/facilities` — gated by
`facility.read` (see [facility-http-read-surface-preflight.md](./facility-http-read-surface-preflight.md),
implemented and PostgreSQL/RLS-validated). The underlying service
([FacilityRegistryService.ts](../../src/domains/facility-registry/FacilityRegistryService.ts))
already supports create, profile update, and reference-status change — each writing a sanitized
transactional outbox signal — but none of those operations are reachable over HTTP.

This preflight defines the **safe HTTP write surface** so a later implementation pass can add
mutation endpoints deterministically, without re-litigating authorization, idempotency, privacy,
RLS, error mapping, or test obligations mid-implementation. It is the contract the implementation
pass and its reviewers will check against.

Goals:

1. Decide which write operations the first write surface exposes (and which it must not).
2. Define the authorization model (two new actions + role mapping) for facility writes.
3. Specify the closed request/response DTO contracts for each endpoint.
4. Fix the create-conflict / idempotency / correlation model against the **actual** service
   behavior (which is idempotent-replay, not conflict-erroring).
5. Define validation behavior and HTTP error mapping.
6. State telemetry, outbox, and privacy/payload-safety expectations.
7. Fix server route ordering so the status sub-resource never shadows the detail route.
8. Enumerate the hermetic and gated (RLS/DB) tests the implementation must add.
9. Provide a phased implementation sequence and a go/no-go checklist.

## 2. Current readiness

Confirmed against the codebase at this pass (baseline `49d2ee4`):

| Concern | State today | Implication for the write surface |
| --- | --- | --- |
| Service create | `FacilityRegistryService.createFacility` exists. `facilityId` optional (generated when absent); `status` defaults to `draft`; requires an `organizationReader`; a duplicate `(tenant, facilityId)` returns the **existing row as an idempotent replay** (`conflict` outcome → returns the existing view), NOT an error. | Adapter must add a duplicate pre-check to produce a deterministic `409` (see §6). Requires a client-supplied `facilityId`. |
| Service update | `updateFacility` exists. Tri-state merge: `null` clears, `undefined` leaves unchanged, a value replaces (after normalization). Accepts `name` + address/coordinate/contact/`visibility`/`capabilityTags` only. **No `facilityType`, no `status`, no `organizationId`.** Always emits an `updated` signal (no no-op short-circuit). | PATCH rejects `facilityType`/`status`/`organizationId`/`facilityId` as closed-set violations. Empty PATCH must be rejected at the boundary to avoid a spurious signal (see §7). |
| Service status change | `changeFacilityStatus` exists. Idempotent no-op when already at the target status (no mutation, **no** outbox row); otherwise emits one `status_changed` signal. | Re-applying the current status → `200`, no outbox row. |
| Immutability | `organizationId`, `facilityType`, `createdAt` are immutable after create (`FacilityTypes.ts`). | No org reassignment, no type change, no `PATCH` of these. |
| Error codes | `FACILITY_NOT_FOUND`, `FACILITY_ALREADY_EXISTS`, `FACILITY_ORGANIZATION_NOT_FOUND` already exist in `AppError.ErrorCode`. | No new error codes needed. |
| Enums / guards | `FacilityStatus` = `draft\|active\|inactive\|archived`; `FacilityType` = `venue\|training_site\|office\|storage_site\|partner_site\|other`; `FacilityVisibility` = `internal\|public`. Guards `isFacilityStatus`/`isFacilityType`/`isFacilityVisibility` exist. | Boundary validation fails closed on unknown enum → `400`. |
| Read DTO | Closed `FacilityDto` (omits `tenantId`) + `{ status:'ok', facility, requestId }` envelope exist and are reused by all write responses. | No new response DTO shape. |
| Authz | `facility.read`, roles `facility_reader` / `facility_admin`, `platform_admin` wildcard exist. **No `facility.write` / `facility.status.write` yet.** | Two new actions added in the implementation pass only. |
| Telemetry | `facility.registry.write.count` counter already defined (`facilityRegistryWrite`). | HTTP write adapter emits it with `operation` + `result` tags only. |
| Server routes | `FACILITY_LIST_PATH`, `FACILITY_DETAIL_ROUTE`, `ORGANIZATION_FACILITIES_ROUTE` constants exist; all GET-only. | Add a status-transition route matched **before** the detail route; extend method handling to `POST`/`PATCH`. |

**The service write path is proven** (domain baseline `027d70c`, PostgreSQL/RLS validation
`a1d23aa`). What is missing is only the thin, authorized, protocol-pure HTTP edge.

## 3. Endpoint scope

The write surface exposes exactly three routes and nothing else:

| # | Method & path | Operation | Service method (exists) | Authz action (future) |
| --- | --- | --- | --- | --- |
| 1 | `POST /v1/facilities` | Create a facility | `createFacility` | `facility.write` |
| 2 | `PATCH /v1/facilities/:facilityId` | Update safe reference fields | `updateFacility` | `facility.write` |
| 3 | `POST /v1/facilities/:facilityId/status-transitions` | Change reference-data status | `changeFacilityStatus` | `facility.status.write` |

There is **no** organization-scoped facility write route in v1
(`POST /v1/organizations/:organizationId/facilities` is **not** designed here — a facility is
created with its `organizationId` in the body of `POST /v1/facilities`, validated as a same-tenant
reference).

## 4. Explicit non-scope

Not designed and not to be smuggled in via the write surface:

- `DELETE /v1/facilities/:facilityId` or any hard delete. Records are never deleted; `inactive` /
  `archived` status is the only "removal" mechanism.
- Any organization-scoped facility **write** route.
- Booking, scheduling, calendar, or reservation routes.
- Maintenance or work-order routes.
- Inventory routes.
- Inspection / accreditation workflow routes.
- Registration, payment, enrollment, eligibility, event, or competition routes.
- Any mutation of the Organization Registry or Participant Registry.
- Any Governance Kernel invocation or governed lifecycle transition. Facility status is a
  **reference-data status field**, not a governed FSM state — it must never be routed through the
  kernel.
- Bulk import / batch mutation, CSV upload, or an admin UI.
- Any sport-specific concept, entity, or terminology, and no use of "club" as a facility primitive.
- A generic CRUD/JSON rule engine or dynamic field schema.

### 4.1 Kernel-boundary decision (final)

**All three routes are reference-data mutations through `FacilityRegistryService`. They MUST NOT
call the Governance Kernel and MUST NOT mutate governed lifecycle state
(`governance.entity_state` / `state_transition` / `audit_event` / `evidence_object`).**

Rationale: the Facility Registry is a tenant-scoped reference registry of places, not an
eligibility or regulated-lifecycle engine. Facility status is an operational availability marker
carrying no approval workflow, guard evaluation, or evidence requirement. The kernel stays reserved
for governed organizational lifecycle transitions (e.g. AffiliationApplication). If a regulated
facility-lifecycle workflow is ever needed, it must be a separate governed domain layered on top of
the registry — never retrofitted into these routes. Boundary statements that must remain true in
implementation and tests: facility status **≠** accreditation; facility status **≠** booking
availability; **no formal adjudication** happens on these routes — they set reference fields and
emit a sanitized outbox signal, nothing more.

## 5. Authorization design

Two new centralized actions (added to `src/authz/AuthorizationActions.ts` in the *implementation*
pass, not now), NSO-generic and fail-closed:

| Action constant | String key | Grants |
| --- | --- | --- |
| `FacilityWrite` | `facility.write` | Create a facility; update its safe reference fields. |
| `FacilityStatusWrite` | `facility.status.write` | Change a facility's reference-data status. |

Rules (least-privilege, explicit — no implication either way):

- Neither action is implied by `facility.read`, and neither implies the other.
- `facility.write` can create/update but **cannot** status-transition unless the actor also holds
  `facility.status.write`.
- `facility.status.write` can status-transition but **cannot** create/update unless the actor also
  holds `facility.write`.
- `facility_reader` holds neither and can never write.

Recommended v1 role mapping for the implementation pass:

| Role | `facility.write` | `facility.status.write` |
| --- | --- | --- |
| `facility_reader` | ✗ | ✗ |
| `facility_admin` | ✓ | ✓ |
| `platform_admin` | ✓ (wildcard) | ✓ (wildcard) |
| exact permission key on actor | ✓ (authoritative) | ✓ (authoritative) |

**Scope decision: v1 stays tenant-scoped only.** Authorization answers "may this actor write
facilities *in this tenant*". Tenant identity comes EXCLUSIVELY from the resolved `AuthContext`
(the `x-house-*` trusted-header contract) — never from the body or path.

- **`organization_admin` is deferred.** A tenant-scoped `facility.write` lets any holder create or
  update a facility under any organization within their tenant. Granting `organization_admin` the
  facility write actions would require a reliable **organization-scope** auth model guaranteeing an
  org admin can only write facilities for *their* organization(s). That model does not exist yet, so
  v1 does **not** grant `organization_admin` any facility write action. If it is later allowed, it
  must be scoped to the path/body organization **and** tenant.

**Do not add these actions in code during this design pass.**

## 6. Create contract — `POST /v1/facilities`

**Headers:** `Idempotency-Key` **required** (missing/blank → `400`).

**Request body (closed key set):**

```
{ "facilityId": "uuid (REQUIRED — client-supplied; see decision below)",
  "organizationId": "uuid (required)",
  "name": "string (required)",
  "facilityType": "venue|training_site|office|storage_site|partner_site|other (required)",
  "status": "draft|active|inactive|archived (optional; default draft)",
  "addressLine1": "string (optional)",
  "addressLine2": "string (optional)",
  "locality": "string (optional)",
  "region": "string (optional)",
  "postalCode": "string (optional)",
  "countryCode": "ISO 3166-1 alpha-2 (optional)",
  "latitude": "number (optional)",
  "longitude": "number (optional)",
  "contactName": "string (optional)",
  "contactEmail": "string (optional; validated + normalized by the service)",
  "contactPhone": "string (optional)",
  "visibility": "internal|public (optional)",
  "capabilityTags": "string[] (optional)" }
```

### 6.1 Decision — client-supplied `facilityId` is REQUIRED

Although `createFacility` will *generate* an id when one is absent, the write surface **requires** a
client-supplied `facilityId`, matching the Participant write convention (`POST /v1/participants`
requires a client-supplied `participantId`). Rationale:

- It makes the create **deterministically idempotent**: a retried `POST` with the same `facilityId`
  is a verified replay, not a new record.
- It enables a deterministic **duplicate → `409`** at the HTTP boundary (see §6.2) rather than a
  silent service-level replay that would look like a fresh create to the caller.
- It keeps `POST` free of "did this create a new row or replay an old one?" ambiguity.

`tenantId` comes only from the auth context and is rejected if present in the body.

### 6.2 Duplicate handling — deterministic `409` via an existence pre-check

The service treats a duplicate `(tenant, facilityId)` as an **idempotent replay** (returns the
existing row via the `conflict` outcome; it never throws). To give callers a deterministic answer,
the adapter uses a narrow read port (a `FacilityExistenceReader` exposing `getById`, satisfied
structurally by both the in-memory and Pg stores) to pre-check:

- If a facility with that `facilityId` already exists for the tenant → `409`
  (`FACILITY_ALREADY_EXISTS`). This mirrors the Participant create pre-check exactly.
- Otherwise the adapter calls `createFacility` and returns `201`.

> **Concurrency note (deliberate, correct difference from Participant):** the Facility store has no
> unique-violation (`23505`) path — its create does an in-transaction `FOR UPDATE` existence check
> and returns the `conflict` outcome. So a rare *concurrent* duplicate resolves to an idempotent
> replay (the second caller receives the existing row) rather than a `409`. This never creates two
> rows and never fabricates a conflict. The implementation must therefore treat the service's
> `conflict` outcome as a successful idempotent replay (return the existing `FacilityDto`), while
> the adapter pre-check supplies the deterministic `409` for the common sequential duplicate. Tests
> assert both: sequential duplicate → `409`; the service `conflict` outcome is surfaced safely.

### 6.3 Organization validation

- `organizationId` is required and validated by the service via the read-only `OrganizationReader`
  (same-tenant existence). Cross-tenant organizations are invisible under RLS.
- Missing / cross-tenant organization → **`404`** (`FACILITY_ORGANIZATION_NOT_FOUND`).
  **Decision: `404`, not `400`** — it is privacy-preserving (never reveals whether the org exists in
  another tenant) and consistent with the Participant link route's `ORGANIZATION_NOT_FOUND → 404`.

### 6.4 Behavior summary

- `tenantId` only from auth context; `organizationId` required and same-tenant validated.
- Invalid `facilityType` / `status` / `countryCode` / `contactEmail` / coordinates → `400`.
- Missing `Idempotency-Key` → `400`.
- Duplicate `facilityId` → `409` (§6.2).
- Response `201 { status:'ok', facility: FacilityDto, requestId }`.
- The adapter delegates to `FacilityRegistryService.createFacility`; it **never** enqueues an
  outbox message itself (the service/Pg store owns the transactional outbox).

## 7. Update contract — `PATCH /v1/facilities/:facilityId`

**Headers:** no `Idempotency-Key` required (a `PATCH` is deterministic; matches the Participant
`PATCH` convention).

**Request body (closed key set — the fields `updateFacility` accepts):**

```
{ "name": "string (optional)",
  "addressLine1": "string|null (optional)",
  "addressLine2": "string|null (optional)",
  "locality": "string|null (optional)",
  "region": "string|null (optional)",
  "postalCode": "string|null (optional)",
  "countryCode": "string|null (optional)",
  "latitude": "number|null (optional)",
  "longitude": "number|null (optional)",
  "contactName": "string|null (optional)",
  "contactEmail": "string|null (optional)",
  "contactPhone": "string|null (optional)",
  "visibility": "internal|public|null (optional)",
  "capabilityTags": "string[]|null (optional)" }
```

Rules:

- **No status change through `PATCH`** — `status` is a rejected (unknown) key → `400`. Use the
  status-transition route.
- **No `facilityType` change** — it is **immutable** after create (domain invariant; `updateFacility`
  does not accept it). `facilityType` in the body is a rejected key → `400`.
  > This resolves the one place the original write-surface sketch diverged from the domain: v1 does
  > **not** allow facility-type changes.
- **No `organizationId` change** — organization reassignment is not allowed in v1; `organizationId`
  in the body is a rejected key → `400`.
- **No `facilityId` in the body** — the id comes from the path only; body `facilityId` → `400`.
- Tri-state clearing: `null` clears a field, `undefined` (omitted) leaves it unchanged, a value
  replaces it — following the existing `updateFacility` merge semantics exactly.
- **Empty body decision: reject `{}` (no recognized updatable field) → `400`** (`INVALID_INPUT`,
  "at least one updatable field is required"). Rationale: `updateFacility` has **no** no-op
  short-circuit — it always writes a new `updatedAt` and emits an `updated` outbox signal — so an
  empty `PATCH` would produce a meaningless mutation and signal. Rejecting it at the boundary keeps
  the surface fail-closed and avoids spurious signals. (This is a deliberate boundary guard; the
  service itself is unchanged.)
- Missing / cross-tenant facility → `404` (`FACILITY_NOT_FOUND`) — cross-tenant is indistinguishable
  from missing.
- Invalid enum/value (`countryCode`, `contactEmail`, coordinates, `visibility`) → `400`.
- Response `200 { status:'ok', facility: FacilityDto, requestId }`.
- Delegates to `FacilityRegistryService.updateFacility`; never enqueues outbox directly.

## 8. Status-transition contract — `POST /v1/facilities/:facilityId/status-transitions`

**Headers:** `Idempotency-Key` **required** (missing/blank → `400`).

**Request body (closed key set):**

```
{ "targetStatus": "draft|active|inactive|archived (required)",
  "reason": "string (optional, max 1024 chars)" }
```

Rules:

- This is a **reference-data status change only** — NOT a governed lifecycle transition, and it
  makes **no** Governance Kernel call.
- Invalid / unknown `targetStatus` → `400`.
- Missing / cross-tenant facility → `404` (`FACILITY_NOT_FOUND`).
- **Idempotent no-op:** re-applying the current status → `200`, **no** outbox row (the service
  already short-circuits when `current.status === targetStatus`).
- **`reason` decision:** accepted and length-validated at the HTTP boundary for future audit-log
  correlation only. It is **NOT** passed to the service (`ChangeFacilityStatusInput` has no `reason`
  field), **NOT** persisted, and **NEVER** placed in an outbox payload or telemetry. It is a
  boundary-only field. (Mirrors the Participant status-transition `reason` stance.)
- Response `200 { status:'ok', facility: FacilityDto, requestId }`.
- Delegates to `FacilityRegistryService.changeFacilityStatus`; never enqueues outbox directly.

## 9. DTO closure and field rejection

All three request bodies are **closed**: any key outside the documented allow-list fails closed with
`400` (`INVALID_INPUT`, `Unknown field '<key>' is not allowed for <route>`), reusing the read
adapter's object-body + unknown-key guards. Closed key sets to define in a new
`FacilityWriteHttpDtos.ts`:

- `FACILITY_CREATE_BODY_KEYS` = `facilityId, organizationId, name, facilityType, status,
  addressLine1, addressLine2, locality, region, postalCode, countryCode, latitude, longitude,
  contactName, contactEmail, contactPhone, visibility, capabilityTags`.
- `FACILITY_UPDATE_BODY_KEYS` = `name, addressLine1, addressLine2, locality, region, postalCode,
  countryCode, latitude, longitude, contactName, contactEmail, contactPhone, visibility,
  capabilityTags`.
- `FACILITY_STATUS_TRANSITION_BODY_KEYS` = `targetStatus, reason`.

Explicitly rejected everywhere (→ `400`): `tenantId`, `current_setting`, `rls`, `sql`, `createdAt`,
`updatedAt`, any outbox metadata, auth headers, a body-supplied `requestId` / `correlationId`,
`status` in `PATCH`, `facilityType` in `PATCH`, `organizationId` in `PATCH`, `facilityId` in `PATCH`,
enum values outside the confirmed sets, and any booking / scheduling / maintenance / work-order /
inventory / registration / payment / enrollment / eligibility / event / competition / sport-specific
field.

**Response DTO:** reuse the existing read `FacilityDto` (no `tenantId`, no SQL/internal metadata, no
outbox metadata) inside `{ status:'ok', facility, requestId }`. A key-set assertion test guards that
the write responses expose exactly the read DTO keys.

## 10. Idempotency and correlation

Conservative, **no-new-infrastructure** model matching the service today:

- `Idempotency-Key` is **required** on the two `POST` routes (create, status-transition) and
  **not required** on `PATCH`.
- The key is used as **correlation lineage only** — mapped into the service's outbox
  `correlationId` / `causationId` metadata. **Do not** introduce a generic idempotency/replay table
  in this surface.
- **Create replay is deterministic:** the required client-supplied `facilityId` plus the adapter
  duplicate pre-check make a retried create a verified replay (`409` for the sequential duplicate;
  safe idempotent replay of the existing row under the rare concurrent case — §6.2).
- **Status transitions are idempotent by construction:** a repeat to the current status is a no-op
  (`200`, no outbox row).
- **Key reuse with a materially different body → `409`:** **deferred.** There is no replay cache to
  detect a body mismatch for the same key, so v1 does not attempt it. Documented as a future
  enhancement, not a v1 obligation.

## 11. Error mapping

Extends the read adapter's status mapper into a `facilityWriteAppErrorStatus`:

| Condition | `ErrorCode` | HTTP |
| --- | --- | --- |
| Malformed JSON / body not an object / unknown or misplaced field / bad enum / missing `Idempotency-Key` / empty `PATCH` / invalid coordinate or contact value | `INVALID_INPUT` | `400` |
| Unauthenticated (no/blank tenant or actor) | `UNAUTHENTICATED` | `401` |
| Authorization check fails | `FORBIDDEN` / `PERMISSION_DENIED` | `403` |
| Facility not found / cross-tenant | `FACILITY_NOT_FOUND` | `404` |
| Organization not found / cross-tenant (create) | `FACILITY_ORGANIZATION_NOT_FOUND` | `404` |
| Duplicate `facilityId` for the tenant (sequential create) | `FACILITY_ALREADY_EXISTS` | `409` |
| Unexpected store/DB error | (any) | `500` (opaque, sanitized) |

**Cross-tenant rule (non-negotiable):** a facility or organization that exists only in another
tenant returns the **same** `404` as a truly missing id — never a distinguishable response that
could be used as a cross-tenant existence probe. A `409` occurs **only** for an in-tenant duplicate
`facilityId`.

Error bodies stay sanitized (`{ status:'error', code, message, requestId }`). They must **never**
leak: facility `name` / address / contact fields, the request body, raw headers, bearer tokens,
connection strings, stack traces, or SQL messages. Unknown errors collapse to an opaque `500`
(`INTERNAL`).

## 12. Privacy, telemetry, and outbox

**Telemetry** (HTTP write boundary): emit the existing `facility.registry.write.count`
(`facilityRegistryWrite`) counter tagged with `operation` (`create` / `update` / `status_change`)
and `result` (`success` / `failure`) only. It must **never** carry facility `name`, address, contact
fields, coordinates, `capabilityTags`, the request body, raw headers, bearer tokens, or raw bytes.
(Redaction is enforced by `ExportingTelemetry`; the tests assert the emitted snapshot is free of
these.)

**Outbox:** the HTTP adapter **never** enqueues an outbox message directly — the service / Pg store
owns the transactional outbox. Existing payload safety is unchanged: `created` / `updated` /
`status_changed` payloads carry **identity + status metadata only** and exclude `name`, address,
contact fields, coordinates, `capabilityTags`, `reason`, tokens, raw headers, and body bytes.

## 13. Server route ordering

The write pass extends `src/http/server.ts` (in the implementation pass only):

- Add `FACILITY_STATUS_TRANSITION_ROUTE = /^\/v1\/facilities\/([^/]+)\/status-transitions\/?$/` and
  **match it BEFORE** `FACILITY_DETAIL_ROUTE` (`/^\/v1\/facilities\/([^/]+)\/?$/`), so the status
  sub-resource is never shadowed by the detail route.
- `/v1/facilities` collection: `GET` (list) + `POST` (create). Method table → `Allow: GET, POST`.
- `/v1/facilities/:facilityId` detail: `GET` (detail) + `PATCH` (update). Method table →
  `Allow: GET, PATCH`.
- `/v1/facilities/:facilityId/status-transitions`: `POST` only. Method table → `Allow: POST`.
- Unsupported methods on each route → `405` with the correct `Allow` header.
- Deeper unknown paths (e.g. `/v1/facilities/:id/status-transitions/extra`) → `404`.
- The organization-scoped facility read route `/v1/organizations/:organizationId/facilities` stays
  **GET-only** (no org-scoped facility write route in v1).
- The read routes and the Participant/Organization routes must remain unshadowed and unchanged.

## 14. Test matrix

### 14.1 Hermetic adapter tests (create)

1. `facility_admin` can create → `201`.
2. exact `facility.write` can create → `201`.
3. `facility_reader` cannot create → `403`.
4. missing auth/tenant → `401`.
5. missing `Idempotency-Key` → `400`.
6. missing / cross-tenant organization → `404`.
7. invalid `facilityType` / `status` → `400`.
8. unknown / misplaced field (incl. `tenantId`) → `400`.
9. duplicate `facilityId` (sequential) → `409`.
10. response uses the closed `FacilityDto` envelope (no `tenantId`).
11. adapter enqueues **no** outbox row directly (service owns it).
12. adapter makes **no** Governance Kernel call.
13. adapter performs **no** Organization Registry mutation (read-only existence check).
14. telemetry carries only `operation` + `result` (no name/address/contact/coords/tags/body/headers).

### 14.2 Hermetic adapter tests (update)

1. `facility_admin` can update → `200`.
2. exact `facility.write` can update → `200`.
3. `facility_reader` cannot update → `403`.
4. `status` in `PATCH` → `400` (rejected key).
5. `facilityType` in `PATCH` → `400` (immutable/rejected key).
6. `organizationId` in `PATCH` → `400` (rejected key).
7. explicit `null` clears a field; omitted leaves it unchanged (tri-state).
8. empty body `{}` → `400`.
9. missing / cross-tenant facility → `404`.
10. response uses `FacilityDto`.
11. no direct outbox enqueue.
12. telemetry safe.

### 14.3 Hermetic adapter tests (status transition)

1. `facility_admin` can status-transition → `200`.
2. exact `facility.status.write` can status-transition → `200`.
3. `facility.write` **alone** cannot status-transition → `403` (unless the actor also holds
   `facility.status.write`).
4. missing `Idempotency-Key` → `400`.
5. invalid `targetStatus` → `400`.
6. repeat to current status → `200`, **no** outbox row.
7. missing / cross-tenant facility → `404`.
8. no Governance Kernel call.
9. no direct outbox enqueue.
10. `reason` is boundary-validated but never persisted / signalled.
11. telemetry safe.

### 14.4 Server-transport tests

- `POST` / `PATCH` / status `POST` dispatch to the correct handlers.
- `405` + correct `Allow` header on each route (`GET, POST` / `GET, PATCH` / `POST`).
- status route is matched before the detail route (no shadowing).
- malformed JSON body → deterministic `400` (never `500`, never a partial write).
- deeper unknown paths → `404`.
- existing read routes (`GET /v1/facilities`, detail, org-facilities) still work unchanged.
- Participant / Organization routes remain unshadowed.

### 14.5 Gated DB/RLS tests (later, `RUN_DB_TESTS=1`)

Add a gated suite proving, through the **real** HTTP/Pg path under a least-privilege
(`NOSUPERUSER`, `NOBYPASSRLS`) runtime role with FORCE RLS:

1. own-tenant create / update / status-transition succeed.
2. `facility.write` / `facility.status.write` enforced (reader → `403`).
3. missing `Idempotency-Key` → `400`; duplicate `facilityId` → `409`.
4. cross-tenant facility mutation is indistinguishable from not-found (`404`).
5. cross-tenant organization on create → `404`.
6. the facility row + its sanitized outbox row commit **atomically** (rollback leaves no orphan).
7. a real status change writes exactly one sanitized `status_changed` row; a no-op writes none.
8. outbox payloads exclude name / address / contact / coordinates / `capabilityTags` / `reason`.
9. **no** mutation of `governance.entity_state` / `state_transition` / `audit_event`.
10. **no** mutation of the Organization Registry.
11. FORCE RLS remains enabled on `facility_registry.facility`; the role is non-superuser /
    non-`BYPASSRLS`.
12. the runtime role holds the minimum write grants (`SELECT` + `INSERT` + `UPDATE`, **no** DELETE).
13. read routes still work unchanged.

Harness contract: `MIGRATE_DATABASE_URL` = admin/migration URL; `DATABASE_URL` = the **restricted**
runtime role; role/grant provisioning holds the shared `pg_advisory_lock(918273)`; the suite uses a
**unique tenant-UUID namespace** distinct from every existing integration suite (the read-HTTP suite
already reserves `…00a9` / `…00ba`).

## 15. Validator plan

When the write surface is **implemented**, `validateFacilityRegistryBaseline` must be updated to:

- expect the Facility write HTTP DTO/adapter files (`FacilityWriteHttpDtos.ts`,
  `FacilityWriteHttpAdapter.ts`) to **exist** (flip the current write-files-absent guard).
- expect `facility.write` and `facility.status.write` to be **present** in the authorization catalog.
- still **forbid** `DELETE /v1/facilities/:facilityId` and any hard-delete surface.
- still **forbid** booking / scheduling / calendar / maintenance / work-order / inventory /
  inspection / accreditation / registration / payment / enrollment / eligibility / event /
  competition terms in facility HTTP code.
- assert the write adapter does **not** import or call the Governance Kernel.
- assert the write adapter does **not** directly enqueue an outbox message.
- assert the write adapter does **not** mutate the Organization Registry.
- assert the three write routes are wired in `server.ts` only once implemented.
- preserve the read-route expectations and the no-sport-terminology guard.

**For this design pass**, the only (low-risk) validator change is a **design-only** check that this
preflight exists and documents the three future write routes (by their `METHOD /path` strings). It
does **not** invert any implementation guard: the write HTTP files and `facility.write` /
`facility.status.write` actions must still be **absent** until the implementation pass.

## 16. Implementation sequence (when approved)

1. **Authz** — add `FacilityWrite` + `FacilityStatusWrite` actions and the `facility_admin`
   role mapping; deny-by-default unit tests (`facility_reader` denied; `facility.write` alone cannot
   status-transition; wildcard works).
2. **DTOs** — add `FacilityWriteHttpDtos.ts` (closed create/update/status body key sets + write
   response type reusing `FacilityDto`); key-set assertion tests.
3. **Adapter** — add `FacilityWriteHttpAdapter.ts`: three protocol-pure handlers over
   `FacilityRegistryService` + a `FacilityExistenceReader` create pre-check; extend the read status
   mapper into `facilityWriteAppErrorStatus`. No server wiring yet.
4. **Hermetic adapter tests** — the full §14.1–§14.3 matrix (success + every negative path + DTO /
   telemetry safety + no-direct-outbox + no-kernel + no-org-mutation + idempotent no-op).
5. **Server routing** — add the status-transition route (matched before detail); extend collection
   and detail routes to `POST` / `PATCH`; correct `Allow` headers; §14.4 transport tests; read and
   cross-domain routes unaffected.
6. **Composition** — wire `facilityWrite` deps (service + existence read store + telemetry) in
   `composition.ts`, reusing `PgFacilityRegistryStore`.
7. **Gated DB / RLS tests** — the full §14.5 matrix.
8. **Validator + docs** — flip the baseline validator/docs from "no write surface" to "write surface
   present"; update this preflight and the domain baseline.
9. **Validation + commit.**

## 17. Risks / open questions

- **Create-conflict semantics (resolved):** the service is idempotent-replay, not conflict-erroring.
  The adapter pre-check supplies the deterministic `409`; the concurrent-duplicate case resolves to a
  safe idempotent replay (§6.2). Confirmed against the store implementation; no service change.
- **`facilityType` immutability (resolved):** v1 `PATCH` does **not** change facility type — it is a
  rejected key. Any future type-change capability is a separate, explicitly-requested decision.
- **Empty `PATCH` (resolved):** rejected at the boundary to avoid a spurious `updated` signal, since
  `updateFacility` has no no-op short-circuit. If a future change adds a service-level no-op
  short-circuit, this boundary guard can be revisited.
- **`organization_admin` grant (deferred):** blocked on an org-scoped authorization model.
- **Body-mismatch on idempotency-key reuse (deferred):** no replay cache in v1.
- **Org reassignment (out of scope for v1):** `organizationId` is immutable via `PATCH`.

## 18. Go / no-go checklist

Implementation may begin **only** when all are true:

- [ ] Kernel-boundary decision (§4.1: reference-data, never the kernel) is accepted.
- [ ] The two actions + tenant-scoped role mapping (§5), with `organization_admin` deferred, are
      accepted.
- [ ] The create contract (§6) — client-supplied `facilityId` required, `409` via pre-check,
      organization `404` — is accepted.
- [ ] The update contract (§7) — `facilityType` / `status` / `organizationId` rejected, empty body
      `400`, tri-state clearing — is accepted.
- [ ] The status-transition contract (§8) — separate action, idempotent no-op, `reason`
      boundary-only — is accepted.
- [ ] The DTO closure / field-rejection rules (§9) are accepted.
- [ ] The idempotency/correlation stance (§10: key-as-correlation-only, no idempotency table) is
      accepted.
- [ ] The error-mapping table incl. the cross-tenant-`404` rule (§11) is accepted.
- [ ] The privacy / telemetry / outbox rules (§12) are accepted.
- [ ] The server route ordering (§13: status route before detail) is accepted.
- [ ] The full hermetic + gated RLS/DB matrix (§14) is accepted as required, not optional.
- [ ] No scope creep from §3/§4 (no DELETE, no booking/scheduling/maintenance/inventory/payment/
      registration/enrollment/eligibility/event/competition, no sport-specific fields, no
      Organization/Participant Registry mutation, no kernel invocation, no frontend).

Until every box is checked, **no write endpoint, route, DTO, action, or service change is
implemented.** This document is the contract; the implementation pass is separate.

## 19. Recommended next pass

- **Facility HTTP write phase 1 — create + update only** (`POST /v1/facilities`,
  `PATCH /v1/facilities/:facilityId`), gated by `facility.write`, with the §14.1–§14.2 hermetic
  matrix and server-transport tests. Defer the status-transition route to a focused follow-up.
- **Facility HTTP status-transition implementation** (`POST /v1/facilities/:facilityId/status-transitions`),
  gated by `facility.status.write`, with the §14.3 matrix.
- **Facility HTTP write PostgreSQL/RLS validation** (§14.5 gated suite).
- Later, independently: **actual Azure dev-environment smoke execution.**

This pass defines Facility writes without implementing them or importing any operational or
sport-specific semantics.
