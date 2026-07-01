# Facility HTTP read-surface preflight

> **Status: IMPLEMENTED.** The Facility HTTP read surface described by this document has shipped:
> the three GET routes (`/v1/facilities`, `/v1/facilities/:facilityId`,
> `/v1/organizations/:organizationId/facilities`), the read DTOs, the `facilityHttpAuth` helper, the
> `FacilityReadHttpAdapter`, the `facility.read` authorization action (mapped to `facility_reader`
> and `facility_admin`), server route wiring, composition wiring, and hermetic adapter + server
> tests all exist. The **write surface remains out of scope** (see below) and is a separate future
> pass. This document is retained as the fixed read contract.
>
> **One implementation deviation from this document:** the shipped `FacilityDto` deliberately OMITS
> `tenantId` (the tenant is established by the authenticated context and is never echoed in a read
> body). The DTO table below still lists `tenantId`; the implemented closed key set excludes it.
> All other fields match.
>
> **PostgreSQL/RLS validation executed.** The read surface was validated end-to-end over real local
> PostgreSQL with a restricted (`NOSUPERUSER`, `NOBYPASSRLS`) runtime role by the gated suite
> `tests/integration/governance/facility-registry-http.integration.test.ts` (29 tests). It drives the
> three GET routes through the native HTTP server backed by `PgFacilityRegistryStore` and proves
> tenant isolation, `FORCE ROW LEVEL SECURITY` on `facility_registry.facility`, authz/role/wildcard
> behavior, closed-key `tenantId`-free DTOs, filter/cursor validation, HTTP limit clamping, 401/403/
> 404/405 mapping, org-route non-shadowing, and non-mutation of facility/organization/governance
> tables plus no outbox rows. The suite skips cleanly when `RUN_DB_TESTS` is unset, so default
> `npm test` stays hermetic. The **write surface remains deferred.**
>
> This document fixes the read boundary — endpoints, DTOs, authorization, privacy, pagination/filter
> behavior, server route sequencing, error mapping, the test matrix, the validator plan, and the
> implementation sequence — so that the **Facility HTTP read surface** could be implemented
> deterministically without re-litigating scope mid-implementation.
>
> The Facility HTTP read surface will be a **thin, GET-only projection** over the existing Facility
> Registry read store. It NEVER writes, NEVER enqueues an outbox message, NEVER invokes the
> Governance Kernel, and NEVER mutates the Organization or Participant registries. It mirrors the
> proven Participant/Organization read-adapter template.

Preceding context: the Facility Registry **domain baseline** (`027d70c`) and its **PostgreSQL/RLS
validation** (`a1d23aa`) are complete and green. The registry is tenant-scoped, RLS-forced,
outbox-sanitized reference data with a `FacilityRegistryService` that already exposes
`getFacility`, `listFacilities`, and `listFacilitiesForOrganization`. This preflight is step 3 of
the HTTP sequence fixed in
[facility-domain-preflight-coverage-map.md](./facility-domain-preflight-coverage-map.md) §12.

---

## 1. Purpose

Give an authorized, same-tenant operator a **read-only** HTTP surface over the Facility Registry —
list facilities, inspect one facility, and list an organization's facilities — reusing the exact
transport pattern already proven for the Participant Registry read surface
([`ParticipantReadHttpAdapter`](../../src/http/participant/ParticipantReadHttpAdapter.ts)) and the
Organization Registry read surface. This document is the contract the read-surface implementation
pass and its reviewers check against, so the implementation pass can proceed without deciding —
under time pressure — the DTO shape, the authorization action/roles, the pagination cap, the error
mapping, the privacy rules, or the route ordering.

Concretely, this document:

1. Fixes the read **endpoint scope** (and explicit non-scope — no write surface here).
2. Fixes the **authorization** action (`facility.read`) and role mapping (design only — not added).
3. Fixes the **DTO contract** (flat, null-normalized, closed key set).
4. Fixes **filters + pagination** (opaque cursor, HTTP limit cap, fail-closed validation).
5. Fixes **HTTP error mapping** (401 / 403 / 400 / 404 / 500).
6. Fixes **privacy + telemetry** rules (authorized same-tenant body may carry descriptive data;
   telemetry/outbox must not).
