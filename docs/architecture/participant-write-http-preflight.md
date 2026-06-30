# Participant write HTTP preflight

> **Status: PHASE 1 (create + update) IMPLEMENTED. Later phases NOT IMPLEMENTED.**
> Phase 1 of the safe HTTP write surface — `POST /v1/participants` (create) and
> `PATCH /v1/participants/:participantId` (update safe profile fields) — is now implemented,
> gated by the new `participant.write` action (see §3 rows 1–2 and §5.1–§5.2). The remaining write
> operations in this contract — participant **status transitions** (§5.3) and **organization-link**
> create / relationship-status changes (§5.4–§5.5), and their `participant.status.write` /
> `participant.organization_link.write` actions — remain **NOT IMPLEMENTED** and are deferred to a
> later phase. This document stays the binding contract for those deferred phases.
> The Participant Registry remains a **reference-data** domain: it NEVER invokes the Governance
> Kernel, NEVER mutates governed lifecycle state, and NEVER mutates the Organization Registry
> (it reads organizations as same-tenant reference structure only).

## Phase 1 — what shipped

The implemented phase-1 write surface is intentionally the minimal create + update slice:

- `POST /v1/participants` — create a participant (requires an `Idempotency-Key` header; a duplicate
  `participantId` for the tenant returns `409`). See §5.1.
- `PATCH /v1/participants/:participantId` — update safe profile fields (`null` clears, omitted
  leaves unchanged; `status` and organization-link fields are rejected as unknown keys). See §5.2.

Both go through the validated `ParticipantRegistryService` (which owns the transactional outbox),
are gated by `participant.write`, resolve tenant exclusively from the `x-house-*` auth context, and
return the closed `ParticipantDto`. Files: `src/http/participant/ParticipantWriteHttpAdapter.ts`,
`src/http/participant/ParticipantWriteHttpDtos.ts`, server wiring in `src/http/server.ts`, hermetic
tests in `tests/unit/http/participant/ParticipantWriteHttpAdapter.test.ts` and
`tests/unit/http/participant/participant-write-server.test.ts`.

**Deferred (NOT IMPLEMENTED):** status transitions (§5.3), organization-link create (§5.4),
relationship-status changes (§5.5), and the `participant.status.write` /
`participant.organization_link.write` actions. The sections below remain their contract.

## 1. Purpose

The Participant Registry today exposes only a thin, read-only HTTP surface (see
[participant-registry-domain-baseline.md](participant-registry-domain-baseline.md), section
"HTTP read surface"). The underlying domain service
(`src/domains/participant-registry/ParticipantRegistryService.ts`) already supports create, profile
update, status change, organization linking, and relationship status change — each writing a
sanitized transactional outbox signal — but none of those operations are reachable over HTTP.

This preflight defines the **safe HTTP write surface** so that a later implementation pass can add
mutation endpoints deterministically, without re-litigating authorization, idempotency, privacy,
RLS, error-mapping, or test obligations mid-implementation. It is the contract that the
implementation pass and its reviewers will check against.

The goals of this document are to:

1. Decide which write operations the **first** write surface should expose (and which it must not).
2. Define the authorization model (new actions + role mappings) for participant writes.
3. Specify the request/response DTO contracts for each endpoint.
4. Define the idempotency and concurrency model.
5. Define validation behavior and HTTP error mapping.
6. State telemetry, outbox, and privacy/payload-safety expectations.
7. Enumerate the RLS / tenant-isolation DB tests the implementation must add.
8. Provide a phased test matrix and a go/no-go checklist.

## 2. Non-goals (intentionally out of scope)

This preflight, and the first write implementation pass it gates, deliberately **exclude** the
following. None may be added without an explicit, separate request:

- Registration, payments, program enrollment, competition, scheduling, or eligibility.
- Any sport-specific concept, entity, or terminology.
- Demographic, medical, health, or other sensitive personal attributes.
- Bulk import / batch mutation endpoints, CSV upload, or an admin UI.
- Identity-provider coupling beyond the existing generic `externalRefs` correlation field.
- Any direct mutation of the Organization Registry (organizations are read-only reference data).
- Any Governance Kernel invocation or governed lifecycle transition. Participant status changes are
  **reference-data status fields**, not governed lifecycle transitions, and must never be routed
  through the kernel.
