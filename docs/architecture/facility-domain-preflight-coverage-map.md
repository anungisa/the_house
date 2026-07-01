# Facility domain preflight coverage map

> **Status: DESIGN / READINESS ONLY.** No Facility Registry code, migration, HTTP route, authz
> action, or test exists yet, and none is added by this pass. This document decides the scope,
> invariants, boundaries, terminology guardrails, RLS/migration shape, service/store shape, HTTP
> sequencing, synthetic-lifecycle fit, validator plan, and test matrix so that the **Facility
> Registry domain baseline** can be implemented deterministically in a later pass without
> re-litigating design mid-implementation.
>
> The Facility Registry will be a **reference-data** domain, exactly like the Organization Registry
> and Participant Registry: tenant-scoped, RLS-forced, outbox-sanitized, and it NEVER invokes the
> Governance Kernel, NEVER mutates governed lifecycle state, and NEVER mutates the Organization or
> Participant registries (it reads organizations as same-tenant reference structure only).

## 1. Purpose

Give future domains a single, governed structure for **facilities** — the physical or logical sites
an organization operates from — instead of re-modelling "where an organization operates" in each
module. This preflight is the contract the Facility Registry baseline implementation pass and its
reviewers will check against. It exists so the implementation pass can proceed without deciding —
under time pressure — the scope, the kernel boundary, the RLS shape, the authorization actions, or
the test obligations.

Concretely, this document:

1. Fixes the Facility Registry **scope** (and explicit non-scope).
2. Fixes the **terminology guardrails** (NSO-generic; no sport-specific terms).
3. Proposes the **domain model** (entity, enums, optional fields) with open questions flagged.
4. Fixes the **Organization dependency** pattern (read-only port, same-tenant, no mutation).
5. Fixes the **Governance Kernel boundary** (reference data, never the kernel).
6. Previews the **PostgreSQL/RLS** migration shape.
7. Previews the **outbox + telemetry** signals and their payload-safety rules.
8. Previews the **authorization** actions and role mapping (design only — not added now).
9. Fixes the **HTTP implementation sequence** (baseline → RLS validation → read → write preflight →
   write).
10. Enumerates the **test matrix** (domain unit, gated Pg/RLS, later HTTP, synthetic lifecycle).
11. Plans the future **`facility:check`** validator.
12. Records **risks / open questions** and a **go/no-go checklist**.

## 2. Current platform readiness

The perimeter is well hardened before adding another domain:

- **Governance Kernel FSM + PostgreSQL/RLS** validated (AffiliationApplication v1).
- **Organization Registry** — read surface complete, gated PostgreSQL/RLS validation green.
- **Participant Registry** — read + full write surface complete (create / update / status transition
  / organization link / relationship-status transition), gated PostgreSQL/RLS validation green.
- **Centralized authorization policy** and **centralized observability metrics** in place.
- **Transactional outbox** worker + Azure Service Bus publisher + gated integration all green.
- **Synthetic tenant lifecycle** suite hermetic and green.
- **HTTP edge** just hardened with a negative-path coverage sweep (`578b877`).
- Validation baseline: `typecheck` / `lint` / `build` clean; `npm test` **1129 pass / 212 DB-gated
  skipped**; `coverage:report` OK (statements **82.33%**, branches **84.13%**, functions
  **84.36%**); `participant:check` OK; `ci:check` OK.

The Facility Registry can therefore reuse a **proven** reference-data template
(Organization/Participant): same domain-file shape, same Pg-store + RLS pattern, same outbox +
telemetry stance, same validator + gated-integration discipline. This preflight adapts that template
to facilities and flags the facility-specific decisions.

## 3. Facility Registry scope

Facility Registry is a **generic, tenant-scoped reference-data catalogue of facilities** owned by an
organization. In scope for the eventual baseline:

