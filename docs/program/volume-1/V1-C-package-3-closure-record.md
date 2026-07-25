# V1-C - Package 3 Closure and Freeze Record

Document ID: V1-C  
Title: Volume 1 Package 3 Closure and Freeze Record  
Status: RATIFIED  
Version: 1.1.0  
Ratification: Package 3 closure, amended to v1.1.0 (closure-evidence addendum V1-C.7-V1-C.9; DEC-V1-020); basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see REG-108 APP-V1-021, APP-V1-023, APP-V1-024)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G3)  
Supersedes: None  
Review Cycle: Frozen; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-C.1 Purpose

This section is normative.

This record closes and freezes Volume 1 Package 3 (The House Implementation
Qualification). It is authored and committed separately from the Package 3
authoring work, satisfying the separate-review-and-freeze requirement.

## V1-C.2 Package 3 review outcome

This section is normative.

Package 3 qualified The House v2 as the production-candidate implementation
without treating its stronger engineering discipline as proof of production
readiness. It delivered:

- a cryptographic repository/runtime fingerprint for SRC-002 and controlled
  sub-corpora SRC-010..SRC-015, with an explicit runtime-vs-documentation
  distinction (V1-10; REG-101);
- a reproducible implementation inventory via `npm run qualification:house`
  (14 machine-readable inventories in `generated/house/`; V1-10);
- a domain, data, API, and integration architecture qualification (V1-11);
- a Governance Kernel, authorization, workflow, and evidence qualification on an
  explicit eight-rung assurance ladder (V1-12);
- a test, operational, security, and production-readiness assessment that keeps
  production value separate from production readiness (V1-13);
- a House-to-target hardening, convergence, and first-release-path chapter
  answering which parts to retain/harden, adapt, or rebuild, and the exact gaps
  blocking the first affiliation release (V1-14);
- twelve House capabilities with dispositions (CAP-019..CAP-030; REG-103, REG-106),
  eleven House findings (FND-023..FND-033; REG-104), four contradictions
  (CON-008..CON-011; REG-105), and twelve House evidence records
  (EV-023..EV-034; REG-102);
- Gate V1-G3 (The House Qualification Complete).

The governance toolchain (`npm run governance:check:v1`) validated the corpus with
zero errors and zero warnings. No product functionality was implemented, no master
development plan was authored, and Volume 0, Package 1, and Package 2 remained
frozen and unmodified.

## V1-C.3 Central-question determination

This section is normative.

- **Retain and harden:** Governance Kernel, forced-RLS tenancy, guard registry,
  transactional outbox, idempotency, reference registries, fail-closed
  configuration/secrets, and deployment/qualification validators (V1-14.2).
- **Adapt:** governed authorization (make it resource-aware), the affiliation
  lifecycle (add create/bootstrap, return-for-information, versioned
  requirements), and evidence-upload wiring (V1-14.3).
- **Rebuild:** reviewer routing / jurisdiction assignment (V1-14.4).
- **Exact gaps blocking the first complete affiliation release:** the eight items
  of V1-14.5 (no create path; role-only authorization; no reviewer routing;
  unwired evidence; no return-for-information; no versioned requirements; unproven
  governed database behaviour; no deployed environment / Noop-default outbox).

**Production-readiness determination:** NOT ESTABLISHED (V1-13.6).
**Affiliation-readiness determination:** NOT READY - blocked by the V1-14.5 gaps.
**Package 4 authorization:** NOT GRANTED by Package 3; Gate V1-G3 authorizes only
that Package 4 (master development planning) may begin as the next assessment/
planning step. No implementation and no material commitment are authorized.

## V1-C.4 Gate V1-G3 disposition

This section is normative.

Gate V1-G3 (The House Qualification Complete) disposition: **PASS**
(DEC-V1-017; REG-108 APP-V1-022). Gate V1-G3 is disposed PASS because all of the
following conditions are met:

1. the assessed repository and true runtime tree are cryptographically
   fingerprinted, with runtime distinguished from documentation (V1-10.2; SRC-002;
   EV-023);
2. the implementation inventory is reproducible via `npm run qualification:house`
   (V1-10.4; EV-023, EV-024, EV-027, EV-030, EV-032, EV-033);
3. all material implementation paths - database, kernel, authorization, workflow,
   evidence, API, integration, tests, operations - are assessed (V1-11..V1-13);
4. the P0 questions are revalidated against source, not restated (V1-12; REG-104
   FND-023..FND-033);
5. every House capability has an explicit disposition (REG-103, REG-106
   CAP-019..CAP-030 / QD-019..QD-030);
