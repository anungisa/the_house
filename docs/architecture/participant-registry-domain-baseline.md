# Participant Registry domain baseline

> Status: domain baseline (v1). Tenant-scoped reference structure under the modular monolith.
> This pass introduces the participant/member registry primitive only. It deliberately adds no
> registration, payments, program enrollment, competition, eligibility, or sport-specific
> concepts.

## Purpose

The Participant Registry is a generic, tenant-scoped record of **people** the platform needs to
reference — members, staff, volunteers, officials, and contacts — and their **relationships to
organizations** already held in the Organization Registry.

It is **reference structure, not a lifecycle engine**. It never calls the Governance Kernel and
never mutates governed lifecycle state. Like the Organization Registry, it persists durable,
tenant-isolated rows and emits sanitized outbox signals so downstream experience layers can react,
but the authority for governed transitions remains the kernel alone.

The registry intentionally stays NSO-generic: a participant is just a person record with a display
name and optional contact attributes. No demographic, medical, eligibility, or sport-specific
attributes are modeled.

## Domain model

Two tenant-owned tables in the `participant_registry` schema:

### `participant`

A canonical person/member record.

| Field           | Notes                                                                 |
| --------------- | --------------------------------------------------------------------- |
| `participantId` | UUID primary key (`gen_random_uuid()` default).                       |
| `tenantId`      | Owning tenant. Part of `(tenant_id, id)` uniqueness for tenant-safe FKs. |
| `displayName`   | Required, non-blank.                                                   |
| `givenName`     | Optional.                                                             |
| `familyName`    | Optional.                                                             |
| `email`         | Optional; normalized to lowercase; format-validated.                  |
| `status`        | `draft` \| `active` \| `suspended` \| `archived`. Defaults to `draft`. |
| `externalRefs`  | Optional `{ provider, externalId }[]` for generic external identity correlation (no IdP coupling). |
| `createdAt` / `updatedAt` | Timestamps.                                                  |

Status changes are recorded in place — **records are never deleted**.

### `organization_participant`

A relationship between a participant and a same-tenant organization.

| Field              | Notes                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| `relationshipId`   | UUID primary key.                                                      |
| `tenantId`         | Owning tenant.                                                         |
| `organizationId`   | The related organization (validated via the Organization Registry).    |
| `participantId`    | FK to `participant` via composite `(tenant_id, participant_id)`.        |
| `relationshipType` | `member` \| `staff` \| `volunteer` \| `official` \| `contact` \| `other`. |
| `status`           | `active` \| `suspended` \| `ended`. Defaults to `active`.              |
| `startDate` / `endDate` | Optional `YYYY-MM-DD` dates.                                      |
| `createdAt` / `updatedAt` | Timestamps.                                                  |

A partial unique index enforces at most one **non-ended** relationship per
`(tenant, organization, participant, relationshipType)`, so re-linking is idempotent.

## Tenant isolation

Both tables enable and **force** PostgreSQL Row-Level Security, keyed on
`governance.current_tenant_id()`. The application sets `app.tenant_id` inside the transaction
before any governed-table access; a missing tenant context **fails closed** (the function raises
`P0001`). The application connects as a non-superuser, non-`BYPASSRLS` role with only
`SELECT/INSERT/UPDATE` (no `DELETE`/`TRUNCATE`). Tenant A can never read Tenant B's participants or
relationships.

There is **no cross-schema foreign key** to `organization_registry.organization`. FK checks bypass
RLS and so cannot enforce tenant consistency; instead, organization existence is validated at the
service layer through a read-only `OrganizationReader` port, and confined by RLS. The participant
FK on `organization_participant` uses the composite `(tenant_id, participant_id)` so referential
integrity stays tenant-consistent.

## Organization dependency

The Participant Registry depends on the **Organization Registry** for one thing only: confirming
that an organization referenced by a relationship exists for the same tenant. This is a
**read-only** dependency through the `OrganizationReader` port. The Participant Registry never
creates, updates, or mutates organizations. If no reader is configured, or the organization is not
found for the tenant, linking **fails closed**.

## Outbox signals (sanitized)

Every mutation enqueues a transactional outbox row in the same transaction as the state write
(`governance.outbox_message`), with a stable `dedupe_key` for idempotent retries:

- `participant.registry.created`
- `participant.registry.updated`
- `participant.registry.status_changed`
- `participant.registry.organization_linked`
- `participant.registry.organization_link_status_changed`

Payloads are **sanitized**: they carry ids, types, and statuses only. They **exclude** email,
given/family/display names, and any secret material. External side effects (Service Bus publish,
webhooks, email) happen only after commit via the outbox processor — never inside the registry
transaction.

## Telemetry signals

The service emits in-memory-observable telemetry:

- counters: `participant.registry.created.count`, `participant.registry.updated.count`,
  `participant.registry.status_changed.count`, `participant.registry.organization_linked.count`,
  `participant.registry.read.count`;
