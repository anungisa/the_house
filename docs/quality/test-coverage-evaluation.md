# Test Coverage Evaluation — The House v2

> Status: evaluation pass (read-mostly). Produced at commit baseline `8944d1e`
> (Participant Registry HTTP read surfaces). This document inspects existing test
> coverage, classifies gaps, and recommends the next test investments. It adds **no**
> product features, domain behavior, HTTP endpoints, or runtime-semantic changes. The only
> code touched is coverage **tooling** (a dev-only coverage provider, a `coverage:report`
> script, and a coverage-scoping block in `vitest.config.ts`).

---

## 1. Executive summary

The House v2 has a **broad, well-structured test suite**: 97 test files, 1064 tests, mapping
closely onto the 168-file / ~25.6k-LOC source tree. The default `npm test` run is **fully
hermetic** (no DB, Azure, network) and green; 137 DB-gated tests are skipped by design and run
only under `RUN_DB_TESTS=1`.

Two coverage pictures matter:

| Run | Statements | Branches | Functions | Tests |
| --- | --- | --- | --- | --- |
| **Hermetic** (`npm test`, default) | 79.39% | 80.22% | 83.27% | 927 pass / 137 skipped |
| **Gated combined** (hermetic + local DB) | **88.57%** | **80.32%** | **92.81%** | 1064 pass / 0 skipped |

The headline finding: **statement coverage rises ~9 points when the gated DB suites run, but
branch coverage barely moves (80.22% → 80.32%).** This is the single most important signal in
this report. The persistence layer (`Pg*Store` classes) is exercised on its **happy paths** by
integration tests, but the **conditional branches** inside those stores and several domain
services — error handling, filter permutations, status edge cases — remain under-tested. High
line coverage is partially masking lower behavioral coverage on exactly the paths that fail in
production.

Overall posture: **strong enough to keep expanding domains**, with the caveat that the **newest
persisted domain (Participant Registry)** has the weakest branch coverage on its write/service
paths and should not receive HTTP **write** surfaces until those branches are covered by gated DB
tests. The Governance Kernel invariants are deeply covered and safe to build on.

---

## 2. Coverage tooling status

**Before this pass:** none functional. `vitest.config.ts` referenced `coverage.provider: 'v8'`,
but `@vitest/coverage-v8` was **not installed**, so `--coverage` would fail. No coverage scripts
existed. `eslint.config.js` already ignored `coverage/**` (anticipating output).

**Added this pass (tooling only, low-risk):**

- Dev dependency `@vitest/coverage-v8@2.1.9` (pinned to the installed Vitest 2.1.9).
- `coverage:report` npm script (`vitest run --coverage`) — hermetic by default.
- Coverage scoping in `vitest.config.ts`: report on `src/**/*.ts` only; exclude barrel
  `index.ts` re-exports and `*.d.ts`; reporters `text-summary`, `json-summary`, `html`;
  `all: true` so never-imported files surface as gaps. **No thresholds were added** (see §15).

No test behavior changed. DB-gated tests are **not** part of default coverage. Generated/build
artifacts (`dist/`, `legacy/`, `node_modules/`) and CLI script wrappers (`scripts/`) are outside
the coverage target.

> Note: installing the coverage provider pulled in transitive dev-only dependencies that
> `npm` flags (6 advisories). Per the pass constraints, `npm audit fix --force` was **not** run.
> These are dev-time coverage tooling only and are not shipped in the production image.

---

## 3. Commands run and results

All commands run locally; **no** live deploy/smoke, and **no** contact with Azure, Entra/JWKS,
antivirus, Service Bus, Key Vault, container registry, transparency log, or scanner services.

| Command | Result |
| --- | --- |
| `git status --short` | clean at `8944d1e` |
| `npm run typecheck` | ✅ clean |
| `npm run lint` | ✅ clean |
| `npm test` | ✅ 927 pass / 137 skipped (97 files) |
| `npm run build` | ✅ clean |
| `npm run ci:check` | ✅ all baseline validators green |
| `npm run coverage:report` (hermetic) | ✅ 79.39% st / 80.22% br / 83.27% fn |
| Gated combined coverage (local Docker Postgres) | ✅ 1064 pass / 0 skipped; 88.57% st / 80.32% br / 92.81% fn |

**Gated DB harness used** (local throwaway container `house_pg_test` on `127.0.0.1:55432`):