6. production value is separated from production readiness (V1-13.5);
7. the affiliation journey is qualified end-to-end and its release-blocking gaps
   are enumerated (V1-11.5, V1-12, V1-14.5);
8. skipped and infrastructure-dependent tests are disclosed, not counted as
   passing (V1-13.2; FND-028);
9. operational and deployment readiness are assessed and found unproven for want of
   a deployed environment (V1-13.3; FND-029);
10. **no implementation is authorized** - every qualification decision carries
    `authorizes_implementation: false` (REG-106);
11. contradictions between design-intent narrative and demonstrated behaviour are
    registered (REG-105 CON-008..CON-011);
12. this record provides line-level closure and freeze (V1-C.5).

## V1-C.5 Freeze

This section is normative.

Package 3 is frozen at v1.0.0 (base commit recorded in REG-108 APP-V1-023). The
frozen artifacts are chapters V1-10, V1-11, V1-12, V1-13, V1-14, and this record
V1-C, each at v1.0.0, plus Gate V1-G3. The Package 3 registers (REG-101..REG-106)
and the qualification tooling remain living machinery and are not frozen by this
approval; the freeze-integrity control rejects unamended version drift on the
frozen chapters.

Any change to a frozen Package 3 artifact requires an amendment decision in REG-107
(with `amends` set to the artifact id and a stated `amendment_reason`), a version
increment, and re-ratification, exactly as for Packages 1 and 2. Volume 0, Package
1, and Package 2 freezes are preserved and unmodified.

## V1-C.6 Standing constraints carried forward

This section is normative.

Executive organizational acceptance (Nolan, D0) remains **pending** and is reserved
for a later material-commitment gate before any build or master development plan is
executed. The evidence basis for all Package 3 artifacts is SELF-ATTESTED /
AUTHOR-VERIFIED; independent validation is not claimed, and no independent-assurance
or production-proven label is asserted. Package 4 authoring, if it begins, remains a
planning and assessment activity until such a gate.

## V1-C.7 Closure-evidence addendum - the fourteen-item P0 disposition matrix (amendment v1.1.0)

This section is normative. It was added by controlled amendment (DEC-V1-020;
amends V1-C) to make the Package 3 re-examination of the fourteen mandatory P0
items explicit as one dispositioned row per item. It records evidence already
held in the Package 3 chapters and registers; it does not reopen the assessment,
change any finding, or alter the Gate V1-G3 disposition. Evidence ratings follow
the E0-E4 scale (V1-04); the evidence hierarchy is executable test > runtime code
> DB constraint > migration > service contract > architecture document (V1-12.1).

**P0-1 - Resource-aware authorization.**
- Determination: CONFIRMED DEFECT.
- Source: `src/governance/permissions/PermissionChecker.ts` (DefaultPermissionChecker input carries no entity id); `src/domains/affiliation/DomainBackedAffiliationGuardRepository.ts`.
- Symbol: `actorHasReviewerScope` returns `roles.some(r => REVIEWER_ROLES.has(r))` - role membership only, no binding to the specific applicant/jurisdiction.
- Test evidence: unit tests exercise role logic only; the control stops at ladder rung 4 and reaches neither rung 5 (resource-aware) nor rung 7 (integration proof).
- Evidence rating: E3.
- Finding: FND-023 (also CON-008, FND-033).
- Qualification decision: QD-025 (CAP-025 ADAPT).
- Release impact: BLOCKS release (V1-14.5 gap 2); production risk high.

**P0-2 - Assigned-reviewer and jurisdiction enforcement.**
- Determination: CONFIRMED DEFECT (mechanism absent).
- Source: no routing/assignment symbol exists; nothing selects which reviewer may act on a given application (SRC-011; V1-12.3).
- Symbol: none (absence corroborated by direct read).
- Test evidence: none; not modeled.
- Evidence rating: E3 (absence corroborated against source).
- Finding: FND-024.
- Qualification decision: dispositioned within QD-024 / QD-026; recommended REBUILD.
- Release impact: BLOCKS release (V1-14.5 gap 3); production risk high.

**P0-3 - Evidence binding to transitions.**
- Determination: CONFIRMED DEFECT (modeled in-kernel; HTTP transport unwired).
- Source: `src/governance/kernel/GovernanceKernel.ts` writes the `evidence_object` carrying the `state_transition` id inside the transition transaction (rung 6); the HTTP evidence-upload path is independent of the governed decision.
- Symbol: kernel evidence-metadata write vs. the separate evidence-upload adapter; no create-application -> upload-evidence -> submit-with-evidence flow.
- Test evidence: `EvidenceHasher` / quarantine unit tests pass; no end-to-end binding test; no rung-7 proof.
- Evidence rating: E3.
- Finding: FND-025.
- Qualification decision: QD-023 (CAP-023 ADAPT).
- Release impact: BLOCKS release (V1-14.5 gap 4); production risk high.