7. Fixes **server route ordering** so the new routes never shadow existing organization/participant
   routes.
8. Enumerates the **test matrix** (hermetic adapter + server tests; later gated Pg/RLS via HTTP).
9. Plans the future **`facility:check`** validator changes.
10. Records **risks / open questions**, a **go/no-go checklist**, and the **recommended next pass**.

---

## 2. Current readiness

- **Facility Registry domain baseline** (`027d70c`) — `FacilityTypes.ts`,
  `FacilityRegistryErrors.ts`, `FacilityRegistryStore.ts`, `InMemoryFacilityRegistryStore.ts`,
  `PgFacilityRegistryStore.ts`, `FacilityRegistryService.ts`, `index.ts`, migration
  `0011_facility_registry.sql`, unit + gated integration tests, `facility:check` validator.
- **Facility Registry PostgreSQL/RLS validation** (`a1d23aa`) — FORCE RLS, restricted runtime role
  (NOSUPERUSER / NOBYPASSRLS, `SELECT/INSERT/UPDATE` only, no DELETE), tenant isolation, the
  read-only organization dependency, outbox atomicity, and payload sanitization all proven live.
- **Read building blocks already present** (no new domain code needed for reads):
  - `FacilityRegistryService.getFacility(tenantId, facilityId)` → `FacilityView | undefined`.
  - `FacilityRegistryService.listFacilities(tenantId, filter)` → `FacilityListResult`.
  - `FacilityRegistryService.listFacilitiesForOrganization(tenantId, filter)` → `FacilityListResult`.
  - `FacilityListFilter` = `{ organizationId?, facilityType?, status?, limit?, cursor? }`.
  - `FacilityListCursor` = `{ createdAt, id }`; `FacilityListResult` = `{ items, nextCursor? }`.
  - `FACILITY_LIST_DEFAULT_LIMIT = 50`, `FACILITY_LIST_MAX_LIMIT = 200`, `clampFacilityListLimit`.
  - Type guards `isFacilityStatus`, `isFacilityType`, `isFacilityVisibility`.
  - Error codes `ErrorCode.FACILITY_NOT_FOUND`, `ErrorCode.FACILITY_ORGANIZATION_NOT_FOUND` already
    exist in [`AppError`](../../src/shared/errors/AppError.ts).
  - Telemetry counter `facility.registry.read.count` (`TelemetryCounters.facilityRegistryRead`)
    already exists in [`TelemetryEvents`](../../src/observability/TelemetryEvents.ts) — **no new
    telemetry name is required** for reads.
- **Proven transport template to copy**: [`ParticipantReadHttpAdapter`](../../src/http/participant/ParticipantReadHttpAdapter.ts),
  [`ParticipantReadHttpDtos`](../../src/http/participant/ParticipantReadHttpDtos.ts),
  [`participantHttpAuth`](../../src/http/participant/participantHttpAuth.ts), and the server
  dispatch/route-constant pattern in [`server.ts`](../../src/http/server.ts).

The read surface therefore needs **new HTTP-edge code only** (adapter + DTOs + auth helper + server
routing + one authz action + role entries) — no new domain, store, migration, or telemetry name.

---

## 3. Endpoint scope

Exactly three GET endpoints. **No write endpoints in this pass.**

| # | Method + path | Handler (proposed) | Store call | Auth |
| --- | --- | --- | --- | --- |
| 1 | `GET /v1/facilities` | `handleFacilityList` | `listFacilities(tenantId, filter)` | `facility.read` |
| 2 | `GET /v1/facilities/:facilityId` | `handleFacilityDetail` | `getFacility(tenantId, facilityId)` | `facility.read` |
| 3 | `GET /v1/organizations/:organizationId/facilities` | `handleOrganizationFacilityList` | `listFacilitiesForOrganization(tenantId, filter)` | `facility.read` |

All three:

- resolve tenant **exclusively** from the resolved `AuthContext` (trusted `x-house-*` headers) —
  never from query/path/body;
- enforce the single `facility.read` action through the centralized policy
  (`assertAuthorized(auth, AuthorizationAction.FacilityRead, telemetry)`);