- a **facility** record (one row per facility per tenant);
- **tenant ownership** (`tenantId` on every row; RLS-forced);
- **organization association** (`organizationId`, validated same-tenant via a read-only reader);
- **facility type** (a small closed enum — see §6);
- **status** (reference-data status, a small closed enum — see §6);
- **name** (required, non-blank);
- optional **address / location metadata** (facility address, not personal residential address);
- optional **contact metadata** (facility contact name / email / phone);
- optional **visibility marker** (`public` / `private` / `internal` — reference-data flag only);
- optional generic **capability tags** (NSO-generic strings; no sport-specific concepts);
- **outbox events** for create / update / status change (sanitized);
- **RLS** tenant isolation, FORCE;
- a **read surface later** (thin, GET-only, gated by `facility.read`);
- a **write surface later** (create / update / status change through the service; never the kernel).

The baseline pass (step 1 in §12) ships the **domain + migration + validator + tests, NO HTTP**;
HTTP arrives in later, separately-gated passes.

## 4. Explicit non-scope

The Facility Registry and every pass it gates deliberately **exclude** the following. None may be
added without an explicit, separate request:

- **bookings, scheduling, calendars, availability, reservations** — the registry is a catalogue of
  sites, not a scheduler;
- **maintenance work orders, inventory, inspections, accreditation, venue contracts, occupancy /
  capacity compliance** — no operational/regulatory workflow;
- **registration, payments, program enrollment, eligibility** — same exclusions as the Participant
  Registry;