**P0-4 - Production composition completeness.**
- Determination: CONFIRMED PRESENT - PARTIALLY WIRED (declared stubs remain).
- Source: `src/http/composition.ts` `createPgAffiliationHttpServer` wires 12 dependencies against PostgreSQL-backed, RLS-enforced stores.
- Symbol: `createPgAffiliationHttpServer`; declared stubs = Noop outbox publisher, in-memory evidence store default, edge identity resolution that is not JWT/token validation.
- Test evidence: composition is present and centralized (P0 revalidation item satisfied, V1-11.4); the stubbed paths are not production-wired.
- Evidence rating: E3.
- Finding: no negative finding for presence; the stubs are FND-030 (outbox) and FND-025 (evidence transport).
- Qualification decision: QD-027 (CAP-027 RETAIN).
- Release impact: composition itself not blocking; its stubs are (V1-14.5 gaps 4, 8).

**P0-5 - Composite tenant-parent FK integrity.**
- Determination: CONFIRMED - BOUNDED BY DESIGN (registered trade-off, not a defect).
- Source: `db/migrations` (11 ordered migrations); organization parent links and facility-to-organization links rely on RLS-scoped `tenant_id` plus application/guard logic, not database foreign keys; the participant registry declares a composite `tenant_id + participant_id` reference.
- Symbol/migrations: cross-schema parent references (org/facility) not FK-enforced; participant composite reference present.
- Test evidence: no DB-level referential-integrity proof (DB suites not executed).
- Evidence rating: E3 (migrations).
- Finding: CON-011 (resolved by design authority).
- Qualification decision: QD-021 / QD-027.
- Release impact: BOUNDED / accepted single-isolation-mechanism trade-off; not release-blocking, carried into Package 4 as a data-integrity constraint.

**P0-6 - Affiliation aggregate and CRUD completeness.**
- Determination: CONFIRMED DEFECT.
- Source: `src/domains/affiliation` store is READ-only (fact readers for guards; no create/update); the only affiliation write endpoint is `POST /v1/affiliation/applications/:id/transitions/:action`, which assumes a draft already exists; there is no create/bootstrap endpoint.
- Symbol: read-only affiliation store; `AffiliationApplicationCommands` transition verbs only.
- Test evidence: end-to-end flow cannot complete through the HTTP surface (V1-11.5).
- Evidence rating: E3.
- Finding: FND-026.
- Qualification decision: QD-026 (CAP-026 ADAPT).
- Release impact: BLOCKS release (V1-14.5 gap 1); production risk high.

**P0-7 - Versioned requirements and seasonal policy.**
- Determination: CONFIRMED DEFECT (partial / hardcoded assumption).
- Source: season currency is a single `is_current` boolean; required-field and required-document rules are fixed guard logic; `AFFILIATION_FEES_PAID` is checked at approve time and is NOT re-checked at activation.
- Symbol: `SEASON_IS_CURRENT`, `AFFILIATION_REQUIRED_FIELDS_COMPLETE`, `AFFILIATION_REQUIRED_DOCS_PRESENT`, `AFFILIATION_FEES_PAID` guards; no versioned requirement set.
- Test evidence: guard unit tests pass against fixed logic; no versioned-ruleset test.
- Evidence rating: E3.
- Finding: FND-031.
- Qualification decision: QD-026 (CAP-026 ADAPT).
- Release impact: BLOCKS release (V1-14.5 gap 6); production risk medium.

**P0-8 - Return-for-information and resubmission.**
- Determination: CONFIRMED DEFECT (transition absent).
- Source: `src/governance/store/affiliationSeed.ts` seeds only approve/reject out of review; there is no `under_review -> (draft | more_information)` transition and no resubmission loop. The superseded Base44 `Application` entity carries a `more_info_needed` status (EV-022) the House lacks.
- Symbol: seeded transition set; missing return-for-information trigger.
- Test evidence: none; transition not modeled.
- Evidence rating: E3.
- Finding: FND-027.
- Qualification decision: QD-026 (CAP-026 ADAPT).
- Release impact: BLOCKS release (V1-14.5 gap 5); production risk medium.