- Hard deletes. Records are never deleted; status changes are the only "removal" mechanism.
- A generic CRUD/JSON rule engine or dynamic field schema.

## 3. Proposed endpoints

The domain service exposes five write operations. **Phase 1 (now implemented) chose the minimal
create + update subset (rows 1–2)**; status transitions and organization linking (rows 3–5) are
deferred to a later phase and remain unimplemented.

| # | Method & path | Operation | Service method | Authz action | Phase |
| --- | --- | --- | --- | --- | --- |
| 1 | `POST /v1/participants` | Create a participant | `createParticipant` | `participant.write` | **1 (done)** |
| 2 | `PATCH /v1/participants/:participantId` | Update safe profile fields | `updateParticipant` | `participant.write` | **1 (done)** |
| 3 | `POST /v1/participants/:participantId/status-transitions` | Change participant status | `changeParticipantStatus` | `participant.status.write` | deferred |
| 4 | `POST /v1/organizations/:organizationId/participants` | Link participant to organization | `linkParticipantToOrganization` | `participant.organization_link.write` | deferred |
| 5 | `POST /v1/organizations/:organizationId/participants/:relationshipId/status-transitions` | Change relationship status | `changeOrganizationParticipantStatus` | `participant.organization_link.write` | deferred |

Routing notes (the read surface already establishes these path shapes in `src/http/server.ts`):

- The existing read routes are **GET-only** and currently return `405` for any non-GET method on
  `/v1/participants`, `/v1/participants/:id`, and `/v1/organizations/:id/participants`. The write
  pass must extend those route handlers to accept `POST` / `PATCH` (and update the `allow` header
  set), **without** shadowing or weakening the read routes.
- Status changes use a **sub-resource collection** (`/status-transitions`) rather than a `PATCH` of
  a `status` field. This keeps status mutation explicit, idempotency-keyable, and separable from
  the profile `PATCH` authorization action.
- The relationship status path nests under the organization + relationship id to keep the
  organization scope explicit in the URL for future org-scoped authorization.

## 4. Authorization model

### 4.1 New actions

Add three new actions to `src/authz/AuthorizationActions.ts` (NSO-generic, fail-closed). They are
**distinct** from the existing read action so that read access never implies write access:

| Action constant | String key | Grants |
| --- | --- | --- |
| `ParticipantWrite` | `participant.write` | Create a participant; update safe profile fields. |
| `ParticipantStatusWrite` | `participant.status.write` | Change a participant's reference status. |
| `ParticipantOrganizationLinkWrite` | `participant.organization_link.write` | Create an organization↔participant relationship; change a relationship's status. |

`participant.read` remains required to read; it is **not** implied by any write action and a write
action is **not** implied by `participant.read`. (A caller that only writes but cannot read is a
valid, if unusual, configuration; the implementation must not silently grant reads.)

### 4.2 Role mappings

Update `ROLE_ACTION_MAP` so write capability is opt-in. Recommended v1 mappings:

| Role | Actions |
| --- | --- |
| `participant_reader` | `participant.read` (unchanged — read-only) |
| `participant_admin` | `participant.read`, `participant.write`, `participant.status.write`, `participant.organization_link.write` |
| `platform_admin` | wildcard (all actions, unchanged) |

`participant_admin` is currently read-only at the HTTP edge in v1; this pass is what promotes it to
a writer. The exact permission keys (`participant.write`, `participant.status.write`,
`participant.organization_link.write`) remain authoritative when present on an actor's
`permissionKeys`, per the existing authorization precedence (exact permission > platform-admin >
role mapping > deny).

### 4.3 Scope decision: tenant-scoped only in v1

- **v1 is tenant-scoped only.** Authorization is "may this actor write participants *in this
  tenant*". Tenant identity comes EXCLUSIVELY from the resolved `AuthContext` (the `x-house-*`
  trusted-header contract), never from the body or path — identical to the read surface.
- **Organization-scoped authorization is deferred.** A future pass may restrict
  `participant.organization_link.write` to the actor's `organizationId`/`scopeId` so an
  organization admin can only link participants to *their* organization. For v1, the link action is
  tenant-scoped: any holder of `participant.organization_link.write` may link to any organization
  **within their tenant**. This is called out in Open Questions (§13).