- **event / competition management** of any kind;
- **sport-specific concepts, playing surfaces, or terminology** (see §5);
- **precise personal geolocation** or **personal residential addresses** (a facility address is an
  organizational site address, not a person's home — see §6);
- **medical, demographic, or other sensitive attributes**;
- a **generic CRUD / dynamic-field / JSON rule engine**;
- **hard deletes** (records are retired via status, never deleted — mirrors the other registries);
- any **Governance Kernel invocation** or governed lifecycle transition;
- any **mutation of the Organization Registry or Participant Registry** (both are read-only from the
  Facility Registry; the Facility Registry only reads the organization to confirm same-tenant
  existence).

## 5. Terminology guardrails

The Facility Registry stays **NSO-generic**, exactly like the Organization/Participant registries.

**Required vocabulary** (code, migration, docs, tests):

`facilityId`, `tenantId`, `organizationId`, `facilityType`, `status`, `name`, `address`,
`location`, `capabilityTags`, `contact`, `visibility`. Use **"organization"**, never "club".

**Forbidden vocabulary** anywhere in Facility code / migration / docs / tests:

`rink`, `sheet`, `ice`, `bonspiel`, `curler`, `draw`, `end`, `league`, and **"club" as a facility
primitive** (organizations are organizations), plus any other curling- or sport-specific naming.

The future `facility:check` validator (§13) will statically reject these terms — reusing the
existing `FORBIDDEN_DOMAIN_TERMS` scan used by the Organization/Participant validators — and the
implementation must add facility-specific forbidden terms to that scan if any are not already
covered.

## 6. Proposed domain model

A single canonical record, `facility_registry.facility`, with a same-tenant organization
association. (One table in v1 — no child/relationship table, unlike Participant Registry.)

### `facility`

| Field | Type | Notes |
| --- | --- | --- |
| `facilityId` (`id`) | uuid | Globally-unique UUID (`gen_random_uuid()` default), consistent with participant IDs. Unique **per tenant** via composite `(tenant_id, id)` for tenant-safe FKs. |
| `tenantId` | uuid | Tenant owner. RLS-scoped. |
| `organizationId` | uuid | **Required.** Same-tenant organization the facility belongs to. Validated via read-only `OrganizationReader` (see §7). Immutable after create (recommendation). |
| `name` | text | Required, non-blank. Mutable. |
| `facilityType` | enum | See below. Immutable after create (recommendation — mirrors Organization `organizationType`). |
| `status` | enum | Reference-data status. Defaults `draft`. See below. |
| `addressLine1` | text? | Optional facility street address. |
| `addressLine2` | text? | Optional. |
| `locality` | text? | Optional (city/town). |
| `region` | text? | Optional (province/state). |
| `postalCode` | text? | Optional. |
| `countryCode` | text? | Optional ISO 3166-1 alpha-2 (format-validated, uppercased). |
| `latitude` / `longitude` | numeric? | **Open question — default DEFER** (see §14). Only if generic, optional, and clearly a *site* coordinate, not personal geolocation. |
| `contactName` | text? | Optional facility contact. |
| `contactEmail` | text? | Optional; normalized (trim + lowercase) + format-validated. Never in outbox/telemetry. |
| `contactPhone` | text? | Optional. Never in outbox/telemetry. |
| `visibility` | enum? | `public` \| `private` \| `internal`. Optional; defaults `private`. Reference-data flag only. |
| `capabilityTags` | jsonb? | Optional array of NSO-generic strings. No sport-specific tags; validated against a length/shape bound, not a fixed vocabulary. |
| `createdAt` / `updatedAt` | timestamptz | From a clock; `createdAt` immutable. |

### `FacilityStatus` (reference-data status, NOT a governed FSM)

`draft` | `active` | `inactive` | `archived`. Defaults to `draft`. Records are **never deleted**;
`inactive` / `archived` retain the row. There is no kernel policy or guard behind these values — a
status change is a denormalized field update plus one sanitized outbox signal.

> Note the deliberate difference from Organization/Participant, which use
> `draft|active|suspended|archived`. Facilities are sites, so `inactive` (temporarily out of use)
> reads more naturally than `suspended` (which implies an adjudicated sanction). **Open question in
> §14** — confirm `inactive` vs `suspended` during baseline design; do not add both.

### `FacilityType`

`venue` | `training_site` | `office` | `storage_site` | `partner_site` | `other`.

> `virtual` is an **open question — default DEFER** (see §14). A virtual/online "facility" blurs the
> "physical or logical site an organization operates from" definition and may invite scheduling/booking
> assumptions. Recommendation: omit `virtual` from v1; add later only with an explicit need. If added,
> it must not imply any booking/session semantics.

### Attributes explicitly avoided

No medical data, no sensitive demographic data, no precise personal geolocation, no personal
residential address (a facility address is an organizational site address), and **no
capacity/occupancy** field (it implies regulated-venue compliance not modeled here). Capability tags
are generic operational descriptors only — never sport-specific.

## 7. Organization dependency

Facility Registry depends on the **Organization Registry** for exactly one thing: confirming that
the `organizationId` on a facility exists **for the same tenant**.

- The dependency is a **read-only `OrganizationReader` port** (mirrors the Participant Registry's
  reader). Facility create/update must resolve the organization same-tenant before writing.
- The Facility Registry **never** creates, updates, or mutates an organization.
- A **cross-tenant** or **missing** organization reference resolves to **not-found** semantics
  (`FACILITY_ORGANIZATION_NOT_FOUND` → `404` at the HTTP edge later), never revealing cross-tenant
  existence.
- Organization deletion / lifecycle behavior is **out of scope** — the reader only answers "does
  this organization exist for this tenant, now".

**Can a facility exist without an `organizationId`?** **Recommendation: NO for v1.** Every facility
belongs to exactly one organization. This keeps the reference graph clean and tenant-safe. Revisit
only if a genuine tenant-level (org-less) facility need appears.

**PostgreSQL relationship shape.** Like Participant Registry, there is **no cross-schema DB FK** to
`organization_registry.organization` (an FK check bypasses RLS and cannot enforce tenant equality).
Instead: organization existence is validated at the service layer through the reader and confined by
RLS; the facility carries `organization_id uuid NOT NULL` plus its own `(tenant_id, id)` composite
so any future same-tenant child reference stays tenant-consistent.

## 8. Governance Kernel boundary

**Decision (final for the Facility Registry): facilities are reference data, not governed
lifecycle.**

- Facility create / update / status change **do not** call `GovernanceKernel.transition()` and
  **never** read or mutate `governance.entity_state` / `state_transition` / `audit_event` /
  `evidence_object`.
- `FacilityStatus` is an **operational reference-data status marker**, not an adjudicated lifecycle
  state. It carries no approval workflow, no guard evaluation, and no evidence requirement.
- The Governance Kernel stays reserved for **governed lifecycle transitions requiring
  approvals / evidence / guards** (e.g. AffiliationApplication).
- Any *future* facility accreditation / inspection / approval process would be a **separate governed
  workflow/domain** layered on top of the registry — never retrofitted into these reference-data
  routes.

Boundary statements that must remain true in implementation and tests:

- facility status **≠** accreditation/inspection outcome;
- facility existence **≠** booking availability;
- facility record **≠** a scheduling or contract entity.

## 9. PostgreSQL/RLS design preview

Expected migration: **`db/migrations/0011_facility_registry.sql`** (next in sequence after
`0010_participant_registry.sql`). Requires PostgreSQL 15+; NSO-generic names only.

Schema + table:

- `CREATE SCHEMA IF NOT EXISTS facility_registry;`
- `facility_registry.facility` with the columns in §6.

Required RLS + isolation (mirrors 0009/0010):

- `tenant_id uuid NOT NULL` on every row;
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` **and** `... FORCE ROW LEVEL SECURITY;`
- policies keyed on `governance.current_tenant_id()` (defined in 0001; **fails closed** — raises
  `P0001` when `app.tenant_id` is unset);
- app role granted **only** `SELECT, INSERT, UPDATE` (plus `EXECUTE` on
  `governance.current_tenant_id()`) — **no `DELETE`, no `TRUNCATE`**, non-superuser, `NOBYPASSRLS`;
- **no `DELETE` in service v1** (records retire via status; hard delete would require explicit
  justification);
- composite `UNIQUE (tenant_id, id)` for tenant-safe references;
- outbox row written **atomically** in the same transaction as each facility write.

Indexes:

- `(tenant_id, created_at ASC, id ASC)` — keyset pagination for the future list;
- `(tenant_id, organization_id)` — list an organization's facilities;
- `(tenant_id, status)` — status filter;
- `(tenant_id, facility_type)` — type filter;
- `(tenant_id, lower(name))` — **only if** name search/filter is offered (defer until the read
  surface needs it).

Uniqueness:

- **No global name uniqueness** (names collide across tenants and organizations legitimately).
- **Open question — default DEFER:** a partial-unique `(tenant_id, organization_id, lower(name))`
  over non-archived rows to prevent duplicate active facility names within one organization. Add
  **only if** justified during baseline design (mirrors the Participant Registry's justified
  partial-unique re-link index); otherwise omit.

IDs: globally-unique UUIDs (consistent with participant IDs). **Tenant isolation is the primary
boundary.**

## 10. Outbox and telemetry preview

### Outbox signals (sanitized, atomic with the row write)

| Message type | When | Dedupe key (shape) |
| --- | --- | --- |
| `facility.registry.created` | create | `facility.registry.created:<facilityId>` |
| `facility.registry.updated` | attribute change | `facility.registry.updated:<facilityId>:<updatedAt>` |
| `facility.registry.status_changed` | status change | `facility.registry.status_changed:<facilityId>:<status>:<updatedAt>` |

Payload rules (strict):

- include **IDs / status / type only** — `facilityId`, `tenantId`, `organizationId`, `facilityType`,
  `status`, optional `visibility`, optional `actorUserId` / `requestId` / `correlationId`;
- **exclude** `contactEmail` / `contactPhone` / `contactName`;
- **exclude** address/location detail (`addressLine*`, `postalCode`, `latitude`/`longitude`) —
  address may be sensitive in some deployment contexts; downstream consumers read the registry by id;
- **exclude** `name` (mirrors Organization Registry excluding `displayName`);
- never any raw headers, request body, bearer tokens, connection strings, or raw bytes.

Idempotency: a replayed create returns the existing row and enqueues nothing new; a status change to
the current status is a no-op (no row change, no signal) — mirrors the other registries.

### Telemetry signals (centralized `Telemetry` seam; NSO-generic names)

- `facility.registry.write.count` — tagged `operation` (`create` / `update` / `status_change`) +
  `result` (`success` / `failure`);
- `facility.registry.read.count` — **later**, once an HTTP read surface exists (tagged
  `operation` = `list` / `detail` / `organization_facilities`);
- denial / error counters — **later**, only if the HTTP surface exists (reuse the centralized
  `authz.denied` signal);
- telemetry attributes carry **ids / operation / result only** — never contact, address, name, or
  any secret.

## 11. Authorization preview

Design only — **no actions are added to `src/authz/AuthorizationActions.ts` in this pass.**

Proposed actions (NSO-generic, fail-closed, least-privilege — none implies another):

| Action constant (proposed) | String key | Grants |
| --- | --- | --- |
| `FacilityRead` | `facility.read` | List / read facilities (read endpoints). |
| `FacilityWrite` | `facility.write` | Create / update a facility. |
| `FacilityStatusWrite` | `facility.status.write` | Change a facility's reference-data status — **only if** status transitions are a separate sub-resource from profile update (see §12). |

Recommended v1 role mapping (applied during the write-surface implementation pass, not now):

| Role | `facility.read` | `facility.write` | `facility.status.write` |
| --- | --- | --- | --- |
| `facility_reader` | ✓ | ✗ | ✗ |
| `facility_admin` | ✓ | ✓ | ✓ |
| `platform_admin` | ✓ (wildcard) | ✓ (wildcard) | ✓ (wildcard) |
| exact permission key on actor | ✓ | ✓ | ✓ |

- **`organization_admin` is deferred** — granting an org admin facility-write requires a proven
  **organization-scoped** authorization model (so an org admin can only write *their* organization's
  facilities). That model does not exist yet (same reasoning as the Participant Registry deferral).
  Start with `facility_admin` + `platform_admin` + the exact permission key only.
- Tenant identity comes **exclusively** from the resolved `AuthContext` (`x-house-*` trusted
  headers) — never from body/path/query.
- **Decision to confirm at baseline:** whether to introduce `facility.status.write` at all, or fold
  status change into `facility.write`. Recommendation: introduce the separate action **only** if a
  dedicated `/status-transitions` sub-resource is added; otherwise a single `facility.write` covers
  create/update/status.

## 12. HTTP sequencing

Recommended implementation order (each a separate, separately-gated pass — **none implemented in
this preflight**):

1. **Facility Registry domain baseline** — `FacilityTypes.ts`, `FacilityRegistryErrors.ts`, store
   port, in-memory store, Pg store, service, `index.ts` barrel, migration `0011`, static validator +
   `facility:check` script, docs, **unit + gated DB tests**. **No HTTP.**
2. **Facility Registry PostgreSQL/RLS validation** — gated integration proving FORCE RLS, restricted
   role, tenant isolation, the organization dependency, and outbox atomicity.
3. **Facility HTTP read surface** — thin, GET-only, gated by `facility.read`:
   - `GET /v1/facilities`
   - `GET /v1/facilities/:facilityId`
   - `GET /v1/organizations/:organizationId/facilities`
4. **Facility HTTP write preflight** — a preflight doc (this doc's write-surface analogue) fixing the
   create/update/status contracts, DTOs, idempotency, error mapping, privacy, and RLS test matrix
   before any write endpoint.
5. **Facility HTTP write phase 1** — `POST /v1/facilities` (create) + `PATCH /v1/facilities/:id`
   (update), gated by `facility.write`.
6. **Facility HTTP status transition** — `POST /v1/facilities/:id/status-transitions`, gated by
   `facility.status.write` — **only if** status change needs to be separated from profile update.

The organization-facilities list route (`GET /v1/organizations/:organizationId/facilities`) must,
like the participant analogue, return an **empty list** for an unknown/cross-tenant organization
(never probing organization existence).

## 13. Test matrix

### Domain unit tests (baseline pass)

- create facility success (own tenant, valid organization);
- rejects missing `tenantId`;
- rejects missing `organizationId`;
- rejects missing / blank `name`;
- rejects invalid `facilityType`;
- rejects invalid `status`;
- rejects **cross-tenant** organization (→ not-found);
- rejects **missing** organization (→ not-found);
- updates safe fields (name/address/contact/visibility/capabilityTags); rejects unknown keys and
  immutable-field changes (`organizationId` / `facilityType`);
- status change (real change emits one signal);
- **idempotent no-op** status change (same status → no outbox row);
- archived-facility behavior (e.g. cannot be re-activated without an explicit rule — decide at
  baseline);
- **outbox payload safety** (ids/status/type only; no contact/address/name);
- **telemetry safety** (operation/result only);
- `OrganizationReader` used **read-only** (never mutates the Organization Registry).

### PostgreSQL / RLS tests (gated, `RUN_DB_TESTS=1`)

- migration applies idempotently; schema + table exist;
- **FORCE RLS** enabled (`relrowsecurity` **and** `relforcerowsecurity` true);
- app role is **NON-superuser / NON-`BYPASSRLS`**, holds only `{SELECT, INSERT, UPDATE}`;
- same-tenant create / read / update / status allowed;
- **cross-tenant read denied** (Tenant B invisible to Tenant A);
- **cross-tenant organization reference** denied / not-found on create;
- **missing tenant context fails closed** (`P0001`; no row written);
- outbox commits **atomically** with each mutation;
- outbox insert failure **rolls back** the facility write (no orphan row/signal);
- **no governance table mutation** (`entity_state` / `state_transition` / `audit_event` stay at
  zero);
- **no Organization Registry mutation**;
- NSO-generic schema (no sport-specific columns).

### HTTP read tests (read-surface pass, later)

- authorized read; unauthorized (`403`); missing auth (`401`);
- list filters (`status` / `facilityType` / `organizationId`); pagination (keyset cursor);
- invalid filters (`400`);
- cross-tenant detail → `404` (never reveals existence);
- organization-facilities route → **empty list** for unknown/cross-tenant organization;
- closed DTO projection (no contact/address leakage beyond the authorized same-tenant read).

### HTTP write tests (write-surface pass, later)

- create/update authorization (`facility.write`);
- `Idempotency-Key` requirement if the POST requires it;
- malformed JSON → `400`;
- DTO closure (unknown keys → `400`);
- privacy / telemetry safety;
- **no `GovernanceKernel` call**;
- **no Organization Registry mutation**;
- cross-tenant write → `404` (indistinguishable from not-found).

### Synthetic lifecycle fit

- After an approved-organization projection, create a **facility for that organization** in the same
  tenant;
- assert the facility is **reference data** and does **not** alter governed lifecycle
  (`entity_state` / journal / audit counts unchanged by the facility write);
- assert **tenant isolation** (a second tenant cannot see the facility);
- the scenario stays hermetic (in-memory rig, fixed clock, opaque tenant UUIDs) — it must not add DB,
  Azure, or network I/O.

## 14. Validator plan

Design a future **`facility:check`** static validator
(`src/deployment/validateFacilityRegistryBaseline.ts` + `scripts/validate-facility-registry-baseline.ts`),
chained into `ci:check`, mirroring `validateParticipantRegistryBaseline.ts`. It should statically
assert (no DB, no network, no deploy):

- **no sport-specific terminology** in facility code / migration / docs / tests (reuse
  `FORBIDDEN_DOMAIN_TERMS` + facility-specific additions);
- migration `0011_facility_registry.sql` exists;
- migration enables **FORCE RLS**;
- the service does **not** import or call `GovernanceKernel`;
- the service uses the read-only `OrganizationReader` port;
- outbox payload builders **exclude** contact/address/name fields;
- the doc documents the **non-scope** (booking / scheduling / maintenance / inventory / inspection /
  payment / registration / enrollment / eligibility / event);
- **no HTTP files** exist until the read-surface pass (design-before-implementation invariant);
- **no `DELETE`** in the service v1 (unless explicitly justified in the doc);
- unit + gated-integration tests exist for domain / service / migration;
- the `facility:check` package script exists and is chained into `ci:check`.

> **This pass does NOT implement the validator or a package script.** Design only. (The Participant
> Registry precedent added its validator in the *baseline* pass, not the preflight pass; the Facility
> Registry should follow the same ordering.)

## 15. Risks / open questions

1. **`inactive` vs `suspended` status.** Recommend `draft|active|inactive|archived` for facilities
   ("inactive" reads more naturally for a site than "suspended"). Confirm at baseline; do **not** add
   both.
2. **`virtual` facility type.** Default **DEFER** — a virtual/online site blurs the definition and
   risks importing booking/session assumptions. Add later only with explicit need and no scheduling
   semantics.
3. **`latitude` / `longitude`.** Default **DEFER** — precise coordinates can be sensitive and are not
   required for a reference catalogue. Add later only as generic, optional **site** coordinates
   (never personal geolocation), and keep them out of outbox/telemetry.
4. **Per-organization name uniqueness.** Default **DEFER** the partial-unique
   `(tenant_id, organization_id, lower(name))` index unless a duplicate-name problem is demonstrated.
5. **`organizationId` required vs optional.** Recommend **required** (no org-less facilities in v1).
   Revisit only for a genuine tenant-level facility need.
6. **`facility.status.write` action.** Only introduce it if a dedicated `/status-transitions`
   sub-resource is added; otherwise fold status change into `facility.write`.
7. **Address privacy in outbox.** Decision here is to **exclude** all address/contact detail from
   outbox + telemetry. Confirm this is acceptable for downstream consumers (they read by id).
8. **Capability tags vocabulary.** Free-form NSO-generic strings validated by shape/length only —
   confirm no need for a fixed controlled vocabulary in v1 (and ensure the validator's forbidden-term
   scan covers tag values in tests/fixtures).
9. **`organization_admin` scoping.** Deferred until org-scoped authorization exists — same constraint
   as the Participant Registry.

## 16. Go / no-go checklist for baseline implementation

The Facility Registry **domain baseline** (step 1 in §12) may begin **only** when all are true:

- [ ] The reference-data / kernel-boundary decision (§8) is accepted.
- [ ] The scope (§3) and explicit non-scope (§4) are accepted with no scope creep.
- [ ] The terminology guardrails (§5) are accepted and enforceable by the validator.
- [ ] The domain model (§6) is accepted, with the open questions (§15 #1–#5, #7, #8) resolved to
      concrete `draft|active|inactive|archived` + `venue|training_site|office|storage_site|partner_site|other`
      + `organizationId` required + address/contact excluded from outbox.
- [ ] The Organization dependency pattern (§7: read-only reader, same-tenant, no mutation, no
      cross-schema FK) is accepted.
- [ ] The PostgreSQL/RLS shape (§9: FORCE RLS, restricted role, no DELETE, indexes, outbox
      atomicity) is accepted.
- [ ] The outbox + telemetry payload-safety rules (§10) are accepted as required.
- [ ] The authorization design (§11: actions, role mapping, `organization_admin` deferred) is
      accepted (to be *implemented* only when the write surface lands).
- [ ] The HTTP sequencing (§12: baseline → RLS validation → read → write preflight → write) is
      accepted.
- [ ] The test matrix (§13) is accepted as required, not optional.
- [ ] The `facility:check` validator plan (§14) is accepted (implemented in the baseline pass).

Until every box is checked, **no Facility Registry type, error, store, service, migration, HTTP
route, authz action, or test is implemented.** This document is the contract; the baseline
implementation pass is separate.

## 17. Recommended next pass

- **Facility Registry domain baseline** — implement §12 step 1 exactly (types, errors, store port,
  in-memory + Pg stores, service, migration `0011`, `facility:check` validator + script, docs,
  unit + gated DB tests), reusing the Organization/Participant template, with the §15 open questions
  resolved and NO HTTP.
- **Or**: actual Azure dev-environment smoke execution (independent of Facility work).

This preflight makes the Facility Registry safe to implement without importing sport-specific
assumptions or prematurely adding booking / scheduling / maintenance / registration semantics.