- are read-only: no writes, no outbox enqueue, no kernel call, no Organization/Participant mutation;
- read through a **narrow read port** (`FacilityReadStore`, see §6) that is a structural subset of
  `FacilityRegistryStore`, so no write method is reachable from the HTTP read surface.

---

## 4. Explicit non-scope

Not designed or implemented in this pass (and none may be smuggled in via the read surface):

- **Write endpoints** — `POST /v1/facilities`, `PATCH /v1/facilities/:facilityId`,
  `POST /v1/facilities/:facilityId/status-transitions`, any `DELETE` route. These are a **separate,
  later, separately-gated write preflight + implementation** (HTTP sequence steps 4–6).
- Any `facility.write` / `facility.status.write` authorization action (deferred to the write pass).
- Booking, scheduling, calendar, reservation, availability routes.
- Maintenance / work-order, inventory, inspection, accreditation, contract routes.
- Registration, payment, program-enrollment, eligibility, event, or competition routes.
- Any frontend/UI.
- Any Governance Kernel invocation, governed lifecycle transition, or evidence/approval flow.
- Any sport-specific concept or vocabulary (NSO-generic only; see §5 of the coverage map).

---

## 5. Authorization design

**One new action** (added in code during the read *implementation* pass, **not now**):

| Action constant | String key |
| --- | --- |
| `AuthorizationAction.FacilityRead` | `facility.read` |

Because `KNOWN_ACTIONS` is derived from `Object.values(AuthorizationAction)`, adding the entry
automatically makes it a known, fail-closed action.

**Role mapping** (added to `ROLE_ACTION_MAP` during implementation; mirrors the read-only
`organization_reader` / `organization_admin` precedent):