- **Relationship creation requires the link action only** (not both `participant.write` and the
  link action). Linking does not modify the participant profile, so a single, dedicated action is
  the least-privilege fit. (Open question §13 records the alternative of requiring both.)

### 4.4 Denials

Every authorization failure flows through the centralized policy (`assertAuthorized`), which emits
the sanitized `authz.denied` signal. Unauthenticated → `401`; authenticated-but-unauthorized →
`403`. Fail closed on unknown action, unknown role, and missing tenant.

## 5. DTO contracts

All write DTOs follow the read-surface conventions: a **closed** field set (a unit test asserts the
exact keys), optional fields normalized, and **no** secrets / raw headers / connection strings /
payload bytes. Identity (tenant + actor) is never accepted in the body; it comes from auth context.

### 5.1 `POST /v1/participants` — create

- **Authz**: `participant.write`.
- **Idempotency**: `Idempotency-Key` header **required** (see §6).
- **Request body**:

  | Field | Type | Required | Notes |
  | --- | --- | --- | --- |
  | `participantId` | string (uuid) | optional | Client-supplied id enables natural idempotent replay. Generated when absent. |
  | `displayName` | string | **required** | Non-blank. |
  | `givenName` | string \| null | optional | |
  | `familyName` | string \| null | optional | |
  | `email` | string \| null | optional | Validated + normalized (trim/lowercase); invalid → `400` (`PARTICIPANT_INVALID_EMAIL`). |
  | `status` | enum | optional | Defaults to `draft`. **Recommendation: default `draft`**, not `active`, so creation does not implicitly assert an active reference state; promotion to `active` is an explicit status transition (§5.3). |
  | `externalRefs` | array of `{provider, externalId}` | optional | App-validated; no DB unique constraint — duplicate provider/externalId is an application-level concern, not a DB error. |

- **Response**: `201 Created` with `{ status: 'ok', participant: ParticipantDto, requestId }`
  (the same closed `ParticipantDto` the read surface returns). A genuine idempotent replay returns
  `200 OK` with the existing participant (see §6).
- **Outbox**: one `participant.registry.created` row (sanitized: ids + status only; **no**
  `displayName` / names / email).
- **Telemetry**: `participant.registry.created.count` tagged `result=success|failure`.
- **Mutation boundary**: inserts one `participant` row + one outbox row in a single transaction. No
  governed state, no kernel, no organization mutation.

### 5.2 `PATCH /v1/participants/:participantId` — update safe profile fields

- **Authz**: `participant.write`.
- **Idempotency**: deterministic by content; see §6 for the outbox-duplication caveat.
- **Request body** (all optional; **at least one** must be present):

  | Field | Type | Null semantics |
  | --- | --- | --- |
  | `displayName` | string | Cannot be cleared (non-blank when present). |
  | `givenName` | string \| null | `null` clears; omitted leaves unchanged. |
  | `familyName` | string \| null | `null` clears; omitted leaves unchanged. |
  | `email` | string \| null | `null` clears; string is validated + normalized; omitted leaves unchanged. |
  | `externalRefs` | array \| null | `null` clears all; array replaces; omitted leaves unchanged. |

  **`status` is NOT updatable here** — status changes use §5.3.

- **Response**: `200 OK` with `{ status: 'ok', participant: ParticipantDto, requestId }`.
  `404` when the participant does not exist for the tenant (never reveals cross-tenant existence).
- **Outbox**: one `participant.registry.updated` row (sanitized).
- **Telemetry**: `participant.registry.updated.count` tagged `result`.

### 5.3 `POST /v1/participants/:participantId/status-transitions` — change status

- **Authz**: `participant.status.write`.
- **Idempotency**: `Idempotency-Key` header **required** (see §6).
- **Request body**:

  | Field | Type | Required | Notes |
  | --- | --- | --- | --- |
  | `targetStatus` | enum | **required** | Must be a known `ParticipantStatus`; unknown → `400`. |
  | `reason` | string | optional | Free-text audit note; **never** placed in the outbox payload or telemetry. |

  This endpoint **must not** call the Governance Kernel. Participant status is reference data.

- **Response**: `200 OK` with the updated `ParticipantDto`. A no-op transition (already in
  `targetStatus`) returns `200` and is idempotent (see §6).
