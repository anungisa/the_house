# The House v2 — Backend Scaffolding

## Repo purpose

The House v2 is the **governed backend platform core** for Canadian National Sport
Organization (NSO) operations. It is the governed system-of-record beneath experience
layers (such as The Button). This is an enterprise backend/platform repository, **not** a
frontend prototype.

## Modular monolith boundary

The House v2 is a **governance-first modular monolith**. There are no microservices, no
frontend UI, and no unrelated domain modules in this scaffold. Module boundaries are
explicit folders under `src/` with a single shared Governance Kernel at the centre.

## House vs Button separation

- **The House v2** = governed platform core / system-of-record (this repo).
- **The Button** = a stakeholder/public experience layer that *consumes* the House.

The Button (and any experience layer) may **request** actions, but it must not own governed
lifecycle rules. No Button code lives here.

## NSO-generic national sport platform core

The platform core is designed for **all Canadian NSOs**, not only Curling Canada. Core
layers (Governance Kernel, tenancy, identity, audit, evidence, outbox, shared types, core
table names, generic API contracts) use **generic** concepts: national/regional/local
organization, organization unit, participant, athlete, coach, official, volunteer, staff,
facility, team, league, program, event, season, eligibility, affiliation, membership,
compliance obligation, policy, workflow, evidence, audit, consent, payment obligation.

Generic scope fields are used everywhere in core types: `tenantId`, `organizationId`,
`organizationUnitId`, `nationalOrganizationId`, `regionalOrganizationId`,
`localOrganizationId`, `scopeType`, `scopeId`. Sport-specific fields such as `ptsoId`,
`clubId`, or `curlerId` are **not** used in core layers.

## Curling Canada as first reference profile only

Curling Canada and the legacy Base44 app are the **first reference profile** and the
original **domain source** — not the platform architecture. Curling-specific terms (PTSO,
MA, club, curler, curling centre, bonspiel, championship, league) may appear only in
documentation, the Curling Canada reference profile, future sport-profile configuration,
and clearly-marked curling test fixtures. See
[`../sport-profiles/curling-canada-reference-profile.md`](../sport-profiles/curling-canada-reference-profile.md).

## Legacy Base44 app as domain reference only

The legacy app under `legacy/curl-link-hub-extracted/` is a **domain reference**, not an
implementation authority. Its patterns to reject (direct status mutations, app-layer-only
RLS, scattered lifecycle logic, ad hoc audit writes, Base44-specific abstractions, UI-owned
governance) are documented in
[`legacy-to-house-v2-modernization-map.md`](legacy-to-house-v2-modernization-map.md).

## Initial folder structure

```
src/
  config/                 # typed config loader (fails closed in prod-like envs)
  db/                     # DB access layer boundary (pool, txn, tenant context) — placeholder
  governance/
    types/                # TransitionTypes.ts (NSO-generic kernel contracts)
    kernel/               # GovernanceKernel.ts (transition() stub — NotImplemented)
    guards/               # GuardRegistry.ts (named handlers, fail closed on unknown)
    outbox/               # OutboxTypes.ts, OutboxPublisher.ts (skeleton; no sessions v1)
    audit/                # append-only audit boundary — placeholder
    evidence/             # immutable evidence metadata boundary — placeholder
    workflow/             # approval workflow boundary + deferred review hooks — placeholder
  identity/               # actors/roles/access boundary — placeholder
  tenancy/                # tenant context + DB-layer RLS boundary — placeholder
  domains/
    affiliation/          # first domain module (entity type + triggers) — requests only
  sport-profiles/
    curling-canada/       # reference profile placeholder (docs only)
  workers/
    outbox/               # OutboxWorker.ts skeleton + backoff.ts (true full jitter)
  shared/
    errors/               # AppError, NotImplementedError, stable ErrorCode
    result/               # Result<T,E>
    logging/              # vendor-neutral logger (TODO: App Insights/OTel)
    time/                 # Clock abstraction
    uuid/                 # IdGenerator abstraction
db/
  migrations/             # ordered SQL migrations (placeholder 0001 only)
  seed/                   # operational/demo seed (placeholder)
scripts/                  # db:migrate / db:seed placeholder runners
tests/
  unit/                   # GuardRegistry, GovernanceKernel, backoff (passing scaffold tests)
  integration/            # affiliation transition (skipped — needs DB + kernel)
  fixtures/               # curling reference fixtures (clearly marked) — placeholder
```

## Current scaffold status

Implemented (scaffold-level, intentionally minimal):

- TypeScript + Node tooling: `package.json` scripts (typecheck, lint, test, test:unit,
  test:integration, build, format, db:migrate, db:seed), `tsconfig`, ESLint flat config,
  Prettier, Vitest.
- Typed config loader that fails closed for required values in production-like envs.
- `.env.example` with placeholders only (no secrets).
- DB migration folder + conventions README + a **placeholder** governance migration
  documenting tables, RLS, and seed scope (no production DDL).
- Governance contracts: `TransitionTypes.ts` (NSO-generic), `GovernanceKernel` stub,
  `GuardRegistry` with fail-closed unknown-guard behaviour and the six AffiliationApplication
  guard-code placeholders.
- Outbox: types, publisher abstraction + no-op skeleton, worker skeleton, and a **real**
  true-full-jitter backoff helper.
- Shared errors/result/logging/time/uuid utilities.
- Module-boundary placeholders for audit, evidence, workflow, identity, tenancy, db, and
  the affiliation domain.
- Passing scaffold tests (GuardRegistry, GovernanceKernel stub, backoff) and a skipped
  integration suite.

Intentional stubs: `GovernanceKernel.transition`, `OutboxPublisher.publish`, and all
`OutboxWorker` I/O methods throw `NotImplementedError`.

## Next implementation pass: Governance Kernel FSM vertical slice

The next pass implements the AffiliationApplication v1 Governance Kernel slice per
[`../ai/house-v2-governance-kernel-vertical-slice.md`](../ai/house-v2-governance-kernel-vertical-slice.md)
and [`../adr/ADR-0001-house-v2-governance-kernel.md`](../adr/ADR-0001-house-v2-governance-kernel.md):
production DDL + RLS + seed, the full transactional `transition()` algorithm, registered
guard handlers, audit/evidence writers, idempotency enforcement, the outbox processor, and
the Azure Service Bus publisher — with the required unit/integration tests.

## Deferred concerns (placeholders only — do NOT expand the v1 FSM)

- **Two-tier review (PTSO/CC):** modeled later as workflow metadata + approval-tier
  sign-offs, not as additional FSM states.
- **Return-for-more-info (`more_info_needed`):** modeled later as a transition-request
  outcome / loop, not an FSM state.

The v1 FSM stays: `draft → submitted → under_review → approved/rejected → active →
suspended → revoked → closed → archived`.

## Sport-specific language belongs in sport profiles

Sport-specific terminology never enters platform core. It lives in sport profiles,
fixtures, examples, and documentation. The Governance Kernel and all core layers remain
NSO-generic.
