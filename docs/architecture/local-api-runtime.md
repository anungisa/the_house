# Local/Demo API Runtime — AffiliationApplication

> **LOCAL/DEMO ONLY.** This runtime defaults to `AUTH_MODE=demo`, where the HTTP adapter
> trusts the `actor`/`tenantId` parsed from each request body. Do **not** expose this process
> publicly. A real deployment must terminate authentication in a gateway/identity layer in
> front of the adapter and run the adapter in `AUTH_MODE=trusted_headers` so identity is
> derived from verified, edge-injected `x-house-*` headers. See
> [auth-edge-identity-adapter.md](auth-edge-identity-adapter.md).

## Purpose

Give a developer a one-command way to start the existing native-HTTP AffiliationApplication
adapter against a local PostgreSQL database, seed the minimal facts for a successful
`submit`, and exercise the **real governed path** end-to-end:

```
HTTP (scripts/api-dev.ts → src/http/server.ts)
  → AffiliationApplicationService            (domain command boundary)
    → GovernanceKernel.transition()          (sole authority for governed transitions)
      → PgGovernanceStore                     (governed tables + transactional outbox, RLS)
      → guards read PERSISTED affiliation domain facts (never caller payloads)
```

No new authority is added: the runtime only starts the existing composition root
(`createPgAffiliationHttpServer`) and listens.

## Components

| File | Role |
| --- | --- |
| `src/http/runtime.ts` | Testable helpers: `resolveApiRuntimeOptions`, `listen`, `shutdown`. |
| `scripts/api-dev.ts` | Thin entrypoint: build Pg server, listen, graceful shutdown. |
| `src/http/demo/affiliationDemoSeed.ts` | Testable demo-seed builder/executor (pure SQL + runner). |
| `scripts/demo-seed-affiliation.ts` | Thin entrypoint: connect, seed one application. |
| `src/config/index.ts` | Adds `api.host` / `api.port` (`API_HOST` / `API_PORT`). |

## Prerequisites

- Node ≥ 20, dependencies installed (`npm install`).
- A reachable PostgreSQL 15+ with the migrations applied.
- `DATABASE_URL` set (the runtime **requires** it and fails closed otherwise).

## 1. Start PostgreSQL (Docker example)

```bash
docker run -d --name house_pg_test \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=the_house_test \
  -p 55432:5432 postgres:16
```

## 2. Apply migrations (elevated/admin role — DDL needs privileges)

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:55432/the_house_test npm run db:migrate
```

## 3. Create a restricted runtime role (recommended)

Running the API/seed as a **non-superuser, non-BYPASSRLS** role keeps RLS enforced. The
governed grants mirror those documented for the kernel/affiliation passes:

```sql
CREATE ROLE house_app_test LOGIN PASSWORD 'app_pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT USAGE ON SCHEMA governance TO house_app_test;
GRANT SELECT ON ALL TABLES IN SCHEMA governance TO house_app_test;
GRANT INSERT, UPDATE ON governance.entity_state, governance.transition_request,
                       governance.outbox_message TO house_app_test;
GRANT INSERT ON governance.state_transition, governance.transition_guard_result,
                governance.audit_event, governance.evidence_object TO house_app_test;
GRANT EXECUTE ON FUNCTION governance.current_tenant_id() TO house_app_test;

GRANT USAGE ON SCHEMA affiliation TO house_app_test;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA affiliation TO house_app_test;
```

> The outbox **worker** functions (migration 0004) are a separate, narrower role
> (`house_outbox_worker`) — see [outbox-worker-role.md](outbox-worker-role.md). The API
> runtime does not need them.

Using the elevated `postgres` superuser also works locally, but RLS is then bypassed, so
prefer the restricted role to demo the real isolation behavior.

## 4. Seed demo affiliation facts

```bash
DATABASE_URL=postgres://house_app_test:app_pw@localhost:55432/the_house_test \
  npm run demo:seed:affiliation
```

This idempotently seeds (NSO-generic IDs; override via `DEMO_*` env vars):

- `affiliation.affiliation_application` — `required_fields_complete=true`, `documents_verified=true`
- `affiliation.application_document` — one **approved** required document
- `affiliation.season` — current season (for `SEASON_IS_CURRENT`)
- `governance.entity_state` — initial **`draft`** state only (`ON CONFLICT DO NOTHING`)

**Governance guarantees:** the seed performs **no transition** and seeds **no future
lifecycle state**. The initial `draft` is written with `ON CONFLICT DO NOTHING`, so it
never overwrites or advances a real state owned by the kernel. Seeding the initial draft is
permitted for local demo/bootstrap **only**. It uses only `SELECT/INSERT/UPDATE` (no
`DELETE`) so a least-privilege role can run it.

Connection precedence: `DEMO_DATABASE_URL` → `DATABASE_URL`. Use `DEMO_DATABASE_URL` if you
want to seed with a different/elevated connection than the API runtime uses.

## 5. Start the API

```bash
API_PORT=3100 \
DATABASE_URL=postgres://house_app_test:app_pw@localhost:55432/the_house_test \
  npm run dev:api