- **Outbox**: one `participant.registry.status_changed` row on an actual change (sanitized: id +
  fromStatus + toStatus, no names/email/reason).
- **Telemetry**: `participant.registry.status_changed.count` tagged `result`.

### 5.4 `POST /v1/organizations/:organizationId/participants` — link

- **Authz**: `participant.organization_link.write`.
- **Idempotency**: `Idempotency-Key` header **required** (see §6).
- **Request body**:

  | Field | Type | Required | Notes |
  | --- | --- | --- | --- |
  | `participantId` | string | **required** | Must exist for the tenant; else `404`. |
  | `relationshipType` | enum | **required** | Known `RelationshipType`; unknown → `400`. |
  | `relationshipId` | string (uuid) | optional | Client-supplied id enables idempotent replay; generated when absent. |
  | `status` | enum | optional | Defaults to `active`. |
  | `startDate` | string (date) | optional | |
  | `endDate` | string (date) | optional | |

  `organizationId` comes from the **path**. The organization must exist for the tenant (read-only
  reference check); a missing/cross-tenant org → `404` (never reveals cross-tenant existence).

- **Response**: `201 Created` with `{ status: 'ok', relationship: OrganizationParticipantDto, requestId }`.
- **Conflict**: a second active, non-ended relationship for the same
  (tenant, organization, participant, relationshipType) is rejected — see §6 and §7. The DB
  backstop is the partial unique index `organization_participant_active_unique_idx`.
- **Outbox**: one `participant.registry.organization_linked` row (sanitized: ids + type + status).
- **Telemetry**: `participant.registry.organization_linked.count` tagged `result`.

### 5.5 `POST /v1/organizations/:organizationId/participants/:relationshipId/status-transitions`

- **Authz**: `participant.organization_link.write`.
- **Idempotency**: `Idempotency-Key` header **required** (see §6).
- **Request body**:

  | Field | Type | Required | Notes |
  | --- | --- | --- | --- |
  | `targetStatus` | enum | **required** | Known `RelationshipStatus`; unknown → `400`. |
  | `endDate` | string (date) | optional | Used when ending a relationship. |

- **Response**: `200 OK` with the updated `OrganizationParticipantDto`. `404` when the relationship
  does not exist for the tenant/organization. No-op transition returns `200` idempotently.
- **Outbox**: one `participant.registry.organization_link_status_changed` row (sanitized).
- **Telemetry**: `participant.registry.organization_link_status_changed.count` tagged `result`.

## 6. Idempotency & concurrency model

The domain layer's current idempotency is **entity-id based**: `createParticipant` with an existing
`participantId` returns the existing view as a `conflict`→replay (no error, no duplicate outbox);
`linkParticipantToOrganization` treats a duplicate active relationship as an idempotent replay.
There is no `Idempotency-Key` parameter on the service methods today.

Recommended HTTP idempotency model:

1. **POST mutations (create, both status-transition endpoints, link) REQUIRE an `Idempotency-Key`
   request header.** A missing/blank key → `400`. The key is the client's promise that a retry of
   the *same logical request* is safe to replay.
2. **Bind the idempotency key to a deterministic entity id.** For create and link, the
   implementation should derive (or require) a stable `participantId` / `relationshipId` from the
   idempotency key so a retried POST resolves to the same row and the same single outbox message
   (the existing dedupe keys —
   `participantCreatedDedupeKey`, `organizationLinkedDedupeKey`, etc. — already make the outbox
   insert idempotent on the entity id). The exact binding (server-side key→id map vs.
   client-supplied id) is an **open question** (§13); either way a replay must NOT produce a second
   row or a second outbox message.
3. **Replay semantics**:
   - Create replay (same key, same payload) → `200 OK` with the existing participant.
   - Create with the same key but a **conflicting** payload → `409 IDEMPOTENCY_CONFLICT` (the key
     was reused for a different request). Do not silently overwrite.
   - Link replay (duplicate active relationship, same key) → `200 OK` with the existing
     relationship. A **different** active relationship that violates the active-unique index →
     `409` (see §7).
