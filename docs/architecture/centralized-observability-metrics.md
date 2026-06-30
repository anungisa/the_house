# Centralized Observability / Metrics Baseline

## Purpose

The House v2 emits operational telemetry — **counters**, **durations**, and **operational
events** — through a small, vendor-neutral layer. This pass adds the baseline only: a
dependency-light telemetry abstraction plus instrumentation across the HTTP, authorization,
workflow, evidence, quarantine, and outbox runtime paths.

It changes **no** business, governance, FSM, or quarantine semantics. Telemetry never mutates
governed state, never blocks a transition, and never participates in a governance transaction.
Emission failures are swallowed: a broken exporter cannot break a request.

## Primitives (`src/observability/`)

| Type | Role |
| --- | --- |
| `Telemetry` | The interface callers use: `incrementCounter`, `recordDuration`, `recordEvent`. |
| `TelemetrySignal` | A normalized `{ kind, name, value?, attributes }` record. |
| `TelemetryExporter` | A sink with a single `export(signal)` method. |
| `ExportingTelemetry` | Sanitizes + redacts attributes, then calls the exporter inside a try/catch (`safeExport`). |
| `NoopTelemetry` / `NOOP_TELEMETRY` | Does nothing. The default when telemetry is disabled or not injected. |
| `InMemoryTelemetry` | Test/diagnostic exporter that retains (already-redacted) signals for assertions. |
| `ConsoleTelemetryExporter` | Serializes one redacted single-line JSON record per signal to a log sink. |
| `createTelemetry(options)` | Factory selecting the exporter from config. |
| `startStopwatch()` | Monotonic timer (`node:perf_hooks`) used for durations. |

Stable signal names live in `TelemetryEvents.ts` (`TelemetryCounters`, `TelemetryDurations`,
`TelemetryEvents`, `TelemetryAttributeKeys`, `TelemetryResult`). `ALL_TELEMETRY_NAMES` enumerates
every name and is asserted to contain **no** sport/domain-specific terminology.

## Exporter modes

Selected by `OBSERVABILITY_EXPORTER` (fail-closed enum):

- `noop` — discard all signals.
- `memory` — retain in process (diagnostics/tests).
- `console` — structured single-line JSON to the log sink (default).

`OBSERVABILITY_ENABLED` (default `true`) forces the no-op when `false`.
`OBSERVABILITY_INCLUDE_DEBUG_ATTRIBUTES` (default `false`) is reserved for future
higher-cardinality attributes. An unknown exporter value throws at config load.

## Naming convention

- Counters end in `.count` (e.g. `http.request.count`).
- Durations end in `.duration_ms` (e.g. `workflow.decision.duration_ms`).
- Events are dotted nouns/verbs (e.g. `authz.denied`, `outbox.batch.completed`).
- Names are NSO-generic — no `ptso`, `club`, `curl`, `bonspiel`, etc.

## Redaction guarantee

`sanitizeTelemetryAttributes()` drops `undefined`/non-primitive values, then runs the shared
`redactSecrets` over the attribute map **before** any signal is stored or exported.
`ConsoleTelemetryExporter` re-applies `redactSecrets` to the serialized record as defense in
depth. Sensitive keys (token / bearer / authorization / connection string / password / secret /
key) and credential-bearing values become `[REDACTED]`. The HTTP layer records only a stable
route **pattern** (`POST /v1/affiliation/applications/:id/transitions/:action`) and status — never
raw URLs, headers, bodies, or evidence bytes.

## Instrumented seams

| Seam | Counters | Durations | Events |
| --- | --- | --- | --- |
| HTTP server | `http.request.count`, `http.request.error.count` (5xx) | `http.request.duration_ms` | — |
| Authorization | `authz.denied.count` | — | `authz.denied` |
| Workflow read | `workflow.read.count` | — | — |
| Workflow decision | `workflow.decision.count` | `workflow.decision.duration_ms` | `workflow.decision.recorded` |
| Workflow execution | `workflow.execution.count` | `workflow.execution.duration_ms` | `workflow.execution.requested` |
| Evidence upload | `evidence.upload.count`, `evidence.upload.rejected.count` | `evidence.upload.duration_ms` | — |
| Evidence quarantine | `evidence.quarantine.recorded.count`, `evidence.quarantine.disposition.count` | — | `evidence.quarantine.recorded`, `evidence.quarantine.disposition.recorded` |
| Outbox worker | `outbox.batch.count`, `outbox.message.published.count`, `outbox.message.failed.count` | `outbox.batch.duration_ms` | `outbox.batch.completed`, `outbox.batch.failed` |

HTTP metrics are emitted from a `res.on('finish')` listener so the real status code is captured
without threading telemetry through every handler. Each adapter takes an **optional** `telemetry`
dep and defaults to `NOOP_TELEMETRY`, so omitting it is always safe.

## Wiring

`src/http/composition.ts` builds a single `Telemetry` from `config.observability` via
`createTelemetry` and passes it to the HTTP server plus every sub-deps builder.
`scripts/outbox-worker.ts` builds its own from the same config. The pure `authorize()` decision
function remains telemetry-free; only the throwing `assertAuthorized()` wrapper emits on denial.

## Out of scope (intentionally not in this pass)

- Hosted vendor SDKs (Application Insights, OpenTelemetry, Prometheus, Datadog).
- An OTel Collector, scrape endpoint, or push gateway.
- Dashboards, alert rules, SLOs / error budgets, or SIEM integration.
- Distributed tracing / span propagation.
- Persisting metrics to a store.

These can be layered later behind the `TelemetryExporter` interface without touching callers.
