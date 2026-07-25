# V1-10 - The House Source Baseline and Implementation Inventory

Document ID: V1-10  
Title: The House Source Baseline and Implementation Inventory  
Status: RATIFIED  
Version: 1.0.0  
Ratification: Package 3 baseline; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at the material-commitment gate (see V1-C, REG-108 APP-V1-016)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G3)  
Supersedes: None  
Review Cycle: Frozen at Package 3 closure; changes require the recorded amendment process  
Repository Path: docs/program/volume-1/

## V1-10.1 Purpose

This section is normative.

This chapter establishes the cryptographic source baseline for The House v2
(SRC-002) and the reproducible current-state implementation inventory that all
Package 3 qualification claims rest on. It qualifies The House as the
**production-candidate implementation** without treating its stronger engineering
discipline as proof of production readiness. Where a claim is demonstrated by
committed source, migrations, or executable tests it is recorded as such; where a
claim depends on a running environment or a database-backed test that was not
executed, it is recorded as unproven.

## V1-10.2 Source baseline and fingerprint

This section is normative.

The House baseline is fixed for Package 3 by an immutable repository/runtime
fingerprint recorded in REG-101 SRC-002 and generated deterministically by
`npm run qualification:house` (EV-023;
`generated/house/source-manifest.json`):

- **Assessed repository commit:** `51795ca9a702328766a80660d641f820dfc4d976` on
  branch `docs/volume-1-house-qualification`
  (`https://github.com/ccacurling/the_house.git`).
- **Runtime-tree last-change commit (application runtime only):**
  `de6312f89f86ce5ae7bca5babbe165fdcf4f2861` (2026-07-01), derived by
  `git log -1 --format=%H -- src db/migrations`. **Every commit after this one,
  through the assessed commit, is Volume-1 documentation-program work and does
  not change the assessed runtime.** This runtime-vs-documentation distinction is
  a normative control: the qualification assesses the runtime at `de6312f8`, not
  the documentation authored around it.
- **Source tree digest:**
  `87b32f615be88300c039f6e711c5952a6f2ed5a8bc0b93e136b2a4d03e3aac5c` over 184
  TypeScript files.
- **Migration digest:**
  `884e0b2b905358016caf3e6b0a8351fcb39b0c8d33c1ea5921160575c570fa65` over 11
  ordered SQL migrations.
- **Manifest digests:** `package.json`
  `d55f0ea467f8ec2cb1cbcb651eacf3debb2f6ff2b5a4ce9913d27b9e6c7cd6a6`;
  `package-lock.json`
  `10b0091ac4b707c25067620b460bee55177b604e6c631fa63cfe27a9b6c67d87`.

The tree digests are computed over sorted `relpath:sha256` lines and are
independent of documentation changes elsewhere in the repository. The fingerprint
prevents a later House commit from silently replacing the assessed baseline under
the same source id, exactly as the Package 2 correction (V1-05.0) hardened the
Base44 baseline.

## V1-10.3 Controlled sub-corpora

This section is normative.

The material internal sub-corpora of SRC-002 are registered (REG-101
SRC-010..SRC-015) so that each evidence class carries its own honest rating:

- **SRC-010** House database and migration corpus (`db/migrations`) - E3.
- **SRC-011** House governance kernel, guards, and workflow corpus
  (`src/governance`) - E3.
- **SRC-012** House domain, HTTP, and composition-root corpus (`src/domains`,
  `src/http`) - E3.
- **SRC-013** House automated test estate (`tests/`) - E3 for existence; a
  passing result is a separate, conditional claim (V1-13).
- **SRC-014** House operational, deployment, and configuration corpus
  (`src/config`, `src/secrets`, `src/observability`, `src/deployment`,
  `infra/azure`, `.github/workflows`) - E2 (source only; no deployed
  environment).
- **SRC-015** House architecture and design-intent narrative corpus (docs,
  ADRs, READMEs, doc comments) - E1 (stakeholder statement, not demonstrated
  behaviour).

## V1-10.4 Reproducible implementation inventory

This section is normative.

The inventory is regenerated mechanically by `npm run qualification:house` into
`generated/house/` (14 JSON inventories plus a markdown report). The current-state
counts are:

- **Database (SRC-010; EV-024):** 5 schemas (`affiliation`, `facility_registry`,
  `governance`, `organization_registry`, `participant_registry`); 26 tables (17
  in the governance schema); **20 tables with row-level security ENABLED and
  FORCED**; 55 policies; 7 functions; 9 `SECURITY DEFINER` blocks (outbox-worker
  functions, migration 0004); 11 ordered migrations.
- **Governed lifecycle (SRC-011; EV-027):** 10 states and 12 transitions for the
  AffiliationApplication state machine; 6 seeded guard codes mapping exactly to 6
  implemented guard handlers.
- **HTTP surface (SRC-012; EV-030):** 28 distinct `/v1/` route paths across 7
  adapter groups (affiliation 2, evidence 5, organizations 7, participants 5,
  facilities 5, workflows 4); a single production composition root wiring 12
  dependencies.
- **Test estate (SRC-013; EV-032):** 99 unit test files (1,326 cases) and 16
  integration test files (333 cases).
- **Operations (SRC-014; EV-033):** 11 deployment baseline validators, 6 CI
  workflows, an Azure Bicep skeleton (main + 7 modules), fail-closed
  configuration, and env / Azure Key Vault secret providers.

## V1-10.5 Global-policy tables are not an RLS gap

This section is normative.

Six governance tables (`guard_definition`, `policy_version`, `state_machine`,
`state_node`, `transition_definition`, `transition_guard`) are `tenant_id`-nullable
global configuration and are intentionally **not** forced-RLS. They hold the
shared state-machine and guard catalog, not tenant-owned data. This is a design
posture, not an isolation gap, and is recorded so the 20-of-26 forced-RLS count is
not misread as a deficiency.

## V1-10.6 What this baseline does and does not establish

This section is normative.

The baseline establishes **structural implementation truth** at E3: the schema,
migrations, kernel algorithm, guard registry, HTTP surface, composition root, and
subsystem code exist as fingerprinted, reproducible artifacts. It does **not**
establish runtime, database-backed, or deployment behaviour: no House environment
is provisioned (FND-029) and all 16 database integration suites are skipped by the
default hermetic run (FND-028). Structural value is credited; production readiness
is deferred to V1-13 and adjudicated at Gate V1-G3.