4. **PATCH (update) is naturally deterministic** (it sets explicit fields), but each successful
   `PATCH` currently emits a fresh `participant.registry.updated` outbox row (its dedupe key
   includes `updatedAt`). The implementation must decide whether `PATCH` also honors an optional
   `Idempotency-Key` to collapse retried identical updates; at minimum it must document that a
   retried `PATCH` is safe (it re-sets the same fields) even if it emits an additional updated
   signal. **Recommendation**: accept an optional `Idempotency-Key` on `PATCH` and short-circuit a
   byte-identical retry to avoid duplicate `updated` signals.
5. **Repeated status transition to the current status** is a no-op: `200 OK`, **no** new outbox row
   (the service already treats it as a no-op). This is idempotent by construction.
6. **Concurrency**: the active-relationship uniqueness is enforced by the DB partial unique index as
   the final backstop; the application pre-check is advisory. Concurrent duplicate links resolve to
   one success + one `409` (`23505` mapped to `409`), never two active relationships.

The implementation pass must add explicit tests for: required-key enforcement, replay returns prior
result, key-reuse-with-different-payload conflict, no duplicate outbox row on replay, and no-op
status transition emits no outbox row.

## 7. Validation & HTTP error mapping

Reuse the read surface's `AppError` → HTTP mapping and extend it for write conflict codes. Mapping:

| Condition | `ErrorCode` | HTTP |
| --- | --- | --- |
| Missing/blank required field, bad enum, malformed body, bad email, missing idempotency key | `INVALID_INPUT`, `PARTICIPANT_INVALID_EMAIL` | `400` |
| Unauthenticated (no/blank tenant or actor) | `UNAUTHENTICATED` | `401` |
| Authenticated but not authorized for the action | `FORBIDDEN` / `PERMISSION_DENIED` | `403` |
| Participant / organization / relationship not found for tenant | `PARTICIPANT_NOT_FOUND`, `ORGANIZATION_NOT_FOUND`, `ORGANIZATION_PARTICIPANT_NOT_FOUND` | `404` |
| Duplicate active relationship; duplicate entity id with conflicting payload; idempotency-key reuse conflict | `ORGANIZATION_PARTICIPANT_ALREADY_EXISTS`, `PARTICIPANT_ALREADY_EXISTS`, `IDEMPOTENCY_CONFLICT` | `409` |
| Invalid status transition (if any transitions are disallowed) | `INVALID_INPUT` | `400` |
| Unexpected store/DB error | (any) | `500` (opaque, sanitized) |

Rules:

- **Cross-tenant existence is never revealed.** A participant/organization/relationship that exists
  only in another tenant returns the **same** `404` as a truly missing id. `409` must only occur for
  *in-tenant* conflicts so it cannot be used as a cross-tenant existence probe.
- **Sanitized error bodies**: `{ status: 'error', code, message, requestId }`. No stack traces, no
  SQL, no connection strings, no header echoes. Unknown errors collapse to an opaque `500`
  (`code: 'INTERNAL'`).
- **Status decision**: invalid (unknown) status value → `400`; a *disallowed but known* transition,
  if the domain later defines a transition matrix, → `409`. v1 has no participant status transition
  matrix (any known status is settable), so only `400` applies for status in v1.

## 8. Privacy & payload safety

The Participant Registry's privacy stance is unchanged and extends to writes:

| Field | In authorized same-tenant HTTP **response** | In **outbox** payload | In **telemetry** | Notes |
| --- | --- | --- | --- | --- |
| `participantId` / `relationshipId` / `organizationId` / `tenantId` | ✅ | ✅ | ❌ (telemetry stays low-cardinality; ids are not attributes) | |
| `status` / `relationshipType` / `fromStatus` / `toStatus` | ✅ | ✅ | ✅ (as `result`/operation tags only, not raw ids) | |
| `email` | ✅ (authorized same-tenant only) | ❌ | ❌ | Minimal identifying attribute; never leaves the response body. |
| `displayName` / `givenName` / `familyName` | ✅ | ❌ | ❌ | Names are response-only; outbox carries IDs, not names. |
| `reason` (status transition note) | ❌ (not echoed) | ❌ | ❌ | Audit-only; never in outbox/telemetry. |
| `externalRefs` | ✅ | ❌ | ❌ | Correlation handles; not in outbox payload. |
| `Idempotency-Key` / `Authorization` / any raw header | ❌ | ❌ | ❌ | Never logged, never echoed, never in outbox. |
| Connection strings / secrets / raw body bytes | ❌ | ❌ | ❌ | Never anywhere. |

