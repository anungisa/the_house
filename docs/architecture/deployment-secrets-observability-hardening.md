# Deployment, Secrets & Observability Hardening (Platform Readiness Baseline)

> Status: implemented (platform-readiness slice). This pass improves operational safety and
> diagnosability **without** introducing real cloud deployment, IaC, a production identity
> implementation, or any new business behavior.

## Purpose

The House v2 already has a governed transition core, a transactional outbox, evidence
storage, and an evidence malware-scanning gate. Before any real deployment work, the
platform needs a **hardening baseline** so that operators can:

- run the process safely without leaking secrets into logs,
- get a redacted, at-a-glance view of effective configuration,
- receive advisory warnings about local/demo-unsafe configuration combinations,
- observe structured startup / shutdown / batch lifecycle logs,
- probe liveness and readiness over HTTP.

This is **not** a production deployment. It adds no broker, no cluster, no managed identity,
and no JWT validation.

## What this pass adds

| Area | Artifact |
| --- | --- |
| Secret redaction | `src/shared/security/redaction.ts` |
| Config diagnostics | `src/config/diagnostics.ts` |
| Config check runner | `src/config/configCheck.ts` + `scripts/config-check.ts` (`npm run config:check`) |
| Structured logger | `src/shared/logging/logger.ts` (hardened) |
| Readiness probe | `src/http/readiness.ts` + `/readyz` in `src/http/server.ts` |
| Runtime wiring | `scripts/api-dev.ts`, `scripts/outbox-worker.ts` now emit structured, redacted logs |

## Secret redaction

`redactSecrets(value)` deep-copies an arbitrary value, replacing secret-like fields with
`[REDACTED]` and scrubbing URL credentials. It never mutates the input and handles nested
objects, arrays, and `null`/`undefined` safely.

A field is treated as secret when its normalized name (lowercased, with `_`/`-`/spaces
stripped) contains any of: `databaseurl`, `connectionstring`, `password`, `passwd`,
`secret`, `token`, `apikey`, `accesskey`, `privatekey`, `sharedaccesskey`, `credential`,
`key`. URL credentials of the form `scheme://user:pass@host` are rewritten to
`scheme://user:[REDACTED]@host` even when they appear under a non-sensitive key
(defense-in-depth).

Redaction is a fail-safe to keep secrets out of stdout/stderr and log sinks. It is **not**
encryption and **not** a secret-management boundary. Real secret management (Key Vault /
managed identity) remains out of scope.

## Config diagnostics

`buildConfigDiagnostics(config)` returns `{ summary, warnings }`:

- `summary` — a redacted operational view of the effective config. Sensitive values are
  represented as booleans (`database.configured`, `serviceBus.connectionConfigured`,
  `evidenceStorage.connectionConfigured`) — never raw connection strings or credentials.
  The whole summary is additionally passed through `redactSecrets` as a safety net.
- `warnings` — advisory only; they **never** fail config load. Emitted for local/demo-unsafe
  combinations:
  - `AUTH_MODE=demo` in a production-like environment;
  - `AUTH_MODE=trusted_headers` (reminder: requires a verifying identity edge — this adapter
    does not validate JWTs);
  - `EVIDENCE_STORAGE_PROVIDER=memory` in a production-like environment;
  - `EVIDENCE_MALWARE_SCANNING_MODE=disabled` while `EVIDENCE_STORAGE_PROVIDER=azure_blob`;
  - `SERVICE_BUS_ENABLED=false` in a production-like environment;
  - `OUTBOX_WORKER_ENABLED=false` in a production-like environment.

Production-like environments are `development`, `staging`, and `production`
(`isProductionLikeEnv` in `src/config/index.ts`). `local` and `test` are not.

## Logger behavior

`createLogger(minLevel, options?)` emits one JSON object per line with a stable shape:
`{ timestamp, level, message, ...fields }`.

- Timestamps are ISO-8601 (injectable for tests via `options.now`).
- Metadata is redacted via `redactSecrets` before writing.
- `Error` values (at any depth) are serialized to `{ name, message, stack? }` — never raw.
- Stack traces are included **only** when `NODE_ENV !== 'production'`, or when
  `LOG_INCLUDE_STACK=true`. In production, error logs do not leak stacks by default.
- The sink is injectable (`options.write`) for deterministic testing; the default routes to
  `console` by level.

The `Logger` interface is unchanged so call sites stay stable when a real telemetry backend
is wired later.

## Health / readiness contract

| Endpoint | Behavior |
| --- | --- |
| `GET /healthz` | Liveness. Deliberately shallow — `200 { status: "ok" }`, no dependency I/O. |
| `GET /readyz` | Readiness. `200 { status: "ok", checks }` when wired. When a readiness probe is injected, performs a bounded, **tenant-agnostic** `SELECT 1` and returns `503 { status: "not_ready", checks: { database: "unavailable" } }` if the probe fails or times out. |

The readiness probe (`createDatabaseReadinessCheck`) **never** queries tenant-owned tables,
**never** sets tenant context, and **never** mutates state. It is raced against a bounded
timeout (default 2s) so a hung connection surfaces as not-ready instead of blocking. The
production composition wires it via `queryRaw('SELECT 1')`; tests inject fakes. Probe
internals are never surfaced in the HTTP response.

## Runtime startup / shutdown behavior

- `npm run dev:api` (`scripts/api-dev.ts`): loads config, logs a redacted config-diagnostics
  summary + warnings, logs structured startup endpoints, and shuts down gracefully on
  SIGINT/SIGTERM. Startup logs never include connection strings or credentials.
- `npm run worker:outbox` (`scripts/outbox-worker.ts`): loads config, logs a redacted
  diagnostics summary + warnings, and drives the existing `OutboxWorkerRuntime` (startup,
  per-batch summary, skipped-overlap, errors, shutdown) through the structured logger.
  Service Bus stays disabled unless `SERVICE_BUS_ENABLED=true`.

## Local config check

```sh
npm run config:check
```

Loads the effective configuration, prints the redacted diagnostics summary and advisory
warnings, and exits non-zero **only** when configuration cannot be loaded (fail-closed).
Advisory warnings do not fail the check. It never prints secrets and never contacts
Azure/DB/AV.

## Out of scope (explicitly not in this pass)

- Terraform / Bicep / ARM / Kubernetes manifests or any IaC
- Azure Functions host / custom handler deployment
- Managed identity / Key Vault integration
- JWT / Microsoft Entra token validation (the trusted-headers adapter still requires a
  validating identity edge in front of it)
- Centralized log backend, metrics dashboard, or distributed tracing exporters
- Incident runbook automation
- Any change to FSM states, workflow semantics, RLS, the Governance Kernel, the outbox, or
  the evidence abstractions

## Recommended next pass

A JWT / Microsoft Entra validation adapter — trusted `x-house-*` headers are only acceptable
behind a validated edge, so terminating real authentication is the natural next step.
