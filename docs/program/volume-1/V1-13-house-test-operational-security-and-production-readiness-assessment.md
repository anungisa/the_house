# V1-13 - The House Test, Operational, Security, and Production-Readiness Assessment

Document ID: V1-13  
Title: The House Test, Operational, Security, and Production-Readiness Assessment  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-C, REG-108 APP-V1-019)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G3)  
Supersedes: None  
Review Cycle: Frozen at Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-13.1 Purpose

This section is normative.

This chapter assesses whether The House is production-ready, separately from
whether it has production value. It applies a strict discipline: a passing unit
suite must not be represented as production readiness, and a skipped test must not
be represented as a passing test. Test evidence is separated into what was
**discovered**, **selected**, **skipped**, **infrastructure-dependent**,
**executed**, **passing**, and **unproven**.

## V1-13.2 Test estate - discovered, selected, skipped

This section is normative.

The estate is inventoried mechanically (SRC-013; EV-032;
`generated/house/test-inventory.json`):

- **Discovered:** 99 unit test files (1,326 cases) and 16 integration test files
  (333 cases).
- **Selected by default (`npm test`, hermetic):** the 99 unit suites. These
  exercise logic with test doubles, not the kernel against a real database.
- **Skipped by default:** **all 16 integration suites (333 cases).** Every one is
  gated on `RUN_DB_TESTS=1` and requires a live PostgreSQL instance; the default
  run disables the database path and skips them. `vitest.config` serializes file
  execution only under `RUN_DB_TESTS=1` to keep the shared-database suites
  deterministic.
- **Infrastructure-dependent:** the integration suites require a provisioned
  PostgreSQL with the migrations applied.
- **Executed under this assessment:** none were executed by the assessor; no live
  database was provisioned.
- **Passing:** the default hermetic unit run is the only evidence available, and
  it proves unit-level logic only.
- **Unproven:** governed database behaviour - RLS enforcement, constraint-backed
  idempotency, kernel transitions against real state, outbox claim/lease
  concurrency - is **UNPROVEN** under this assessment (FND-028, constraint).

The consequence is decisive for the qualification: the kernel's most important
guarantees (V1-12.2) sit at ladder rung 6 in source but never reach rung 7 in
evidence.

## V1-13.3 Operational and deployment readiness - source present, runtime
unproven

This section is normative.

Operational controls exist as source (SRC-014; EV-033): configuration fails closed
(it throws when `DATABASE_URL` is missing in production-like environments and at
API start); secret retrieval supports environment and Azure Key Vault providers;
telemetry has console/in-memory/noop exporters; there are 11 deployment baseline
validators, 6 CI workflows, and an Azure Bicep skeleton (main + 7 modules with
example parameters).

But **no House environment is deployed.** There is no evidence of a provisioned,
running instance; runtime, database, deployment, and operational behaviour are not
observed (FND-029, production risk high). The deployment validators verify
baselines, not a live environment (CAP-030, RETAIN, QD-030). Fail-closed
configuration and secret providers are retained on source evidence (CAP-029, E2,
QD-029) but their runtime behaviour is unproven.

## V1-13.4 Security posture

This section is normative.

The House security posture is materially stronger than the Base44 prototype
assessed in V1-08: forced RLS on 20 of 26 tables (EV-024), fail-closed transition,
guard, and permission resolution (EV-025), a fail-closed edge action catalog, and
malware scanning with quarantine for evidence (EV-029). The decisive security gap
is not a missing control but an **under-scoped** one: governed affiliation
authority is role-based, not resource-aware (FND-023), and reviewer routing is
absent (FND-024), so authority cannot be constrained to the correct jurisdiction or
applicant. Edge identity resolution is not yet token/JWT validation. These are the
security-relevant items that must be closed before an affiliation release.

## V1-13.5 Production value versus production readiness

This section is normative.

The two must not be conflated:

- **Production value (demonstrated, E3):** the Governance Kernel, forced-RLS
  tenancy, transactional outbox, named guard registry, idempotency, evidence/audit
  subsystems, and reference registries are real, reproducible implementation truth
  (FND-032; RETAIN/ADOPT dispositions in REG-106). This is why The House is the
  production candidate.
- **Production readiness (not established):** no control reaches integration-test
  proof (rung 7; FND-028), no environment is deployed (FND-029), outbox delivery
  defaults to Noop (FND-030), and the affiliation flow cannot complete end-to-end
  through the HTTP surface (FND-026). The House is **not** demonstrated to be
  production-ready.

## V1-13.6 Determination

This section is normative.

**Production-readiness determination:** NOT ESTABLISHED. The House has strong,
reproducible production value but its runtime, database-backed, and deployment
behaviour is unproven, and several release-blocking gaps are confirmed. A passing
unit suite is not production readiness. Before any affiliation release, the
DB-gated integration suites must be executed against production-equivalent
PostgreSQL, a real outbox publisher must be proven against a broker, and the
release-blocking affiliation gaps (V1-14) must be closed - none of which is
authorized in Package 3.