**P0-9 - Atomic exactly-once organization activation.**
- Determination: SEPARATELY ASSESSED - see V1-C.8. Approved-transition execution is proven-in-source and idempotent; authoritative organization activation is MODELED_OR_PARTIAL - UNPROVEN.
- Source: `src/governance/kernel/GovernanceKernel.ts` `executeApprovedTransitionRequest`; `src/governance/store/affiliationSeed.ts` `activate` (approved -> active, low risk, guard `SEASON_IS_CURRENT`); `src/domains/organization-registry/OrganizationTypes.ts` (registry is reference-only and "never activates an organization as a substitute for a kernel-approved transition").
- Symbol: `executeApprovedTransitionRequest` (idempotent replay, request/entity locks, state-drift fail-closed); no organization-state activation handler.
- Test evidence: unit tests cover approved-execution shape; no rung-7 PostgreSQL proof.
- Evidence rating: E3 (approved execution, code); UNPROVEN for organization activation.
- Finding: FND-028 (governed DB behaviour unproven).
- Qualification decision: QD-024 (CAP-024 RETAIN).
- Release impact: exactly-once approved execution retained; authoritative organization activation not demonstrated and not authorized - deferred to later design.

**P0-10 - Fail-closed production configuration.**
- Determination: IMPLEMENTED IN SOURCE - PRODUCTION PROOF ABSENT.
- Source: `src/config` and `src/secrets` (fail-closed configuration and secret providers).
- Symbol: `loadConfigFromSecretProvider`, `SecretProviderFactory`, `EnvSecretProvider`, `secretNames`.
- Test evidence: `loadConfigFromSecretProvider.test.ts`, `SecretProviderFactory.test.ts`, `EnvSecretProvider.test.ts`, `evidence-quarantine-config.test.ts` pass (V1-C.9 run).
- Evidence rating: E3 (source) / E2 (production).
- Finding: FND-029 (no deployed environment).
- Qualification decision: QD-029 (CAP-029 RETAIN).
- Release impact: not blocking as source; production proof requires a deployed environment (adjacent to V1-14.5 gap 8).

**P0-11 - Outbox publishing and recovery posture.**
- Determination: MECHANISM IMPLEMENTED - NOOP DEFAULT REMAINS A RELEASE RISK.
- Source: kernel enqueues the outbox row in the transition transaction; a leased worker claims rows via `FOR UPDATE SKIP LOCKED` with `locked_until` / `locked_by` and retries transient failures with true full jitter; the default publisher is Noop and the real Azure Service Bus publisher is config-gated; no Service Bus sessions in v1.
- Symbol: outbox claim/lease worker; full-jitter backoff `cap = min(maxDelayMs, baseDelayMs * 2^attempt); delay = random int in [0, cap]`; Noop default publisher.
- Test evidence: `tests/unit/outbox/backoff.test.ts` passes; no broker delivery observed; DB claim/lease suites are DB-gated and were not executed.
- Evidence rating: E3 (code).
- Finding: FND-030.
- Qualification decision: QD-020 (CAP-020 RETAIN).
- Release impact: BLOCKS production delivery until a real publisher is defaulted (V1-14.5 gap 8); production risk medium.

**P0-12 - PostgreSQL-equivalent testing.**
- Determination: NOT PROVEN.
- Source: `tests/integration` (16 files, 333 cases) is DB-gated (`RUN_DB_TESTS=1`) and skipped by default; no PostgreSQL instance was exercised in this assessment.
- Symbol/migrations: integration suites covering kernel/RLS/outbox against a real database.
- Test evidence: integration suites NOT executed; no control reaches ladder rung 7.
- Evidence rating: E1 (existence only; not executed).
- Finding: FND-028.
- Qualification decision: constraint; no positive disposition (recorded, not authorized).
- Release impact: BLOCKS release-readiness proof (V1-14.5 gap 7); production risk high.

**P0-13 - Composition-root and deployment-path testing.**
- Determination: EXPLICITLY DISPOSITIONED - source-level only; no deployed proof.
- Source: `src/http/composition.ts` (composition root present); `src/deployment/*` and `scripts/validate-*` deployment/qualification validators; no deployed environment.
- Symbol: `createPgAffiliationHttpServer`; deployment baseline validators (container, migration, supply-chain, provenance, smoke, release-runbook, registry validators).
- Test evidence: deployment validators are source/config-level checks; no runtime deployment was exercised.
- Evidence rating: E2.
- Finding: FND-029.
- Qualification decision: QD-030 (CAP-030 RETAIN); operational proof DEFERRED with FND-029.
- Release impact: blocks the production claim until an environment is deployed (V1-14.5 gap 8).

