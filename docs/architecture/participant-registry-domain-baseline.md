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

## Out of scope (intentionally not built)

This pass is a domain baseline only. The following are **intentionally not built** and must not be
added without an explicit request:

- registration, payments, program enrollment, competition, or eligibility;
- any sport-specific concepts or terminology;
- HTTP transport / read or write endpoints for participants;
- identity-provider coupling beyond the generic `externalRefs` correlation field;
- demographic, medical, or other sensitive attributes;
- any direct mutation of the Organization Registry or the Governance Kernel.