- Created restricted roles `house_app` and `house_outbox_worker` (`NOSUPERUSER NOBYPASSRLS`).
- Created a fresh DB `the_house_cov`, applied migrations `0001`–`0010` as superuser (so the
  domain migrations' conditional grants bind to `house_app`), then applied migration `0001`'s
  documented **core governance grants** to `house_app` (those are intentionally guidance-only in
  the migration, not auto-applied).
- Ran with `MIGRATE_DATABASE_URL` = superuser and `DATABASE_URL` = **restricted** `house_app` —
  confirming the harness note that `DATABASE_URL` must be a non-superuser, non-BYPASSRLS role.

No secrets, tokens, or production connection strings are included in this document (the values
above are local-only throwaway test credentials).

---

## 4. Overall coverage metrics

Gated combined (authoritative behavioral picture):

```
Statements : 88.57% ( 11622/13121 )
Branches   : 80.32% ( 2911/3624 )
Functions  : 92.81% ( 762/821 )
Lines      : 88.57% ( 11622/13121 )
```

Hermetic default (what CI sees today):

```
Statements : 79.39% ( 10418/13121 )
Branches   : 80.22% ( 2653/3307 )
Functions  : 83.27% ( 682/819 )
Lines      : 79.39% ( 10418/13121 )
```

(Branch totals differ between runs because the v8 provider only counts branches in code that is
actually executed; gated runs execute more files, exposing more branch points.)

---

## 5. Subsystem coverage map

Coverage source key: **U** = unit, **I** = integration (in-memory), **G** = gated DB,
**H** = HTTP adapter, **S** = static validator, **L** = synthetic lifecycle, **D** = doc-only,
**✗** = not covered.

### 5.1 Governance Kernel
- Transitions, guards, idempotency, audit/evidence/outbox enqueue, approved-workflow execution.
- `GovernanceKernel.ts` 87% st / ~70% br (U) + (G via affiliation-transition).
- Guards `src/governance/guards` 95% st / 89% br (U).
- `PgGovernanceStore.ts` **7.8% → 97.7% st** (G); branch only **72.9%**.
- **Strong** on invariants; happy-path persistence proven; **branch gaps** in store error/lock
  paths. Sources: U, G.

### 5.2 Workflow
- Metadata creation, decisions, execution, admin read surfaces, HTTP behavior.
- `src/governance/workflow` 61.6% st hermetic; `PgWorkflowStore` **9.2% → 84.4% st / 79.3% br** (G).
- `ApprovedWorkflowExecutionService.ts` 81.4% st / **57.1% br** — governance-critical, weakest
  branch coverage among kernel-adjacent services.
- `src/http/workflow` 90.8% st (U, H). Sources: U, I, G, H.

### 5.3 Evidence
- Storage abstraction, HTTP endpoints, malware scan gate, quarantine, disposition, RLS.
- `src/governance/evidence` 76% st / 83% br (U); `AzureBlobEvidenceStorage` 82% st / **69.7% br**.
- `PgEvidenceQuarantineStore` **4.4% → 58.3% st** (G) — many disposition paths still uncovered.
- `src/http/evidence` 91.5% st (U, H). Sources: U, G, H, L.

### 5.4 Authorization
- Centralized policy, role/permission maps, denial behavior, HTTP enforcement.
- `src/authz` **100% st**, 91–100% br (U). Denial paths exercised in every HTTP adapter suite.
- **Strongest subsystem.** Sources: U, H, L.

### 5.5 Observability
- Counters, events, duration metrics, redaction, exporter behavior.
- `src/observability` 90–100% st; `TelemetryEvents.ts` 100% st but **0% br/fn** (declarative
  constants — no behavior). `src/shared/security/redaction` 100% st / 96.7% br.
- Sources: U, L.

### 5.6 Deployment / Release controls
- Deploy/container/migrations/SBOM/provenance/smoke/release **static validators**: 94–99% st,
  83–91% br (U) — these validators test **themselves** thoroughly.
- `AzureSmokeTestRunner.ts` 84.9% st / **71.4% br** (the one with runtime behavior).
- Sources: U (validators), S (what they assert is *static* repo shape, not runtime). See §13.

### 5.7 Organization Registry
- Service 73.8% st; in-memory store; `PgOrganizationRegistryStore` **5.3% → 85.9% st / 65.6% br** (G).
- `src/http/organization` 94.7% st / 86.8% br (U, H). RLS + tenant isolation proven (G).
- Read-only guarantees asserted (H, G). Sources: U, I, G, H, L.

### 5.8 Participant Registry
- Service 87.5% st / **59.2% br** — lowest service branch coverage.
- In-memory store 87.6% st / **62.7% br**; `PgParticipantRegistryStore` **4.3% → 86.3% st / 57.4% br** (G).
- `ParticipantRegistryErrors.ts` **61.1% st / 79.6% br** — error mapping branches under-tested.
- HTTP read surface `src/http/participant` 86.3% st / 77.2% br (U, H, G); org-relationship reads,
  tenant isolation, email/privacy boundary all proven (H, G).
- **Weakest persisted domain on branches.** Sources: U, I, G, H, L.

### 5.9 Synthetic lifecycle
- End-to-end tenant flow assembling existing services in-memory: submission → two-tier workflow →
  approved kernel execution → evidence → quarantine → outbox → authz → observability, plus
  organization projection and participant linkage, plus Tenant Beta isolation.
- 100% hermetic; proves **orchestration/wiring + no-leak**, but **not** persistence/RLS.
  Sources: L.

### 5.10 Database / RLS
- Migrations `src/db/migrations` 87% st (U) + applied (G). `db/pool.ts` **5% → 83.3% st** (G).
- FORCE RLS enable, missing-tenant fail-closed, cross-tenant denial, restricted-role
  (`NOSUPERUSER`/`NOBYPASSRLS`/least-privilege), outbox atomicity, advisory-lock provisioning —
  all asserted across the per-domain gated suites. Sources: G.

### 5.11 HTTP server / routing
- `src/http/server.ts` **74.4% → 78.8% st / 79.6% br**, still **163 uncovered statements** — the
  routing core retains the most uncovered behavior of any single hot file.
- Route classification, 401/403/404/405, DTO safety, pagination/filtering, non-mutation: covered
  per-surface (U, H), but server-level error/edge branches remain. Sources: U, H, G.

---

## 6. Strongest coverage areas

1. **Authorization** (`src/authz`) — 100% statements, denial paths exercised in every adapter.
2. **Static deployment/release validators** — 94–99% statements, comprehensive fixture matrices.
3. **Governance Kernel invariants** — unknown transition/guard/permission fail-closed, idempotency,
   atomic audit/evidence/outbox, proven by unit + gated DB.
4. **HTTP read adapters** (affiliation, evidence, workflow, organization, participant) — 86–95%
   statements with explicit 401/403/404/405, DTO-key closure, and tenant-isolation assertions.
5. **Shared primitives** (`errors`, `result`, `time`, `uuid`, `security/redaction`) — at/near 100%.

---

## 7. Weakest coverage areas

1. **Process composition roots (0% — genuinely untested):** `src/http/composition.ts` (98 stmts),
   `src/server/api.ts` (45), `src/server/worker.ts` (49), `src/workers/outbox/composition.ts` (38).
2. **`PgAffiliationApplicationStore`** — 55.4% st / **47.1% br** (lowest persistence branch).
3. **`ApprovedWorkflowExecutionService`** — 57.1% branch on a governance-critical execution path.
4. **Participant Registry write/service + Pg branches** — service 59.2% br, Pg 57.4% br,
   in-memory 62.7% br, errors 61.1% st.
5. **`src/http/server.ts`** — 163 uncovered statements; routing/error edge branches.
6. **Cloud adapter branches** — `AzureBlobEvidenceStorage` 69.7% br, `AzureKeyVaultSecretProvider`
   75% br, `PgEvidenceQuarantineStore` 58.3% st.

---

## 8. Critical behavioral gaps (classified)

Scale: **P0** critical correctness/security · **P1** important confidence · **P2** useful ·
**P3** future maturity. Effort: **S/M/L**.

| # | Pri | Subsystem | Gap | Why it matters | Test type | Effort | Suggested pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **P1** | Workflow | `ApprovedWorkflowExecutionService` 57% branch | Approved-workflow execution mutates governed state through the kernel; uncovered branches are decision/guard edge paths | unit + gated DB | M | Branch sweep: authz/guards/kernel execution |
| 2 | **P1** | Participant Registry | Service 59% br / Pg 57% br / errors 61% st | Newest persisted domain; write-path + error branches must be solid **before** HTTP write exposure | unit + gated DB | M | Participant write-path branch sweep |
| 3 | **P1** | HTTP server | `server.ts` 163 uncovered stmts | Routing is security-sensitive (method gating, tenant resolution, fall-through 404) | HTTP adapter + unit | M | HTTP edge negative-path sweep |
| 4 | **P1** | Affiliation persistence | `PgAffiliationApplicationStore` 47% br | Guard facts feed kernel decisions; store branches gate correctness | gated DB | M | Affiliation persistence branch sweep |
| 5 | **P2** | Evidence | `PgEvidenceQuarantineStore` 58% st; disposition paths | Quarantine disposition is a safety control | gated DB | M | Quarantine disposition coverage |
| 6 | **P2** | Cloud adapters | `AzureBlobEvidenceStorage` 70% br, `AzureKeyVaultSecretProvider` 75% br | Failure/retry branches unexercised | unit (mock) | S | Cloud adapter failure-branch tests |
| 7 | **P2** | RLS suites | Per-domain RLS setup duplicated across 6+ files | Fragility/drift risk; `house_app` core grants are guidance-only and easy to miss | refactor (test support) | M | RLS harness consolidation |
| 8 | **P3** | Composition roots | `composition.ts` / `server/*` / `workers/*` 0% | Wiring bootstrap; low logic but unverified | smoke/integration | S | Bootstrap smoke (in-process) |
| 9 | **P3** | Observability | `TelemetryEvents.ts` 0% br/fn | Declarative constants; cosmetically lowers numbers | exclude or trivial unit | S | Coverage exclude tidy |
| 10 | **P3** | Org/Participant in-memory ports | 63–69% br | Filter/pagination permutations | unit | S | Read-filter matrix tests |

**No P0 gaps identified.** RLS isolation, authz denial, and kernel fail-closed invariants are each
covered by dedicated tests; the open items are confidence/branch-depth, not missing critical
controls.

---

## 9. RLS / tenant-isolation coverage assessment

- **Covered well (gated DB):** every tenant-owned table asserts RLS **enabled + forced**; the
  runtime role is verified `NOSUPERUSER` / `NOBYPASSRLS` / least-privilege; missing tenant context
  fails closed; cross-tenant list/detail returns empty/404; outbox enqueue is atomic with state
  writes; self-provisioning suites serialize setup with a shared advisory lock to avoid grant races.
- **Fragmentation risk (P2, gap #7):** RLS setup (`applyMigrations`, `provisionRole`, `deriveUrl`,
  tenant constants) is **copy-pasted across 6+ integration files**. Each new persisted domain
  re-implements it, and the **core governance grants for `house_app` are guidance-only in migration
  `0001`** (not auto-applied) — a real footgun this evaluation hit directly. Consolidating into a
  shared `tests/support` harness would cut drift and make the `house_app` grant contract explicit.
- **Not covered by RLS tests:** the synthetic lifecycle suite proves isolation **in-memory only**;
  it does not substitute for DB RLS proof.

---

## 10. HTTP edge coverage assessment

- **Read surfaces (organization, participant, affiliation, evidence, workflow):** consistent
  401/403/404/405 coverage, closed DTO-key assertions, pagination/filter validation (400 on bad
  input), and non-mutation guarantees. Authorization **denial paths are covered consistently**
  across all adapters (each has unauthorized-role and missing-tenant cases).
- **Gap (P1, gap #3):** `src/http/server.ts` retains 163 uncovered statements even under gated DB —
  primarily routing fall-through, method-mismatch, and error-mapping branches not all reached from
  the per-surface suites. A focused negative-path sweep at the server layer would close this.
- **No write surfaces exist** for the registries — correctly out of scope and therefore not a gap.

---

## 11. Release-control coverage assessment

- The deployment/container/migration/SBOM/provenance/smoke/release **validators** are 94–99%
  covered by unit fixtures and gated in `ci:check`. This is genuine coverage **of the validators'
  logic**.
- **Caveat (see §13):** these validators assert **static repository shape** (files exist, docs
  contain markers, scripts are wired) — not live runtime behavior. Their high line coverage should
  not be read as runtime release-process assurance. `AzureSmokeTestRunner.ts` (the one with real
  runtime logic) sits at 71.4% branch.

---

## 12. Synthetic lifecycle coverage assessment

- **What it proves:** a single hermetic cross-domain flow — application submission → two-tier
  workflow review → approved kernel execution → evidence handling → quarantine (EICAR + clean) →
  outbox effects → authorization → observability — plus organization projection, participant
  linkage, and Tenant Beta isolation, with no tenant-data or sport-term leakage.
- **Value:** excellent **wiring/regression** guard that the subsystems compose correctly and stay
  NSO-generic.
- **Limit:** runs entirely in-memory (no `Pg*Store`, no RLS, no real outbox publish). It is a
  composition proof, **not** a persistence/RLS proof, and should not be counted as such. It is
  proving the right cross-domain behavior **at the orchestration layer**; persistence behavior must
  continue to come from the gated DB suites.

---

## 13. Static validator coverage assessment

- **Do static validators create a false sense of coverage? Partially, yes — and it is worth naming.**
  `src/deployment/*` validators are among the highest-covered files (94–99%), and they inflate the
  global statement number. But each validator's job is to confirm **static repo structure** (file
  presence, doc markers, script wiring), so their coverage measures "we tested our checkers," not
  "the deployment/release path works at runtime."
- **Mitigation already in place:** runtime-bearing deployment code (`AzureSmokeTestRunner`) is
  measured separately and shows the lower (71% branch) number you'd expect.
- **Recommendation:** when reading the global %, mentally separate **validator coverage** (static)
  from **behavioral coverage** (kernel, stores, adapters). The subsystem map in §5 keeps them apart.

---

## 14. Recommended next 5 test passes

1. **Branch coverage for authz/guards/kernel execution** — raise `ApprovedWorkflowExecutionService`
   and kernel decision branches; highest governance value (gap #1).
2. **Participant write-path branch sweep (pre-write-surface gate)** — cover service/store/error
   branches **before** any participant HTTP write surface is built (gap #2, answers Q7).
3. **HTTP edge negative-path sweep** — drive `server.ts` routing/error branches to close the 163
   uncovered statements (gap #3).
4. **RLS cross-tenant regression suite consolidation** — extract the shared DB harness, make the
   `house_app` core-grant contract explicit, and de-duplicate per-domain RLS setup (gaps #4, #7).
5. **Facility domain preflight coverage map** — before the Facility baseline, define its required
   unit + gated DB + RLS coverage up front so it ships with parity to organization/participant.

---

## 15. Coverage policy recommendation

**Do not introduce hard global thresholds in this pass.** The repo had no enforcement and the
branch number (80%) is honest but uneven; a global gate would either be set too low to help or
would block legitimately on the composition roots.

Proposed phased policy (advisory now, enforced later):

- **No global hard threshold yet.** Keep `coverage:report` as guidance.
- **Branch-coverage focus for security-sensitive paths** — authz, guards, kernel transition,
  RLS-touching stores. These are where branch depth, not line count, matters.
- **Gated DB tests required before HTTP exposure of a persisted domain** — and specifically before
  any **write** surface. (Read surfaces already follow this.)
- **Synthetic lifecycle suite must be extended before adding a new cross-domain flow.**
- **Hard gate (later) only for:** the static validators and the authz/RLS test suites — these are
  cheap to keep green and high-signal. Introduce subsystem-specific thresholds once the P1 branch
  gaps are closed, so the gate starts at an achievable, meaningful level.

---

## 16. Out of scope / not evaluated

- No production code semantics changed; no features, endpoints, or domain behavior added.
- No live deploy, live smoke, or real Azure/Entra/JWKS/AV/Service Bus/Key Vault/registry/
  transparency-log/scanner/external-exporter contact.
- No `npm audit fix --force`; the coverage-tooling advisories are dev-only and left untouched.
- Mutation testing, performance/load testing, and contract testing were not evaluated.
- Coverage thresholds were **not** enforced.

---

## 17. Appendix: raw coverage notes

**Hermetic (default) lowest directories (statement %):** `governance/store` 55.1, `governance/
workflow` 61.6, `participant-registry` 61.8, `governance/outbox` 67.4, `affiliation` 68.4 — all
driven down by `Pg*Store` files that are **gated-DB-only** and therefore skipped hermetically.

**`Pg*Store` statement coverage, hermetic → gated:**

| File | Hermetic | Gated |
| --- | --- | --- |
| `PgGovernanceStore` | 7.8% | 97.7% (br 72.9%) |
| `PgWorkflowStore` | 9.2% | 84.4% (br 79.3%) |
| `PgOrganizationRegistryStore` | 5.3% | 85.9% (br 65.6%) |
| `PgParticipantRegistryStore` | 4.3% | 86.3% (br 57.4%) |
| `PgEvidenceQuarantineStore` | 4.4% | 58.3% (br 92.3%) |
| `PgOutboxStore` | 11.9% | 69.6% (br 72.7%) |
| `PgAffiliationApplicationStore` | 8.9% | 55.4% (br 47.1%) |
| `db/pool.ts` | 5.0% | 83.3% |

**Zero-coverage files (both runs):** `src/http/composition.ts`, `src/server/api.ts`,
`src/server/worker.ts`, `src/workers/outbox/composition.ts` — process composition roots /
entrypoints, only exercised by actually starting the process.

**Key ratio:** gated DB adds ~1,200 covered statements but only ~260 covered branches → confirms
persistence paths are executed happy-path without exercising their conditional logic.

### Specific questions answered

1. **Kernel invariants deep enough for more domain expansion?** Yes. Fail-closed transition/guard/
   permission, idempotency, and atomic audit/evidence/outbox are covered (unit + gated). Safe to
   build on; close the `ApprovedWorkflowExecutionService` branch gap opportunistically.
2. **HTTP read surfaces sufficiently covered (org + participant)?** Yes for read — 401/403/404/405,
   DTO closure, pagination/filter, tenant isolation, non-mutation all asserted (unit + HTTP + gated).
3. **Authz denial paths consistent across adapters?** Yes — every HTTP adapter suite includes
   unauthorized-role and missing-tenant denial cases; `src/authz` is at 100% statements.
4. **RLS tests too fragmented/fragile?** Somewhat — setup is duplicated across 6+ files and the
   `house_app` core grant is guidance-only. Consolidation recommended (P2), not urgent.
5. **Synthetic suite proving the right cross-domain behavior?** Yes at the **orchestration** layer;
   it is not (and should not be treated as) a persistence/RLS proof.
6. **Static validators creating false coverage?** Partially — they inflate the global % with static
   checks. The subsystem map separates validator from behavioral coverage (§13).
7. **Which persisted domain should NOT get HTTP/write surfaces yet?** **Participant Registry** —
   it has the weakest write/service + Pg **branch** coverage (57–62%); add gated DB write-path
   branch tests first.
8. **High-risk, low-branch files?** `PgAffiliationApplicationStore` (47% br),
   `ApprovedWorkflowExecutionService` (57% br), `ParticipantRegistryService` (59% br),
   `src/http/server.ts` (163 uncovered stmts).
9. **Next test pass before Facility baseline?** The authz/guards/kernel **branch sweep** (pass #1),
   then a **Facility preflight coverage map** (pass #5).
10. **Coverage thresholds now, later, or not yet?** **Not yet** globally; introduce subsystem-
    specific thresholds after the P1 branch gaps close (§15).

---

## Appendix — Branch Coverage Sweep 1 — Authz / Guards / Kernel Execution

- **Date:** 2026-06-30
- **Commit:** (this pass) — see `Add authz guard kernel branch coverage`
- **Type:** test-confidence pass (no feature, runtime, or governance-semantics changes). Hermetic only — no DB, no network.

### Tests added (31 new hermetic tests across 4 files)

- `tests/unit/governance/workflow/ApprovedWorkflowExecutionService.branch.test.ts` (10) — exercises the THIN coordinator's own decision branches directly (the kernel execution path was already covered by `ApprovedWorkflowExecution.test.ts`): blank tenantId/workflowInstanceId/actorId/idempotencyKey validation, unknown-instance `WORKFLOW_NOT_FOUND`, non-approved (`pending`/`rejected`/`cancelled`) fast gate, delegation using the resolved `transitionRequestId`, and the optional `reason`/`correlationId` pass-through (omitted vs forwarded).
- `tests/unit/governance/GovernanceKernel.branch.test.ts` (6) — approval-required request created with **no planner** (no workflow instance persisted; `workflowInstanceId` omitted); the execution gate failing closed (`WORKFLOW_NOT_APPROVED`) when no review workflow exists; executing a request whose status is neither `pending_approval` nor `executed`; idempotent replay of an approval-required request (the `replayResult` `request` branch); and the `correlationId`/`causationId` conditional-spread branches on the audit + outbox rows (omitted vs propagated).
- `tests/unit/governance/guards/guard-handlers.branch.test.ts` (12) — both outcome branches of every named guard with explicit failure messages, reviewer-scope pass for each reviewer-class role, fail-closed for a non-reviewer / no-roles actor (`?? []`), and fail-closed for missing/malformed (non-object) facts; one async `GuardRegistry.evaluate` unknown-code fail-closed assertion.
- `tests/unit/authz/AuthorizationPolicy.branch.test.ts` (3) — the residual `authorize` branches not reached by the main suite: the defensive `?? []` fallbacks for a malformed actor missing both arrays, and the `roleGrants` loop skipping an unmapped role before matching a later mapped one (plus the loop-exhausts-without-match deny).

### Branches targeted

Authorization precedence + fail-closed fallbacks; guard pass/fail/fail-closed (missing + malformed facts, no-roles actor); kernel approval-required-without-planner, execution gate, non-executable request status, approval-required idempotent replay, and lineage (correlationId/causationId) pass-through.

### Coverage delta (hermetic)

| Metric | Before | After | Delta |
| --- | --- | --- | --- |
| Statements | 79.39% (10418/13121) | **79.79%** (10470/13121) | +0.40 |
| Branches | 80.22% (2653/3307) | **81.09%** (2702/3332) | +0.87 |
| Functions | 83.27% (682/819) | **83.51%** (684/819) | +0.24 |

Per-file branch coverage (the targeted files):

| File | Branch before | Branch after |
| --- | --- | --- |
| `ApprovedWorkflowExecutionService.ts` | 57.1% | **100%** (st 81.4 → 100) |
| `AuthorizationPolicy.ts` | 91.3% | **100%** |
| `governance/guards/handlers.ts` | 86.2% | **100%** |
| `GovernanceKernel.ts` | 70.4% | **77.8%** (st 87.1 → 90.8) |

- ApprovedWorkflowExecutionService branch coverage improved (57% → 100%). ✔
- GovernanceKernel branch coverage improved (70% → 78%). ✔
- AuthorizationPolicy branch coverage improved (91% → 100%) and remains strong. ✔
- No new weak files appeared; no production code changed (no bug found).

### Remaining branch gaps (GovernanceKernel, deliberately not contrived hermetically)

The residual ~22% uncovered `GovernanceKernel` branches are deep defensive fail-closed paths in `executeApprovedTransitionRequest` that only arise under concurrent/persisted drift: missing active state machine at execution time, `lockEntityState` returning undefined at execution, transition re-resolution returning undefined, active-policy target drift (`def.toState !== requestedToState`), an unknown guard code surfacing only at execution, and the `executionReplay` paths reached via the `status==='executed'`/in-transaction `findStateTransition` seams. These are best proven by **gated DB** integration (where row locks and persisted state make them reachable without contriving the in-memory store), not by synthetic hermetic manipulation — covering them hermetically would be blind coverage.

### Recommended next branch sweep

**Participant Registry write-path branch sweep** (the weakest persisted domain at 57–62% write/service/Pg branch) before adding any Participant write surface — ideally as gated DB tests that also reach the residual `GovernanceKernel.executeApprovedTransitionRequest` defensive branches above.

---

## Appendix — Branch Coverage Sweep 2 — Participant Registry Write Paths

- **Date:** 2026-06-30
- **Commit:** (this pass) — see `Add participant registry write branch coverage`
- **Type:** test-confidence pass (no feature, runtime, or governance-semantics changes). No production code changed (no bug found). Hermetic suite + a gated DB write-branch suite (skipped unless `RUN_DB_TESTS=1`).
- **Motivation:** the Participant Registry was the weakest persisted domain (service/store/builder write branches at 52–62%). This sweep proves write-path behavior **before** any Participant write HTTP surface is added (read-only at the HTTP edge in v1 remains unchanged).

### Tests added

- `tests/unit/domains/participant-registry/ParticipantRegistryService.branch.test.ts` (31 hermetic) — the decision branches the behavioral suite does not reach:
  - **create:** blank `tenantId` fail-closed; idempotent replay of a duplicate id (one row, one signal, one telemetry increment); explicit `externalRefs` + `correlationId`-on-created-event.
  - **update:** blank `participantId`; participant-not-found; `null`-clearing vs `undefined`-unchanged semantics for `givenName`/`familyName`/`email`/`externalRefs`; setting concrete values (incl. email normalization); an updated signal emitted even when no field changes.
  - **status:** invalid enum fail-closed; not-found; idempotent no-op (same status → no mutation/signal); a real transition emitting a `status_changed` signal with lineage.
  - **link:** fail-closed when **no organization reader** is configured; invalid `relationshipType`/`status`; an archived participant receiving a **non-active** relationship (allowed); duplicate-active link idempotency (existing relationship returned, one signal); a fresh relationship created once the prior same-type one has ended; lineage + `startDate`/`endDate` pass-through.
  - **relationship status:** absent/blank `relationshipId` → not-found; missing relationship; invalid enum; idempotent no-op; `endDate`-only change treated as a real (non-no-op) update.
  - **read:** absent `participantId` returns undefined yet still records a read.
  - **outbox lineage + sanitization:** `correlationId`/`causationId` propagated onto **all five** registry signals while every payload excludes name/email and any secret/token marker.
  - **`InMemoryParticipantRegistryStore` directly:** `not_found` on update of an absent participant/relationship; `conflict` on a duplicate relationship id (no new signal); keyset-cursor pagination + status/email/type/org/participant filters on both list methods.
- `tests/integration/governance/participant-registry-write-branches.integration.test.ts` (5 gated, `describe.skip` unless `RUN_DB_TESTS=1`) — residual Pg write branches not covered by `participant-registry.integration.test.ts`, all under FORCE RLS as a NON-superuser / NON-BYPASSRLS role: the **profile-update** write path + its transactional `participant.registry.updated` outbox row (sanitized); the **relationship status-change** `organization_link_status_changed` outbox row; the **database backstop** (`organization_participant_active_unique_idx`) rejecting a duplicate non-ended relationship of the same type with a `23505` unique violation when the service idempotency guard is bypassed; a fresh active relationship allowed once the prior one ended; and a profile update touching **no** governed lifecycle row (`entity_state`/`state_transition`/`audit_event` unchanged).

### Branches targeted

Service create/update/status/link/relationship-status write branches (fail-closed validation, idempotent no-ops/replays, not-found paths, null-clear vs unchanged, missing-org-reader, archived-but-non-active linking); the five outbox builders' optional-meta + lineage spreads; in-memory store conflict/not_found/list-cursor branches; and (gated) the Pg update path, the relationship-status outbox row, the single-active-relationship DB unique index, and the no-governance-mutation invariant.

### Coverage delta (hermetic)

| Metric | Before | After | Delta |
| --- | --- | --- | --- |
| Statements | 79.79% | **80.36%** | +0.57 |
| Branches | 81.09% | **83.25%** | +2.16 |
| Functions | 83.51% | **83.76%** | +0.25 |

Per-file branch coverage (the targeted files):

| File | Branch before | Branch after |
| --- | --- | --- |
| `ParticipantRegistryService.ts` | 56.57% | **94.44%** (st 87.5 → 94.23) |
| `InMemoryParticipantRegistryStore.ts` | 62.68% | **94.44%** (st 87.63 → 98.92) |
| `ParticipantRegistryStore.ts` (outbox builders) | 52.17% | **100%** |
| `ParticipantRegistryErrors.ts` | 79.59% | **85.48%** (st 61.11 → 84.02) |

`PgParticipantRegistryStore.ts` remains ~4% statements in the **hermetic** report by design (it is only reached under gated DB); the 5 gated tests above exercise its update / link-status / conflict-backstop branches against real PostgreSQL but do not affect the default hermetic delta.

### DB integration result

The gated suite was executed against a local PostgreSQL (`RUN_DB_TESTS=1`, restricted `house_app_participant_writebranch_test` role, NON-superuser / NON-BYPASSRLS, RLS-confined): **5/5 passed**. The pre-existing `participant-registry.integration.test.ts` remains the authority for create/read/cross-tenant/RLS-forced/outbox-on-create+link/no-governance-mutation; this file is purely additive for the residual write branches. No real Azure, Entra/JWKS, antivirus, Service Bus, Key Vault, Docker image build, registry, Cosign, transparency log, or external network was contacted.

### Remaining participant branch gaps

- `ParticipantRegistryErrors.ts` (~15% uncovered) — a few `optionalExternalRefs` malformed-entry branches (non-array, non-object entry, blank provider/externalId, duplicate pair) and `optionalIsoDate` malformed-format branch are only partially exercised; these are pure boundary validators with no write side effects and could be closed by a small dedicated validator-branch test if desired.
- `ParticipantRegistryService.ts` (~5% uncovered) — the store `not_found`-after-existence-check races on `updateParticipant`/`updateOrganizationLink` (the service reads the row first, so these store outcomes are only reachable under true concurrent deletion); best left to gated DB rather than contrived hermetic manipulation.
- `PgParticipantRegistryStore.ts` — list-filter permutations and the `parseExternalRefs` string-vs-array branch remain gated-only; not blocking.

### Is a Participant write HTTP surface now safe to consider?

**Yes, the write-path *behavior* is now well proven** (service branches 56% → 94%, store 63% → 94%, builders → 100%, gated DB backstops verified). The remaining gaps are boundary-validator edges and concurrency races, not core write logic. A Participant write HTTP surface can now be **designed** (preflight) — but it must route through the same validated service, stay tenant-scoped under RLS, and remain reference-data only (no registration/payment/enrollment/eligibility/sensitive attributes). The HTTP edge itself still needs its own negative-path coverage before exposure.

### Recommended next pass

**Participant write HTTP preflight design under the existing service** — map the request/response contracts, authorization actions (a new `participant.write`-class action distinct from `participant.read`), and HTTP edge negative-path coverage, without adding domain behavior. (Alternatives: an HTTP-edge negative-path coverage sweep, or an RLS cross-tenant regression suite consolidation.)

---

## HTTP Edge Negative-Path Sweep

_Date: 2025 (commit: see `Add HTTP edge negative path coverage`). Test-only + docs; NO production code changed._

A test-confidence pass hardening the native HTTP server transport (`src/http/server.ts` and its adapters) against malformed input, method misuse, route shadowing, and not-wired exposure — before Facility domain work begins. All additions are hermetic (in-memory stores, ephemeral `127.0.0.1:0` listeners, no DB / Docker / Azure / external systems).

### Routes covered (server-transport level)

- **Evidence quarantine** (`handleEvidenceQuarantineRoute`, previously exercised only at the adapter level, never wired into a server test): `GET /v1/evidence/quarantine` (list), `GET /v1/evidence/quarantine/:id` (detail), `POST /v1/evidence/quarantine/:id/disposition`.
- **Workflow admin read** (`handleWorkflowListRoute` / `handleWorkflowDetailRoute`, never wired into a server test): `GET /v1/workflows`, `GET /v1/workflows/:id`.
- **Workflow write body-parse**: `POST /v1/workflows/:id/steps/:step/decision`, `POST /v1/workflows/:id/execute`.
- **Participant write** (`POST /v1/participants`, `PATCH /v1/participants/:id`, `POST /v1/participants/:id/status-transitions`, `POST /v1/organizations/:orgId/participants`, `POST /v1/organizations/:orgId/participants/:relationshipId/status-transitions`).
- **Organization read** (`GET /v1/organizations`).

### Negative-path categories exercised

- **Malformed body parsing** → deterministic `400` error DTO (never `500`, never a partial write) on every write route: participant create/update/status-transition/org-link/rel-status, workflow decision, workflow execute, evidence quarantine disposition.
- **Method gating / 405 + Allow** — quarantine list/detail (`Allow: GET`), disposition (`Allow: POST`); participant org-participants collection `PATCH` (`Allow: GET, POST`).
- **Route shadowing** — `POST /v1/organizations/:orgId/participants/:relationshipId` (3-segment, no `/status-transitions`) correctly `404`s rather than misrouting to the 4-segment status route.
- **Authz fail-closed** — organization read returns `403` for an authenticated actor whose role lacks `organization.read` (distinct from the existing `401` no-tenant case).
- **Not-wired exposure** — quarantine and workflow-read routes `404` when their transport is not configured (no accidental exposure).

### Coverage delta (hermetic default suite)

| Metric | Before | After | Δ |
| --- | --- | --- | --- |
| Statements | 81.23% | **82.33%** | +1.10 |
| Branches | 83.81% | **84.13%** | +0.32 |
| Functions | 84.12% | **84.36%** | +0.24 |

Tests: 1108 → **1129** passing (212 skipped, unchanged). The gain concentrates in `src/http/server.ts` (quarantine + workflow-read dispatch branches and write-route body-parse catch blocks) plus first server-level exercise of `EvidenceQuarantineHttpAdapter` and `WorkflowReadHttpAdapter`.

### Remaining HTTP-edge gaps (intentional / defensive)

- The `405`-branches **inside** `handleParticipantListRoute` / `handleParticipantDetailRoute` / `handleWorkflowListRoute` / `handleWorkflowDetailRoute` are unreachable dead code: dispatch in `handleRequest` pre-guards `method === 'GET'` before those handlers are called, so a non-GET method never enters them. Covering them would require a production change and is intentionally left uncovered.
- The inner last-resort `500` fallback inside `createAffiliationHttpServer` (the defensive `catch { if (!res.headersSent) writeHead(500) }`) is near-unreachable because the outer `.catch` already converts thrown errors into structured responses; left as defensive code.
- These are documented as intentional defensive branches, not test gaps.

### Recommended next pass (do not auto-start)

Facility domain preflight coverage map → Facility Registry domain baseline → actual Azure dev-environment smoke execution.

> **Facility Registry should begin with a preflight coverage map before any code.** The HTTP edge
> and the Participant Registry write surface have just been hardened, so the next domain must first
> fix its scope, kernel boundary, RLS/migration shape, authorization actions, and test matrix in a
> design pass — see [facility-domain-preflight-coverage-map.md](../architecture/facility-domain-preflight-coverage-map.md) —
> before the baseline implementation adds types, a migration, or tests.

---

## Facility HTTP Read PostgreSQL/RLS Validation

_Date: 2026-07-01 (commit: see `Validate facility HTTP read PostgreSQL RLS`). Test + docs only; NO production code changed (no adapter, server, composition, DTO, or migration bug found)._

A gated integration pass proving the already-shipped **Facility HTTP read surface** against real
local PostgreSQL under a restricted runtime role — the deferred validation from the read-surface
implementation pass (`df88e1e`). No write semantics, authz broadening, RLS weakening, or new domain
behavior introduced.

### Suite added

- `tests/integration/governance/facility-registry-http.integration.test.ts` — **29 tests**,
  `describe.skip` unless `RUN_DB_TESTS=1`, serialized by the Vitest gated config. Uses
  `MIGRATE_DATABASE_URL` for admin/migration and a restricted `DATABASE_URL` runtime role
  (`NOSUPERUSER`, `NOBYPASSRLS`, no DELETE) for all HTTP-path assertions. Own unique tenant
  namespace (no collision with the Organization/Participant/Facility integration suites). Drives the
  three GET routes through the native HTTP server (ephemeral `127.0.0.1:0` listener) backed by
  `PgFacilityRegistryStore`; seeds via `PgOrganizationRegistryStore` + `FacilityRegistryService`.

### What it proves

- **Routing / DTO**: same-tenant list, detail, and org-scoped list; closed-key `FacilityDto` with no
  `tenantId`; optional-field null-normalization; opaque cursor pagination that never leaks tenant id
  or SQL internals; HTTP limit clamping; `405` + `Allow: GET` on non-GET; deeper unknown path `404`;
  organization participant routes not shadowed by org-facilities.
- **Authz**: `facility.read` exact permission, `facility_reader` / `facility_admin` roles,
  `platform_admin` wildcard; `401` on missing auth/tenant; `403` for `organization_reader`,
  `participant_reader`, and other actors lacking `facility.read`.
- **Tenant/RLS/privacy**: cross-tenant detail `404`, missing detail `404`, cross-tenant / unknown org
  list → empty; invalid status / facilityType / limit / cursor → `400`; `FORCE ROW LEVEL SECURITY`
  on `facility_registry.facility`; runtime role is non-superuser / non-`BYPASSRLS`.
- **Non-mutation**: reads create zero outbox rows and mutate no facility, Organization Registry, or
  governance lifecycle (`entity_state` / `state_transition` / `audit_event`) rows.

Telemetry redaction (no name / address / contact / coordinates / capabilityTags / headers / body /
tokens) stays covered by the hermetic adapter suite, which reaches the telemetry snapshot without
the scope creep of threading an in-process telemetry exporter through the gated HTTP path.

### Validation result

- Default hermetic suite unchanged and green; the new file skips cleanly when `RUN_DB_TESTS` is
  unset, so `npm test` remains DB-free.
- Dedicated gated suite: **29/29 passed** against local PostgreSQL with the restricted runtime role.
- Full gated integration (`RUN_DB_TESTS=1 npx vitest run tests/integration`): **all passed**, no
  cross-suite interference.
- No production code changed — no Facility HTTP adapter, server, composition, DTO, or migration
  defect was surfaced by real Pg/RLS.

### Recommended next pass (do not auto-start)

Facility write-surface preflight → actual Azure dev-environment smoke execution. The write surface
remains deferred; no Facility write route, action, or preflight exists.

---

## Facility HTTP Write PostgreSQL/RLS Validation

_Date: 2026-07-01 (commit: see `Validate facility write HTTP PostgreSQL RLS`). Test + docs only; NO production code changed (no adapter, server, composition, DTO, or migration bug found). Gated DB run was NOT executed locally — no PostgreSQL was reachable in this environment (Docker daemon down, ports 5432/55432 closed); the suite was authored + collected (45 tests skip cleanly) and runs under `RUN_DB_TESTS=1` against a local restricted role._

A gated integration pass adding an end-to-end PostgreSQL/RLS proof for the already-shipped
**Facility HTTP write surface — phase 1 (create + update)** through the REAL native HTTP server and a
restricted runtime role. No status-transition implementation, no `facility.status.write`, no authz
broadening, no RLS weakening.

### Suite added

- `tests/integration/governance/facility-registry-write-http.integration.test.ts` — **45 tests**,
  `describe.skip` unless `RUN_DB_TESTS=1`, serialized by the Vitest gated config. `MIGRATE_DATABASE_URL`
  for admin/migration; a dedicated restricted `DATABASE_URL` runtime role
  (`house_app_facility_http_write_test`; `NOSUPERUSER`, `NOBYPASSRLS`; `SELECT`/`INSERT`/`UPDATE` on
  `facility_registry.facility` and `governance.outbox_message`, `SELECT` on
  `organization_registry.organization` + participant tables, **no `DELETE`**, no
  governance-lifecycle grants). Drives `POST /v1/facilities` + `PATCH /v1/facilities/:facilityId`
  through the native HTTP server (ephemeral `127.0.0.1:0` listener) backed by
  `PgFacilityRegistryStore` + `FacilityRegistryService` (organization existence via
  `PgOrganizationRegistryStore`). Own unique tenant namespace `…d5`/`…e6` (no collision with any
  other integration suite). Shares the `918273` provisioning advisory lock.

### What it proves (when run under `RUN_DB_TESTS=1`)

- **Create**: same-tenant create via exact `facility.write`, `facility_admin`, `platform_admin`;
  `403` for `facility_reader` / exact `facility.read` / `organization_reader`; `401` on missing
  auth/tenant; `400` on missing `Idempotency-Key`, missing required fields, invalid enum, unknown
  keys; `404` on unknown / cross-tenant organization; `409` on duplicate `facilityId`; closed-key
  `FacilityDto` excluding `tenantId` with null-normalized optionals; exactly one facility row + one
  sanitized `facility.registry.created` outbox row (payload excludes name/address/contact/
  coordinates/tags/headers/tokens/connection strings); no Organization Registry or governed-lifecycle
  mutation.
- **Update**: same-tenant update via the three writer identities; `403` for read-only actors; `401`
  on missing auth; `400` on empty body, malformed JSON, immutable/identity keys, unknown keys; `404`
  for missing / cross-tenant facility (indistinguishable); explicit `null` clears an optional; closed
  DTO excluding `tenantId`; one sanitized `facility.registry.updated` outbox row; no Organization
  Registry or governed-lifecycle mutation.
- **Routing / RLS / privacy**: status-transition sub-resource unimplemented (`404`) and
  `facility.status.write` absent; `405` with `Allow: GET, POST` (collection) / `GET, PATCH` (item);
  deeper unknown path `404`; GET routes still work after create/update; org-participant routes not
  shadowed; `FORCE ROW LEVEL SECURITY` on the facility table; runtime role non-superuser /
  non-`BYPASSRLS` / no `DELETE`; cross-tenant facility invisible; missing tenant fails closed;
  error responses leak no PII, SQL, or stack details.

Telemetry redaction stays covered by the hermetic adapter suite (the gated server wires no telemetry
sink), consistent with the read-surface pass.

### Validation result

- Default hermetic suite unchanged and green; the new file skips cleanly when `RUN_DB_TESTS` is
  unset, so `npm test` remains DB-free.
- Dedicated gated suite: **NOT executed** — no local PostgreSQL reachable in this environment. 45
  tests collected and skipped cleanly.
- Full gated integration: **NOT executed** for the same reason.
- No production code changed.

### Recommended next pass (do not auto-start)

Facility HTTP status-transition implementation, OR (once a local/dev PostgreSQL is available)
execution of this gated suite + the full gated integration run, OR actual Azure dev-environment
smoke execution.