**P0-14 - Secret/environment configuration used by entry points.**
- Determination: EXPLICITLY DISPOSITIONED - source-proven; production proof pending.
- Source: `src/config` (`loadConfigFromSecretProvider`) and `src/secrets` (`SecretProviderFactory`, `secretNames`) consumed by entry points under `scripts/` and `src/server`.
- Symbol: secret-name catalog and provider factory used by the API/worker entry points.
- Test evidence: secret-provider and config-loader unit tests pass (V1-C.9 run); no deployed secret-store integration exercised.
- Evidence rating: E3 (source) / E2 (production).
- Finding: FND-029.
- Qualification decision: QD-029 (CAP-029 RETAIN).
- Release impact: source proven; production proof requires a deployed environment (adjacent to V1-14.5 gap 8).

All fourteen items are dispositioned above. None is authorized for remediation;
every referenced qualification decision carries `authorizes_implementation: false`
(REG-106). The matrix confirms, and does not weaken, the Package 3 determinations:
production readiness NOT ESTABLISHED and affiliation NOT READY.

## V1-C.8 Approved-transition execution is not authoritative organization activation (amendment v1.1.0)

This section is normative (added by DEC-V1-020; amends V1-C). Package 3 records an
exactly-once **approved-transition execution** capability (CAP-024; QD-024). That
capability must not be read as proof of exactly-once **authoritative organization
activation**. The two are assessed separately against seven criteria:

1. **Exists as a concrete execution handler?** Partially. A generic approved-execution
   handler exists - `executeApprovedTransitionRequest`
   (`src/governance/kernel/GovernanceKernel.ts`), applied by
   `ApprovedWorkflowExecutionService`. There is **no** organization-activation
   handler; the affiliation `activate` transition (approved -> active) moves the
   affiliation-application entity state only.
2. **Performs an authoritative organization-state mutation?** No. The Organization
   Registry is reference/structure only and, by its own source contract
   (`src/domains/organization-registry/OrganizationTypes.ts`), "never activates an
   organization as a substitute for a kernel-approved transition, never mutates
   governance.entity_state." No organization record is authoritatively activated.
3. **Idempotent?** Yes for the approved transition (idempotent replay, request/entity
   locks, state-drift fail-closed) - but this governs the affiliation entity
   transition, not an organization mutation that does not exist.
4. **Occurs in the same transactional boundary as the decision?** The approval decision
   and its later execution are deliberately separate steps (approval creates a
   `transition_request` without mutation; execution applies it later). Within the
   execution, state update, journal, audit, evidence, and outbox enqueue are one
   transaction; the approval and the execution are not the same transaction by design.
5. **Writes an outbox event?** Yes - the executed transition enqueues an
   `outbox_message` in the same transaction.
6. **Prevents duplicate activation?** For the affiliation transition, idempotency and
   state-drift fail-closed prevent duplicate application. No organization-level unique
   activation constraint is proven, because no organization activation is performed.
7. **Has PostgreSQL integration proof?** No. The DB-gated integration suites were not
   executed (FND-028); no control reaches ladder rung 7.

**Determination:** authoritative organization activation is `MODELED_OR_PARTIAL -
UNPROVEN`. What exists and is retained is exactly-once approved execution of a
governed affiliation transition; an authoritative, duplicate-proof,
integration-proven organization activation is not demonstrated and is not
authorized. Design of organization activation is carried forward, not claimed.

## V1-C.9 Unit-test execution evidence (amendment v1.1.0)

This section is normative (added by DEC-V1-020; amends V1-C). The Package 3 record
distinguishes test **discovery** from test **execution** and does not convert one
into the other.

- Unit-test inventory: DISCOVERED - 99 unit-test files (V1-13; SRC-013).
- Package 3 execution: RERUN and PASSING. Command `npm run test:unit` was executed
  on 2026-07-25 on the runtime tree (last-change commit de6312f8) and reported
  **Test Files 99 passed (99); Tests 1300 passed (1300)** in 5.51s, with zero
  failures.
- Scope and limits: this is a hermetic unit run. It does **not** exercise
  PostgreSQL; the 16 DB-gated integration suites (333 cases, `RUN_DB_TESTS=1`)
  remain skipped and unproven (FND-028), and no control reaches ladder rung 7.
- Evidence rating: E3 for the executed unit behaviour; the governed database
  behaviour it does not touch remains E1/unproven.

This execution evidence corrects the earlier reliance on inventory counts alone and
does not alter the Gate V1-G3 disposition or the production-readiness and
affiliation-readiness determinations.