Hard rules:

- **No sensitive demographic / medical / health fields** are accepted, stored, returned, or
  emitted.
- **No raw headers, bearer tokens, connection strings, or raw request-body bytes** appear in
  telemetry or outbox.
- Outbox payloads carry **IDs and status enums only** — never names or email. This is already true
  of the domain layer's outbox builders and must be preserved.
- The `participant:check` / `ci:check` secret + sport-terminology scanners must continue to pass on
  all new files.

## 9. RLS / tenant-isolation requirements (gated DB tests the implementation must add)

The write implementation pass must add gated (`RUN_DB_TESTS=1`) DB tests proving:

1. **Tenant A cannot create / update / status-change / link / mutate a relationship in tenant B.**
   A write targeting another tenant's participant/organization/relationship resolves to `404`
   (invisible row), never a cross-tenant mutation.
2. **Missing tenant context fails closed** — a write with no resolvable tenant is rejected
   (`401`), and no row is written.
3. The app role is **`NOSUPERUSER` `NOBYPASSRLS`** and RLS is **FORCED** on the participant +
   relationship tables, so the write path cannot bypass tenant isolation.
4. **Write routes never mutate governance tables** — after a participant write, no
   `governance.entity_state` / `state_transition` / `audit_event` / `evidence_object` row is
   created by the participant domain. (The Participant Registry is reference data.)
5. **Outbox commits atomically with the write** — the new row and its single outbox row are
   inserted in the same transaction; if the outbox insert fails, the participant write rolls back
   (no orphan row, no orphan signal).
6. **No cross-tenant existence leak** via differing `404` vs `409` behavior — a conflict (`409`)
   only occurs for in-tenant duplicates; a cross-tenant collision still returns `404`.
7. **Active-relationship uniqueness** is DB-enforced (`organization_participant_active_unique_idx`)
   and returns `409`, while a fresh active relationship after a prior ended one is allowed.

Harness contract (per repo memory `integration-db-harness.md`): `MIGRATE_DATABASE_URL` =
admin/migration URL; `DATABASE_URL` = the **restricted** runtime role (NOT superuser, else RLS
assertions fail by design); self-provisioning suites create the restricted role under the shared
advisory lock. Reuse the existing participant write-branch integration harness pattern.

## 10. Outbox & telemetry expectations

Each successful write emits **exactly one** sanitized outbox row of the corresponding type:

| Operation | Outbox message type | Telemetry counter |
| --- | --- | --- |
| Create | `participant.registry.created` | `participant.registry.created.count` |
| Update | `participant.registry.updated` | `participant.registry.updated.count` |
| Status change | `participant.registry.status_changed` | `participant.registry.status_changed.count` |
| Link | `participant.registry.organization_linked` | `participant.registry.organization_linked.count` |
| Relationship status change | `participant.registry.organization_link_status_changed` | (reuse status/link counter family) |

Expectations:

- Outbox rows carry a **stable dedupe key**, plus `correlationId` / `causationId` lineage propagated
  from the request (the service already supports this via `ParticipantActionMeta`). The HTTP adapter
  should map a request id / `Idempotency-Key` into the correlation/causation lineage.
- Telemetry counters are tagged with `operation` and `result=success|failure` only — **no** ids,
  names, email, headers, or secrets as attributes (low-cardinality, privacy-safe).
- Outbox publishing remains the **only** mechanism for external side effects; the HTTP write path
  itself performs no external calls (no email, no webhook, no Service Bus publish inline). No
  Service Bus sessions (v1 rule unchanged).

## 11. Required implementation sequence

When the write pass is approved, implement in this order (each step independently reviewable):

1. **Authz**: add the three actions + role mappings + unit tests (deny-by-default coverage).
2. **DTOs**: add closed write request/response DTO types + key-set assertion tests.
3. **HTTP adapters**: add `ParticipantWriteHttpAdapter` handlers (one per endpoint), protocol-pure,
   returning `{ status, body }`; map domain results/errors per §7. No server wiring yet.
4. **Hermetic adapter tests**: success + every negative path + DTO/telemetry safety + no-duplicate
   outbox on replay (against the in-memory store).
