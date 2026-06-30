# Azure Environment Smoke-Test Baseline

> Status: baseline (CI-visible, statically validated). This pass adds a **safe,
> optional** smoke-test harness for validating a **real, already-deployed** Azure
> dev/test environment, while keeping default validation fully **hermetic** — no
> Azure, no Azure CLI, no live app URL, no database, no credentials, and no
> network in `npm test`, `npm run smoke:check`, or `ci:check`.
>
> Smoke validation is the post-deploy step of the operator release procedure in
> [docs/operations/production-release-runbook.md](../operations/production-release-runbook.md).

## Purpose

The platform already has production-shaped IaC, container packaging, migration
orchestration, SBOM/scanning, and signed-provenance baselines, but no way to
verify that a *deployed* environment is actually reachable, ready, and enforcing
authentication. This baseline adds that environment **verification** layer.

It is verification, **not** deployment automation. It never deploys, mutates
governed lifecycle state, uploads evidence bytes, creates applications, applies
migrations, pushes/signs images, or becomes a source of truth.

## Static vs live mode

| Mode | When | What it does | Cloud/network |
| --- | --- | --- | --- |
| **Static** | every CI run (`npm run smoke:check`) | validates the smoke config, scripts, docs, and the guarded deploy-template placeholder | **none** |
| **Live** | opt-in only (`npm run smoke:azure` with `AZURE_SMOKE_ENABLED=true`) | read-only readiness / liveness / auth checks against a deployed base URL | only the configured base URL |

Default validation runs **static mode only**. The live runner is default-off: with
`AZURE_SMOKE_ENABLED` unset or `!= "true"` it prints a skipped result and exits 0.

## Required environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `AZURE_SMOKE_ENABLED` | `false` | `"true"` enables LIVE checks; anything else stays disabled (hermetic). |
| `AZURE_SMOKE_BASE_URL` | _(empty)_ | Required when enabled. Must be `https` (http allowed only for `localhost`). |
| `AZURE_SMOKE_EXPECTED_ENV` | `dev` | Informational expected-environment label. |
| `AZURE_SMOKE_REQUIRE_AUTH` | `true` | When true, authenticated + unauthenticated read behaviour is verified (needs a token). |
| `AZURE_SMOKE_AUTH_TOKEN` | _(empty)_ | Bearer token for the authenticated read check. Never committed, never logged. |
| `AZURE_SMOKE_ALLOW_MUTATION` | `false` | Accepted but mutation checks are **out of scope** (read-only baseline). |
| `AZURE_SMOKE_TIMEOUT_MS` | `10000` | Per-request timeout (positive integer). |

Optional path overrides (defaults shown): `AZURE_SMOKE_READINESS_PATH=/readyz`,
`AZURE_SMOKE_HEALTH_PATH=/healthz`, `AZURE_SMOKE_AUTHED_READ_PATH=/v1/workflows`.

### Precondition rules (live mode)

- live mode refuses to run unless `AZURE_SMOKE_ENABLED=true`;
- live mode requires `AZURE_SMOKE_BASE_URL`;
- the base URL must be HTTPS (loopback `http://localhost` is allowed for local tests);
- authenticated checks require `AZURE_SMOKE_AUTH_TOKEN` (or set
  `AZURE_SMOKE_REQUIRE_AUTH=false` to skip them).

## Read-only checks

In live mode the runner performs only bounded, read-only `GET`s:

1. **Readiness** — `GET /readyz`; expects `200` (the app's bounded dependency
   probe, e.g. a tenant-agnostic `SELECT 1`).
2. **Liveness** — `GET /healthz`; expects `200` (shallow, unauthenticated).
3. **Authenticated read** *(only when a token is supplied)* — `GET /v1/workflows`
   with `Authorization: Bearer <token>`; expects `200`.
4. **Unauthenticated rejection** *(only when a token is supplied)* — the same
   read-only endpoint **without** a token; expects `401`/`403`, proving auth is
   enforced.

Every request is bounded by `AZURE_SMOKE_TIMEOUT_MS`. Any failed check makes the
runner exit non-zero.

### Readiness endpoint expectations

The deployed app exposes `GET /healthz` (liveness, always shallow) and
`GET /readyz` (readiness; `200` when wired, `503 not_ready` when a backing
dependency is unavailable). The smoke runner treats a non-`200` readiness
response as a failure.

## Auth-token handling

The bearer token is read only from `AZURE_SMOKE_AUTH_TOKEN`, sent only as an
`Authorization` header on the authenticated read check, and **redacted** from
every result detail and error message (via the shared `[REDACTED]` marker). It is
never written to logs, never included in URLs, and never committed. In CI it is
sourced from a GitHub environment secret reference, not a committed value.

## Why mutation checks are disabled

A smoke test must be safe to run against a shared dev/test environment. Creating
or transitioning governed records would mutate lifecycle state, write audit /
evidence / outbox rows, and pollute the environment. Therefore mutation checks
are **out of scope**: even with `AZURE_SMOKE_ALLOW_MUTATION=true` the runner only
records an explicit "out of scope" note and performs no write. All governed
lifecycle changes remain the sole authority of the Governance Kernel.

## production-deploy-template integration

`.github/workflows/production-deploy-template.yml` gains a **manual, guarded**
post-rollout step:

- a new `run_smoke_tests` (boolean, default `false`) workflow input;
- a `Post-deploy Azure smoke tests` step guarded by
  `if: ${{ inputs.run_smoke_tests == true }}` (on top of the existing `DEPLOY`
  confirmation guard);
- it runs `npm run smoke:azure` with `AZURE_SMOKE_BASE_URL` /
  `AZURE_SMOKE_EXPECTED_ENV` from environment **references** (`vars.*`) and the
  token from `secrets.AZURE_SMOKE_AUTH_TOKEN` — never committed values.

The default CI workflow (`.github/workflows/ci.yml`) runs **only**
`npm run smoke:check` (static). It never calls `smoke:azure`, never references a
live URL, and never requires Azure credentials.

## Failure modes

- **Live mode misconfigured** (missing/invalid base URL, non-HTTPS non-localhost,
  `REQUIRE_AUTH=true` with no token) → the runner prints a configuration error
  and exits non-zero before any request.
- **Readiness / liveness non-200** → that check fails; the run exits non-zero.
- **Authenticated read not 200**, or **unauthenticated read not 401/403** → the
  corresponding check fails.
- **Timeout** → the request is aborted at `AZURE_SMOKE_TIMEOUT_MS` and recorded as
  a failure.
- **Static drift** (missing doc/runner/scripts, `ci:check` not chaining
  `smoke:check`, deploy template missing the guarded placeholder, a live-URL or
  Azure-credential reference leaking into `ci.yml`, secret-like values, or sport
  terminology) → `npm run smoke:check` fails.

## Out of scope (intentionally)

- live Azure deployment or provisioning;
- destructive or mutating checks;
- seeded tenant lifecycle tests;
- a synthetic transaction suite;
- load / performance tests;
- alert / monitor integration;
- automated rollback.

## Validate locally

```bash
npm run smoke:check     # static smoke baseline validator (hermetic)
npm run ci:check        # full hermetic gate (includes smoke:check)

# Opt-in, default-off live runner (skips unless AZURE_SMOKE_ENABLED=true):
npm run smoke:azure                      # prints SKIPPED and exits 0
AZURE_SMOKE_ENABLED=true \
  AZURE_SMOKE_BASE_URL=https://dev.example \
  AZURE_SMOKE_AUTH_TOKEN=<token> npm run smoke:azure
```
