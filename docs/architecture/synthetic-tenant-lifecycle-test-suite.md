# Synthetic Tenant Lifecycle Test Suite

## Purpose

The synthetic tenant lifecycle suite is a **confidence/regression baseline**. It proves — in a
controlled, NSO-generic, fully hermetic way — that a single tenant-scoped lifecycle can move
through every governed seam the platform exposes today **without** leaking tenant data or
sport-specific terminology, and **without** bypassing the Governance Kernel or the centralized
authorization policy.

It adds **no production behavior**: it assembles only existing services into one in-memory rig
(`tests/support/syntheticTenantLifecycle/`). No new lifecycle state, no `more_info_needed`, no UI,
and no change to governance / workflow / quarantine / release semantics.

## Scope (in)

A tenant-scoped `AffiliationApplication` lifecycle, driven end-to-end:

1. Application submission through the Governance Kernel.
2. Two-tier workflow review **metadata** (regional sign-off then national sign-off).
3. Approved execution of the original pending transition **through the kernel**.
4. Evidence ingestion: a clean upload is stored via the evidence abstraction; an infected upload
   is blocked, quarantined, and **never stored**.
5. Quarantine disposition by a security reviewer.
6. Transactional outbox effects (lifecycle + quarantine) observed in one shared backing array.
7. Centralized authorization at the workflow admin read surface (over the real HTTP edge).
8. In-memory telemetry counters/events, asserted to be free of secrets and raw bytes.

## Out of scope (explicitly)

These are intentionally **not** exercised here; they belong to live/integration passes:

- Live Azure smoke (`smoke:azure`) and any deployed environment.
- Real Microsoft Entra / JWKS token validation.
- Real antivirus engines (ClamAV, Defender for Storage) — a deterministic signature scanner with
  the EICAR **test** signature stands in for the scan gate.
- Real Azure Service Bus publishing / DLQ behavior — only the Postgres-side outbox enqueue is
  observed.
- Browser / UI surfaces.
- Load / performance testing.
- Full multi-domain lifecycle coverage (only `AffiliationApplication` v1 is covered).
- Real database / RLS enforcement (covered by the DB-gated integration tests).

## Why synthetic and hermetic

The suite is deterministic (fixed clock, sequential ids), runs with no I/O to Azure / Entra /
Service Bus / a database / the network, and uses two opaque tenant UUIDs. This keeps it part of
the default `npm test` run and CI gate while remaining a **complement to**, never a substitute
for, the live smoke test.

## Scenario map

| # | Scenario | Proves |
|---|----------|--------|
| 1 | Tenant Alpha submits a synthetic application | submission returns `executed` draft→submitted |
| 2 | Submission creates governed state through the kernel | entity state + journal + outbox written only via kernel |
| 3 | Approval-required transition creates workflow metadata | two-tier review instance + 2 steps, no state mutation |
| 4 | Regional reviewer records regional approval | current step advances to national sign-off |
| 5 | National reviewer records national approval | workflow instance becomes `approved` |
| 6 | Approved workflow execution advances state | kernel executes under_review→approved |
| 7 | Approved workflow execution is idempotent | a single `approve` journal row on retry |
| 8 | Unauthorized actor cannot read workflow admin surface | HTTP 403 + centralized policy denies |
| 9 | Authorized workflow reader can list workflows | HTTP 200 with tenant-scoped items |
| 10 | Tenant Beta cannot see Tenant Alpha workflows | empty list over HTTP and in the store |
| 11 | Clean evidence upload stores metadata | stored via the evidence abstraction |
| 12 | Infected upload records quarantine + rejects | a quarantine event with `infected` scan status |
| 13 | Infected upload stores no evidence bytes | zero governed evidence objects stored |
| 14 | Security reviewer dispositions a quarantine event | status → reviewed; authz allows/denies correctly |
| 15 | Quarantine disposition emits an outbox event | `evidence.quarantine.reviewed` enqueued |
| 16 | Outbox contains expected event types | lifecycle (`AffiliationApplication.*`) + quarantine types |
| 17 | Telemetry records expected counters/events | `workflow.read.count` + `authz.denied` counter/event |
| 18 | Telemetry leaks no tokens/bytes/connection strings | snapshot is free of sensitive values |
| 19 | Quarantine disposition mutates no lifecycle state | journal length + entity state unchanged |
| 20 | Fixtures/test names carry no sport-specific terminology | forbidden-term scan of fixtures + test file |

## Actor map

All actors are NSO-generic identities projected from `tests/support/syntheticTenantLifecycle/syntheticActors.ts`:

| Actor | Role key(s) | Authority |
|-------|-------------|-----------|
| Applicant | `applicant` | submit; no review/admin read |
| Workflow reader | `workflow_reader` | read workflow admin surfaces |
| Regional reviewer | `regional_reviewer` | read + first-tier decision |
| National reviewer | `national_reviewer` | read + second-tier decision |
| Workflow admin | `workflow_admin` | read + decide + execute |
| Security reviewer | `security_reviewer` | quarantine read + disposition |
| Unauthorized | _(none)_ | nothing (fail closed) |

## Tenant isolation checks

- Tenant Beta receives an empty workflow list both over the HTTP read edge and directly from the
  hermetic read store, while Tenant Alpha sees its own instance.
- Every governed read is tenant-scoped; the kernel-seeded data lives only under Tenant Alpha and
  the harness asserts the harness tenant equals `TENANT_ALPHA_ID` at construction.

## Workflow checks

- Approval-required transitions create two-tier review **metadata only** (no lifecycle state
  change at decision time).
- Recording decisions advances the current step then marks the instance approved; execution is
  the **only** workflow surface that causes a lifecycle transition, and it does so exclusively
  through the Governance Kernel and exactly once.

## Evidence / quarantine checks

- The real malware-scan ingestion gate (`evaluateEvidenceScan`) decides accept vs. reject.
- A clean payload is stored through the evidence abstraction; an infected payload (EICAR test
  body) is quarantined as sanitized metadata and is **never** handed to storage.
- A security reviewer disposition advances quarantine status, emits an outbox event, and never
  stores bytes, creates governed evidence, mutates lifecycle state, or calls the kernel.

## Outbox checks

The kernel's lifecycle outbox and the quarantine outbox share a single backing array, so the
suite asserts the presence of the **actual** message types only:
`AffiliationApplication.submit`, `AffiliationApplication.review_start`,
`AffiliationApplication.approve`, `evidence.quarantine.recorded`, and
`evidence.quarantine.reviewed`. (Recording a workflow decision is metadata only and emits no
outbox message — the suite does not assert an invented "decision" event type.)

## Telemetry checks

- The existing telemetry seam emits `workflow.read.count` for an authorized read and an
  `authz.denied` counter + event for a denied read.
- The telemetry snapshot is asserted to contain no raw evidence bytes (clean or EICAR), no
  bearer-token-shaped value, and no connection-string-shaped value, confirming attribute
  redaction holds for the signals this suite produces.

## Running

```bash
npm test                                              # full hermetic suite (includes this one)
npx vitest run tests/unit/synthetic/synthetic-tenant-lifecycle.test.ts
npm run synthetic:check                               # static baseline validator
```