- events: `participant.registry.created`, `participant.registry.status_changed`,
  `participant.registry.organization_linked`.

Telemetry attributes carry ids/operations only — never sensitive participant attributes.

## RLS / persistence

Migration `db/migrations/0010_participant_registry.sql` creates the schema, both tables, indexes,
the partial-unique re-link guard, and the RLS enable/force + `SELECT/INSERT/UPDATE` policies. The
`PgParticipantRegistryStore` runs every method inside `withTenantTransaction(...)`, setting the
tenant context before access and locking rows `FOR UPDATE` on mutation.

### Gated DB integration

Integration tests are hermetic by default and run only when explicitly gated:

```
RUN_DB_TESTS=1 \
  MIGRATE_DATABASE_URL=postgres://<admin>@<host>:<port>/<db> \
  DATABASE_URL=postgres://<restricted-role>@<host>:<port>/<db> \
  npx vitest run tests/integration/governance/participant-registry.integration.test.ts
```

The suite self-provisions its own least-privilege, non-`BYPASSRLS` role and proves RLS
enable/force, fail-closed behavior, tenant isolation, sanitized outbox payloads, and that no
governed lifecycle row is ever created or mutated.

## Privacy stance

The registry models the **minimum** needed to reference a person: a display name plus optional
contact attributes. No demographic, medical, eligibility, or sensitive attributes are stored.
Email, when present, is normalized and format-validated, but is **never** emitted in outbox
payloads or telemetry. Records are retained (status-changed, never deleted) so history stays
auditable downstream.

## HTTP read surface

Read-only HTTP endpoints expose the registry to authorized operators. The endpoints are a THIN
transport over the read store: they never mutate the registry, never enqueue an outbox message,
never touch governed state, and never invoke the Governance Kernel.

| Method & path | Purpose |
| --- | --- |
| `GET /v1/participants` | List the authenticated tenant's participants (keyset-paginated). |
| `GET /v1/participants/:participantId` | Read a single participant for the tenant. |
| `GET /v1/organizations/:organizationId/participants` | List an organization's participant relationships for the tenant. |

Key properties:

- **Authorization** is the centralized `participant.read` action (see
  `src/authz/AuthorizationActions.ts`). The `participant_reader` and `participant_admin` roles
  imply it, as does the platform-admin wildcard and the exact `participant.read` permission key.
  Authorization fails closed: an unauthenticated request is `401`, an authenticated-but-unauthorized
  request is `403`, and a denial emits the sanitized `authz.denied` signal.
- **Tenant isolation**: tenant identity comes EXCLUSIVELY from the resolved auth context
  (`x-house-*` trusted headers) — never from the query string, path, or body. A detail read of
  another tenant's participant returns `404` and never reveals cross-tenant existence (RLS makes
  the row invisible to the read). The organization-participants route does **not** probe
  organization existence: an unknown or cross-tenant `organizationId` yields an **empty list**, so
  it can never reveal whether an organization exists in another tenant.
- **Pagination & filters**: list supports `limit` (positive integer; default 50, clamped to a
  maximum of 100), an opaque base64url `cursor`, and optional filters — `status` and `email` on
  participants, and `participantId`, `relationshipType`, and `status` on organization
  relationships. Invalid input is rejected with `400`.
- **Safe projection**: responses expose a CLOSED DTO field set (identity / reference / status
  fields only). Email is returned only on an authorized same-tenant read and is **never** exposed
  to other tenants, in the outbox, or in telemetry. Secrets, raw headers, connection strings, and
  payload bytes are never projected.
- **Telemetry**: each read emits the `participant.registry.read.count` counter tagged with the
  operation (`list` / `detail` / `organization_links`) and result (`success` / `failure`). Names
  stay NSO-generic.

Reads run through the same RLS-enforced `PgParticipantRegistryStore` used elsewhere, so a
non-superuser, non-`BYPASSRLS` role with `SELECT` only is sufficient — no write privileges are
required for the read surface. The gated DB integration suite proves this:

```
RUN_DB_TESTS=1 \
  MIGRATE_DATABASE_URL=postgres://<admin>@<host>:<port>/<db> \
  DATABASE_URL=postgres://<restricted-role>@<host>:<port>/<db> \
  npx vitest run tests/integration/governance/participant-registry-http.integration.test.ts
```

**Write endpoints remain out of scope** (see below).

## Out of scope (intentionally not built)

This pass adds the read surface above only. The following are **intentionally not built** and must
not be added without an explicit request:

- registration, payments, program enrollment, competition, or eligibility;
- any sport-specific concepts or terminology;
- write/admin HTTP endpoints or a generic CRUD API (only the read surface above is exposed);
- new authorization actions beyond `participant.read` (e.g. `participant.manage`);
- identity-provider coupling beyond the generic `externalRefs` correlation field;
- demographic, medical, or other sensitive attributes;
- any direct mutation of the Organization Registry or the Governance Kernel.