5. **Server wiring**: extend the participant + organization route handlers to accept `POST`/`PATCH`,
   update `allow` headers, ensure read routes are unaffected; add routing tests (incl. `405`).
6. **Gated DB / RLS tests**: per §9.
7. **Validator + docs**: flip the baseline validator and docs from "no write surface" to "write
   surface present" (see §12 note), update `participant-registry-domain-baseline.md`.
8. **Validation + commit**.

## 12. Required test matrix

| Phase | Scope | Must cover |
| --- | --- | --- |
| 1 — Hermetic adapter | In-memory store, per endpoint | `200/201` success; `400` (missing/blank field, bad enum, bad email, missing idempotency key, malformed body); `401` (no tenant); `403` (unauthorized action); `404` (not found / cross-tenant); `409` (duplicate active link, idempotency-key reuse conflict); DTO closed-keyset; telemetry tag safety; **no duplicate outbox on replay**; no-op status emits no outbox. |
| 2 — Server routing | HTTP server | `405` for disallowed methods; read routes still route unchanged; write routes do not shadow read routes; `allow` header correctness. |
| 3 — Gated DB / RLS | Pg store, `RUN_DB_TESTS=1` | All of §9 (cross-tenant denial, fail-closed tenant, NOSUPERUSER/NOBYPASSRLS + FORCE RLS, no governance mutation, atomic outbox, no cross-tenant leak, active-unique index). |
| 4 — Synthetic lifecycle (optional) | Synthetic tenant suite | A participant create/update/link step in the synthetic lifecycle, proving end-to-end tenant isolation. |
| 5 — Coverage | Hermetic coverage | Strong branch coverage on the new adapters (parity with the read surface); **no regression** in existing coverage; validator asserts the new write files exist once implemented. |

## 13. Open questions / decisions

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | First slice = all five endpoints, or create+update only? | **All five** (domain already supports them, sanitized + tenant-scoped). Fallback: create+update first. |
| 2 | Initial create status: `draft` or `active`? | **`draft`** — promotion to `active` is an explicit status transition, avoiding implicit active state. |
| 3 | Idempotency binding: server-side key→id map vs. client-supplied entity id? | **Prefer client-supplied `participantId`/`relationshipId`** (simplest, leverages existing entity-id idempotency + dedupe keys); optionally also accept `Idempotency-Key` for key-reuse-conflict detection. |
| 4 | Org-scoped authorization for linking now or later? | **Later.** v1 is tenant-scoped; document the future org-scoped restriction on `participant.organization_link.write`. |
| 5 | Does relationship creation require both `participant.write` and the link action? | **No** — the dedicated `participant.organization_link.write` action only (least privilege; linking does not modify the profile). |
| 6 | Should `PATCH` honor an `Idempotency-Key` to collapse duplicate `updated` signals? | **Yes (optional key)** — short-circuit byte-identical retries to avoid duplicate `updated` outbox rows. |
| 7 | Disallowed-but-known status transitions → `400` or `409`? | v1 has no transition matrix (any known status settable) → only `400` (unknown value). Revisit if a matrix is introduced. |

## 14. Go / no-go checklist

Implementation of participant write endpoints may begin **only** when all of the following are
true:

- [ ] The three write actions (`participant.write`, `participant.status.write`,
      `participant.organization_link.write`) and their role mappings are agreed.
- [ ] The five endpoint contracts (method, path, authz, request, response, status codes) in §3 / §5
      are accepted.
- [ ] The idempotency model (§6) — required key on POSTs, replay semantics, key-reuse conflict, no
      duplicate outbox — is accepted, including the §13-Q3 binding decision.
- [ ] The error-mapping table (§7), including the cross-tenant-`404` rule, is accepted.
- [ ] The privacy/payload-safety table (§8) is accepted (email response-only; names/email never in
      outbox/telemetry; no sensitive attributes).
- [ ] The RLS / tenant-isolation DB test obligations (§9) and the full test matrix (§12) are
      accepted as required, not optional.
- [ ] No scope creep from §2 (no registration/payments/enrollment/eligibility, no sensitive
      attributes, no bulk/admin UI, no kernel invocation, no organization mutation).

Until every box is checked, **no participant write endpoint, write DTO, write authorization action,
or write route is implemented.** This document is the contract; the implementation pass is separate.