```

Startup logs the base URL, health/readiness endpoints, the transition route pattern, and a
local/demo-only reminder. Stop with `Ctrl+C` (SIGINT) or `SIGTERM`: the runtime stops
accepting requests, closes the HTTP server, then closes the database pool.

## 6. Sample call — governed `submit`

```bash
curl -X POST \
  http://127.0.0.1:3100/v1/affiliation/applications/22222222-2222-2222-2222-222222222222/transitions/submit \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo:affiliation:submit:2026:22222222-2222-2222-2222-222222222222" \
  -d '{
        "tenantId": "11111111-1111-1111-1111-111111111111",
        "actor": {
          "userId": "33333333-3333-3333-3333-333333333333",
          "roleKeys": ["demo_actor"],
          "permissionKeys": ["affiliation.submit"]
        },
        "context": { "seasonId": "2026" },
        "reason": "Local demo submit"
      }'
```

### Expected response (executed)

```json
{
  "status": "executed",
  "applicationId": "22222222-2222-2222-2222-222222222222",
  "fromState": "draft",
  "toState": "submitted",
  "transitionId": "<uuid>",
  "auditEventId": "<uuid>",
  "requestId": "<uuid>"
}
```

`submit` is low-risk, so there is no evidence object. High-risk triggers (approve, reject,
suspend, reinstate, revoke, close, archive) additionally return an `evidenceObjectId`.

### Idempotent replay

Re-POSTing with the **same `Idempotency-Key`** returns the prior governed result and creates
**no** duplicate rows:

```json
{
  "status": "executed",
  "applicationId": "22222222-2222-2222-2222-222222222222",
  "fromState": "draft",
  "toState": "submitted",
  "replayed": true,
  "requestId": "<uuid>"
}
```

After one (or many idempotent) submit calls, exactly one row exists in each of
`governance.state_transition`, `governance.audit_event`, and `governance.outbox_message`
for the application, and `governance.entity_state.current_state = 'submitted'`.

### Caller-supplied facts are rejected

Guard outcomes derive from **persisted** affiliation-domain facts, never from the request.
A body containing `facts` is rejected:

```json
{
  "status": "error",
  "code": "INVALID_INPUT",
  "message": "Caller-supplied guard facts are not accepted over HTTP; guard outcomes derive from persisted state.",
  "requestId": "<uuid>"
}
```

## Readiness

`/healthz` and `/readyz` both return `200 {"status":"ok"}` and are **process-level only** in
this local runtime — `/readyz` does **not** perform a deep database probe. Deep readiness
(e.g. a lightweight `SELECT 1`) is deferred to a later operational pass.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `DATABASE_URL is required to start the local API runtime` | Set `DATABASE_URL` (see `.env.example`). |
| `No active state_machine for AffiliationApplication … Run database migrations` | Run `npm run db:migrate` before seeding. |
| Seed/submit raises `TENANT_CONTEXT_MISSING` (P0001) | Restricted role used without tenant context — the scripts set it; ensure you used the provided scripts and `tenantId` matches the seeded tenant. |
| `password authentication failed` | Role/password mismatch in `DATABASE_URL`; create the restricted role (step 3) or fix credentials. |
| Submit returns `rejected` with `GUARD_FAILED` | Demo facts not seeded (or wrong `applicationId`); run `npm run demo:seed:affiliation`. |
| `EADDRINUSE` on start | Port in use; set a different `API_PORT`. |

## Current stubs (unchanged by this pass)

- **Service Bus disabled by default** — a real `AzureServiceBusPublisher` now exists, but
  `SERVICE_BUS_ENABLED=false` (the default) keeps the outbox publisher a no-op; this local
  runtime never requires a broker. See
  [azure-service-bus-publisher.md](azure-service-bus-publisher.md).
- **No production authentication** — local/demo trusts the request `actor`/`tenantId`.
- **No workflow executor** — approval-required transitions record a request only.
- **No real payment processor** — `payment_obligation` is a persisted record only.
- **Evidence payloads default to in-memory** — narrow upload/download HTTP endpoints
  (`POST /v1/evidence/objects`, `POST /v1/evidence/objects/read`) are served when evidence is
  wired; the default `memory` provider needs no Azure. See
  [evidence-http-endpoints.md](evidence-http-endpoints.md). Durable `azure_blob` is config-gated.
- **No frontend** — this is a backend platform core.

## Recommended next pass

- Real Azure Service Bus publisher (replace the Noop publisher).
- Production auth / edge identity adapter (derive `actor`/`tenantId` from verified claims).
- Real document/evidence storage.
- Workflow metadata for two-tier review.