| Role | grants `facility.read` |
| --- | --- |
| `facility_reader` | ✓ |
| `facility_admin` | ✓ (read-only at the HTTP edge in v1 — write actions arrive in the write pass) |
| `platform_admin` | ✓ (existing wildcard super-role; no map entry needed) |
| exact permission key `facility.read` on the actor | ✓ (via the policy's exact-permission grant) |

**Fail-closed behavior** (identical to the Participant/Organization read surface):

- missing/blank tenant identity → **401** (`requireTenant` throws `UnauthenticatedError`);
- authenticated but not authorized for `facility.read` → **403** (policy denies + emits the
  centralized `authz.denied` signal);
- cross-tenant facility (detail) → **404** (indistinguishable from missing — never reveals
  cross-tenant existence);
- cross-tenant / unknown organization (org-scoped list) → **empty list** (never probes existence).

**Deferrals (documented decisions):**

- **`organization_admin` is deferred** for facility read. Granting an org admin facility access
  requires a proven **organization-scoped** authorization model (so an org admin sees only *their*
  organization's facilities). That model does not exist yet — same reasoning as the Participant
  Registry deferral. If `organization_admin` is later allowed, it **must be scoped to the
  organization path and tenant**; do **not** add broad tenant-level `organization_admin` facility
  access by default.
- Start v1 with `facility_reader` + `facility_admin` + `platform_admin` wildcard + exact
  `facility.read` permission key only.

---

## 6. DTO contract

### Read port (narrow, read-only)

```ts
export interface FacilityReadStore {
  listFacilities(tenantId: string, filter: FacilityListFilter): Promise<FacilityListResult>;
  getFacilityById(tenantId: string, facilityId: string): Promise<FacilityView | undefined>;
  listFacilitiesForOrganization(
    tenantId: string,
    filter: FacilityListFilter, // organizationId bound from the path, not the query
  ): Promise<FacilityListResult>;
}
```

Both `InMemoryFacilityRegistryStore` and `PgFacilityRegistryStore` satisfy this structurally (it is
a subset of the existing read methods), so no write path is reachable from the adapter. If the
service method names differ (`getFacility` vs `getFacilityById`), the implementation wraps the
service or adds a trivial structural alias — **no store/service behavior change**.

### `FacilityDto` — flat, null-normalized, CLOSED key set

**Decision: FLAT + null-normalized**, exactly like
[`ParticipantDto`](../../src/http/participant/ParticipantReadHttpDtos.ts) and the Organization DTO —
**not** the nested `address` / `geo` / `contact` grouping sketched in the request. Rationale: (a)
every existing read DTO in this codebase is flat and null-normalized; (b) a unit test asserts the
**exact** DTO key set so internal/sensitive fields can never leak, which is simplest against a flat
shape; (c) the store view (`FacilityView` = `FacilityRecord`) is already flat and already exposes
`facilityId` (no `id`→`facilityId` remap needed). The nested grouping is recorded as an **open
question with default = flat** in §14; if a reviewer prefers nesting, decide before implementation.

| DTO field | Source (`FacilityView`) | Wire type | Notes |
| --- | --- | --- | --- |
| `tenantId` | `tenantId` | `string` | From the row (equals the auth tenant). |
| `facilityId` | `facilityId` | `string` | Store already exposes `facilityId`. |
| `organizationId` | `organizationId` | `string` | Owning organization (same tenant). |
| `name` | `name` | `string` | Authorized same-tenant descriptive data (see §9). |
| `facilityType` | `facilityType` | `FacilityType` | Closed enum. |
| `status` | `status` | `FacilityStatus` | Closed enum. |
| `addressLine1` | `addressLine1?` | `string \| null` | Null-normalized. |
| `addressLine2` | `addressLine2?` | `string \| null` | |
| `locality` | `locality?` | `string \| null` | |
| `region` | `region?` | `string \| null` | |
| `postalCode` | `postalCode?` | `string \| null` | |
| `countryCode` | `countryCode?` | `string \| null` | |
| `latitude` | `latitude?` | `number \| null` | Site coordinate; excluded from telemetry/outbox. |
| `longitude` | `longitude?` | `number \| null` | |
| `contactName` | `contactName?` | `string \| null` | |
| `contactEmail` | `contactEmail?` | `string \| null` | |
| `contactPhone` | `contactPhone?` | `string \| null` | |
| `visibility` | `visibility?` | `FacilityVisibility \| null` | `internal \| public`; reference flag only, grants nothing. |
| `capabilityTags` | `capabilityTags?` | `string[]` | Normalized to `[]` when absent (mirrors `externalRefs`). |
| `createdAt` | `createdAt` | `string` | ISO timestamp. |
| `updatedAt` | `updatedAt` | `string` | ISO timestamp. |

**Excluded from the DTO entirely** (never projected): raw store/SQL metadata, tenant auth/RLS
settings (`app.tenant_id`), outbox metadata (dedupe keys, correlation/causation ids), request
headers, bearer tokens, connection strings, and raw request/response bytes. The DTO is a 1:1
projection of `FacilityView` plus null-normalization — nothing more.

### Response envelopes

**Decision: reuse the existing read envelope** (`{ status: 'ok', …, requestId }` with a `page`
object), **not** the bare `{ items, nextCursor }` / `{ facility }` sketch — for consistency with
every other read surface and to carry the `requestId` correlation handle.

```ts
// GET /v1/facilities and GET /v1/organizations/:organizationId/facilities
type FacilityListResponseBody = {
  readonly status: 'ok';
  readonly items: readonly FacilityDto[];
  readonly page: { readonly limit: number; readonly nextCursor: string | null };
  readonly requestId: string;
};

// GET /v1/facilities/:facilityId
type FacilityDetailResponseBody = {
  readonly status: 'ok';
  readonly facility: FacilityDto;
  readonly requestId: string;
};
```

Error bodies use the shared shape `{ status: 'error', code, message, requestId }`.

---

## 7. Filters and pagination

### `GET /v1/facilities` query parameters

| Param | Rule |
| --- | --- |
| `status` | Optional. Must satisfy `isFacilityStatus` (`draft \| active \| inactive \| archived`); else **400**. |
| `facilityType` | Optional. Must satisfy `isFacilityType` (`venue \| training_site \| office \| storage_site \| partner_site \| other`); else **400**. |
| `organizationId` | Optional. Non-blank string filter (ANDed). |
| `limit` | Optional. Positive integer; non-integer/`< 1` → **400**. Clamped to the HTTP cap (below). |
| `cursor` | Optional. Opaque base64url token; malformed → **400**. |

### `GET /v1/organizations/:organizationId/facilities` query parameters

| Param | Rule |
| --- | --- |
| `status` | Optional; same validation as above. |
| `facilityType` | Optional; same validation as above. |
| `limit` | Optional; same validation + clamp. |
| `cursor` | Optional; same validation. |
| ~`organizationId`~ | **Not accepted from the query** — it comes from the path and **wins**. |

### Rules (fixed)

- **Tenant always from auth context**, never the query/path/body. Any `tenantId` in the query is
  ignored.
- **`organizationId` path wins** on the org-scoped route (query `organizationId` is not read there).
- Invalid `status` / `facilityType` / `limit` / `cursor` → **400** (fail closed, before any store
  call).
- **HTTP limit cap = 100** (new constant `FACILITY_HTTP_LIST_MAX_LIMIT = 100`), default = 50
  (`FACILITY_LIST_DEFAULT_LIMIT`). A requested limit above the cap is **clamped down** (not
  rejected); a non-integer/negative limit is **rejected** with 400 — identical to
  `PARTICIPANT_HTTP_LIST_MAX_LIMIT` behavior. (The domain store still permits up to 200; the HTTP
  edge caps lower to bound external response size.)
- **Cursor is opaque**: base64url of `{ createdAt, id }`, encoded/decoded exactly like the
  participant cursor. It **must not** leak tenant ids, SQL, or store internals; a tampered/malformed
  token decodes to a 400, never a 500 and never a cross-tenant read (RLS + tenant-scoped keyset
  still bound every page).
- The `page.limit` returned is the **effective (clamped)** limit; `page.nextCursor` is the opaque
  continuation token or `null`.
- **Cross-tenant / unknown organization** on the org-scoped list returns an **empty list**
  (recommended, and consistent with `GET /v1/organizations/:organizationId/participants`) — never a
  404 that would let a caller probe organization existence across tenants.

---

## 8. Error mapping

Reuse a facility read status mapper (mirror `readAppErrorStatus` in the participant adapter):

| Condition | `ErrorCode` | HTTP |
| --- | --- | --- |
| Missing/blank tenant identity | `UNAUTHENTICATED` | **401** |
| Not authorized for `facility.read` | `FORBIDDEN` / `PERMISSION_DENIED` | **403** |
| Invalid query/filter value | `INVALID_INPUT` | **400** |
| Invalid/malformed cursor | `INVALID_INPUT` | **400** |
| Blank `:facilityId` path segment | `INVALID_INPUT` | **400** |
| Facility not found for tenant (incl. cross-tenant) | `FACILITY_NOT_FOUND` | **404** |
| Unknown / cross-tenant organization on org-scoped list | *(no error)* | **200 + empty list** |
| Any unexpected store/internal error | *(default)* | **sanitized 500** (`{ code: 'INTERNAL' }`) |

Recommendations, restated as decisions:

- **Detail route**: not-found / cross-tenant → **404** (`FACILITY_NOT_FOUND`).
- **Org-scoped list**: unknown / cross-tenant organization → **empty list** (consistent with the
  participant org-list contract), **not** 404.
- **Collection route**: never reveals other tenants (RLS + tenant-scoped keyset guarantee it).
- Unknown errors collapse to an **opaque 500** carrying only `requestId` — no store detail, SQL, or
  stack.

---

## 9. Privacy and telemetry

### HTTP response body (authorized same-tenant read)

- **MAY include** facility `name`, all address fields, coordinates (`latitude`/`longitude`),
  `contactName` / `contactEmail` / `contactPhone`, `visibility`, and `capabilityTags` — this is
  authorized, tenant-scoped read access, and these live in the registry row for exactly this
  purpose. (This is the deliberate difference from outbox/telemetry: the *read body* is the one
  authorized place descriptive/contact data may appear.)
- **MUST NOT include** tenant auth internals, the raw RLS `app.tenant_id` setting, SQL/store
  metadata, outbox metadata (dedupe keys, correlation/causation ids), tokens, raw request headers,
  request body, or raw bytes.

### Telemetry (`facility.registry.read.count`, existing counter)

Emit one counter per read tagged `operation` (`list` / `detail` / `organization_facilities`) and
`result` (`success` / `failure`). Telemetry attributes carry **operation + result only** — never:

- facility `name`;
- any address field;
- any contact field (`contactName` / `contactEmail` / `contactPhone`);
- coordinates (`latitude` / `longitude`);
- `capabilityTags`;
- request body, raw headers, bearer tokens, connection strings, or raw bytes.

### Outbox

**Unchanged.** Reads enqueue **nothing**. No HTTP read adapter writes an outbox message. The
domain's sanitized create/update/status outbox signals are untouched by this surface.

---

## 10. Server route ordering

New route constants (add to [`server.ts`](../../src/http/server.ts), mirroring the existing
constant + regex style):

```ts
const FACILITY_LIST_PATH = '/v1/facilities';                            // exact
const FACILITY_DETAIL_ROUTE = /^\/v1\/facilities\/([^/]+)\/?$/;         // one trailing segment
const ORGANIZATION_FACILITIES_ROUTE = /^\/v1\/organizations\/([^/]+)\/facilities\/?$/; // two-segment
```

Dispatch ordering rules (to avoid shadowing):

1. **`/v1/facilities` (exact) must be matched before `/v1/facilities/:facilityId`** (regex). Check
   the exact list path first, then the single-segment detail regex — identical to the
   participant list-vs-detail ordering. The detail regex `([^/]+)` matches exactly one segment, so
   it cannot capture the bare list path.
2. **`ORGANIZATION_FACILITIES_ROUTE` must not shadow the existing organization routes.** It anchors
   on a trailing `facilities` segment, so it is disjoint from:
   - `GET /v1/organizations` (exact list path);
   - `GET /v1/organizations/:organizationId` (`ORGANIZATION_DETAIL_ROUTE`, one trailing segment —
     `facilities` is a *second* segment, so no overlap);
   - `GET /v1/organizations/:organizationId/participants` (`ORGANIZATION_PARTICIPANTS_ROUTE`,
     anchored on `participants`);
   - `POST /v1/organizations/:organizationId/participants` (same route, POST);
   - `POST /v1/organizations/:organizationId/participants/:relationshipId/status-transitions`.
   Because the trailing segment differs (`facilities` vs `participants` vs none), the org-facilities
   regex is unambiguous regardless of match order; place it beside the other
   `/v1/organizations/...` sub-resource routes for clarity.

Method behavior:

| Path | GET | Other methods |
| --- | --- | --- |
| `/v1/facilities` | 200 list | **405** + `Allow: GET` |
| `/v1/facilities/:facilityId` | 200 detail (or 404) | **405** + `Allow: GET` |
| `/v1/organizations/:organizationId/facilities` | 200 list | **405** + `Allow: GET` |

- Set the `Allow: GET` header on the 405 response (same as the participant/organization read
  routes) with body `{ status:'error', code:'METHOD_NOT_ALLOWED', message, requestId }`.
- **Deeper unknown facility paths** (e.g. `/v1/facilities/:id/anything`,
  `/v1/facilities/:id/status-transitions`) → **404** (they match no read route; write routes do not
  exist in this pass).
- The route-method guard should pre-check `method === 'GET'` in the dispatcher (as the participant
  read routes do), so any 405 branch inside a handler stays defensive/unreachable.

**Out of scope for this preflight (do NOT touch in the design pass):** no edits to
[`server.ts`](../../src/http/server.ts) or
[`composition.ts`](../../src/http/composition.ts). The wiring above is the *plan* for the
implementation pass; the design pass writes zero server code.

---

## 11. Test matrix

### Hermetic adapter tests (`tests/unit/http/facility/FacilityReadHttpAdapter.test.ts`)

In-memory read store, in-memory telemetry, demo/trusted-header identity — no DB/Azure/network.

1. authorized `facility_reader` role can list facilities.
2. exact `facility.read` permission key can list facilities.
3. `facility_admin` role can list facilities.
4. `platform_admin` wildcard can list facilities.
5. missing/blank tenant identity → **401**.
6. authenticated without `facility.read` → **403**.
7. invalid `status` filter → **400**.
8. invalid `facilityType` filter → **400**.
9. invalid `limit` (non-integer / `< 1`) and malformed `cursor` → **400**.
10. detail success returns the facility DTO.
11. detail for a missing facility → **404**.
12. detail for a cross-tenant facility → **404** (existence never revealed).
13. organization-scoped list success returns that org's facilities.
14. organization-scoped list for an unknown / cross-tenant organization → **200 + empty list**.
15. DTO exposes `facilityId` (no `id` key) and correctly reflects the store view.
16. DTO has **exactly** the approved key set (closed-key assertion; no extra/internal fields).
17. telemetry excludes `name` / address / contact / coordinates / `capabilityTags` (assert the
    emitted attributes are `operation` + `result` only).
18. `limit` above the HTTP cap (100) is **clamped**, not rejected; `page.limit` reflects the clamp.
19. keyset pagination round-trips (`nextCursor` from page 1 fetches page 2; cursor is opaque
    base64url and contains no tenant id in cleartext).

### Server tests (`tests/unit/http/facility/facility-server.test.ts`)

1. `GET /v1/facilities` routes to the list handler.
2. `GET /v1/facilities/:facilityId` routes to the detail handler.
3. `GET /v1/organizations/:organizationId/facilities` routes to the org-scoped list handler.
4. unsupported methods on each of the three paths → **405** with `Allow: GET`.
5. route-shadowing safety: `/v1/organizations/:id/facilities` does **not** intercept
   `/v1/organizations/:id/participants` (and vice versa), and `/v1/facilities` does not intercept
   `/v1/facilities/:id`.
6. deeper unknown facility paths (`/v1/facilities/:id/x`) → **404**.
7. malformed query (bad `status` / `limit` / `cursor`) → **400** through the server.

### Gated Pg/RLS tests (later — with the read-surface implementation, `RUN_DB_TESTS=1`)

- Optional but recommended: exercise the three routes end-to-end against the `PgFacilityRegistryStore`
  through the HTTP adapter with the **restricted runtime role**, proving RLS holds on the real read
  path (same-tenant visible, cross-tenant invisible → 404 / empty list, missing tenant → 401 before
  any store call). Reuse the self-provisioning + `withProvisionLock(918273)` harness pattern.

---

## 12. Validator plan

The future `facility:check`
([`validateFacilityRegistryBaseline`](../../src/deployment/validateFacilityRegistryBaseline.ts)) is
updated **during the read-surface implementation pass**, not fully inverted here. Planned changes at
that time:

- Expect a Facility read HTTP **DTO file** and **adapter file** to exist under `src/http/facility/`.
- Expect the `facility.read` **action** to exist in `AuthorizationActions.ts`; still expect **no**
  `facility.write` / `facility.status.write` action yet.
- Expect the server to expose **GET** facility routes only (no facility write routes).
- Keep the NSO-generic + out-of-scope-term scans; ensure the new HTTP files are covered by the
  sport-term/scope scans.
- Assert the HTTP adapter does **not** enqueue outbox, does **not** call the Governance Kernel, and
  does **not** mutate the Organization/Participant registries.
- Flip the current backend-only scope guards (`no facility HTTP surface`, `no facility.* action`)
  into their read-surface equivalents (HTTP read files present; `facility.read` present; still no
  write files/actions).

**This design pass makes only a low-risk, design-only validator addition** (see §L / the
implementation note below): assert that this preflight document exists and enumerates the three read
route paths, while **keeping** the existing guards that no Facility HTTP implementation files and no
`facility.*` authorization action exist yet. The validator is **not** inverted to expect HTTP code
in this pass.

---

## 13. Implementation sequence (next pass)

1. Add `AuthorizationAction.FacilityRead = 'facility.read'`; add `facility_reader` /
   `facility_admin` entries to `ROLE_ACTION_MAP`; extend the authz unit tests.
2. Add `src/http/facility/FacilityReadHttpDtos.ts` (flat DTO + response/request shapes, §6).
3. Add `src/http/facility/facilityHttpAuth.ts` (`resolveFacilityAuth` + `requireTenant`, cloning the
   participant auth helper).
4. Add `src/http/facility/FacilityReadHttpAdapter.ts` (`FacilityReadStore` port, `toFacilityDto`,
   `handleFacilityList` / `handleFacilityDetail` / `handleOrganizationFacilityList`, cursor
   encode/decode, `FACILITY_HTTP_LIST_MAX_LIMIT = 100`, telemetry, error mapper).
5. Wire the three routes + constants into `server.ts` and the dependencies into `composition.ts`
   (route ordering per §10).
6. Add the hermetic adapter + server tests (§11).
7. Update `facility:check` per §12 (flip scope guards; keep no-write guards) and its validator test.
8. Update the Facility Registry baseline doc's Testing/Future sections to record the read surface.
9. (Optional) Add gated Pg/RLS-through-HTTP tests.
10. Run full default validation + a gated integration run; commit.

---

## 14. Risks / open questions

| # | Question | Default | Notes |
| --- | --- | --- | --- |
| 1 | Flat DTO vs nested `address`/`geo`/`contact` grouping? | **Flat** (§6) | Matches every existing read DTO + the closed-key leak test. Decide before implementation if a reviewer prefers nesting. |
| 2 | Response envelope: existing `{status:'ok',…,page,requestId}` vs bare `{items,nextCursor}`? | **Existing envelope** (§6) | Consistency + `requestId` correlation. |
| 3 | HTTP limit cap value? | **100** | Mirrors `PARTICIPANT_HTTP_LIST_MAX_LIMIT`; store still allows 200. |
| 4 | Org-scoped list for unknown/cross-tenant org: empty list vs 404? | **Empty list** | Matches participant org-list; avoids existence probing. Detail route stays 404. |
| 5 | Expose `visibility` in the read DTO? | **Yes** | It is a non-authorizing reference flag; safe for same-tenant read. It grants nothing. |
| 6 | `organization_admin` facility read? | **Deferred** | Needs an organization-scoped authz model; if added later, must be path+tenant scoped, not tenant-wide. |
| 7 | Name/prefix search filter on the list? | **Defer** | Only add (with the `(tenant_id, lower(name))` index already present) when a concrete read need appears; not in the read v1. |
| 8 | Gated Pg/RLS-through-HTTP tests in the read pass? | **Recommended, optional** | The domain RLS is already proven (`a1d23aa`); an HTTP-path proof is additive assurance. |

---

## 15. Go/no-go checklist (entry criteria for the read implementation pass)

- [x] Facility Registry domain baseline complete (`027d70c`).
- [x] Facility Registry PostgreSQL/RLS validated live (`a1d23aa`).
- [x] Read building blocks present (`getFacility` / `listFacilities` /
      `listFacilitiesForOrganization`, cursor, limits, type guards, error codes, read telemetry
      counter).
- [x] Endpoint scope fixed (3 GET routes; no writes).
- [x] Authorization action + roles fixed (`facility.read`; `facility_reader` / `facility_admin` /
      `platform_admin` / exact key; `organization_admin` deferred).
- [x] DTO contract fixed (flat, null-normalized, closed key set; `facilityId` exposed).
- [x] Filter/pagination rules fixed (opaque cursor; cap 100; fail-closed validation).
- [x] Error mapping fixed (401/403/400/404/500; org-list empty-list convention).
- [x] Privacy + telemetry rules fixed (body may carry descriptive data; telemetry/outbox may not).
- [x] Route ordering fixed (no shadowing of organization/participant routes; 405 + `Allow: GET`).
- [x] Test matrix fixed (adapter + server; optional gated Pg/RLS-through-HTTP).
- [x] Validator plan fixed (flip scope guards in the impl pass; keep no-write guards).
- [ ] Open questions §14 confirmed (defaults stand unless a reviewer overrides before coding).

**Verdict: GO** for the Facility HTTP read-surface implementation pass, on the fixed contract above.

---

## 16. Recommended next pass

1. **Facility HTTP read surface implementation** — implement §13 exactly (adapter + DTOs + auth
   helper + `facility.read` action/roles + server/composition wiring + hermetic adapter/server
   tests + `facility:check` update), no writes.
2. **Facility HTTP read PostgreSQL/RLS validation** — gated integration proving RLS on the real HTTP
   read path with the restricted runtime role.
3. **Actual Azure dev-environment smoke execution** — exercise the read endpoints against a deployed
   dev environment (separate, explicitly-requested pass).

Write surfaces (`POST` / `PATCH` / status transitions) remain a **separate, later** write preflight
+ implementation (HTTP sequence steps 4–6) and are **not** part of this read design.
