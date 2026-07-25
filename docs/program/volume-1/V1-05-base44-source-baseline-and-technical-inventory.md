# V1-05 - Base44 Source Baseline and Technical Inventory

Document ID: V1-05  
Title: Base44 Source Baseline and Technical Inventory  
Status: RATIFIED  
Version: 1.1.0  
Ratification: Package 2 baseline, amended v1.1.0; basis Accountable Program Authority (Aubert Nungisa); evidence SELF-ATTESTED / AUTHOR-VERIFIED; independent validation not claimed; executive acceptance pending at applicable gate (see V1-B, REG-108 APP-V1-008; amendment REG-107 DEC-V1-011)  
Classification: Internal - Program Governance  
Owner: Aubert Nungisa (Accountable Program Authority)  
Approver: Nolan (Executive Acceptance Authority)  
Effective Date: TBD (Gate V1-G2)  
Supersedes: None  
Review Cycle: Frozen at Package 2 closure; changes require the recorded amendment process (this chapter amended to v1.1.0 under that process, DEC-V1-011)  
Repository Path: docs/program/volume-1/

## V1-05.0 Amendment record (v1.1.0) - source-baseline correction

This section is normative.

This chapter was originally ratified at v1.0.0 against the export archive
`curl-link-hub (5).zip`. After Package 2 closure it was found that the program's
declared current Base44 export is `curl-link-hub (7).zip`, not `(5)`. The original
assessment methodology, sub-source decomposition, analyzers, and registers are
sound and are retained; only the assessed baseline artifact was wrong. Under the
governed amendment process (REG-107 DEC-V1-011) the source baseline is corrected
as follows, without discarding the historical `(5)` assessment:

- **SRC-001 (current declared export)** now fixes `curl-link-hub (7).zip`,
  SHA-256 `50d94c56a40caf853bffa3ede8183a9b424dd2874ceccd5fa8cc1247ca1d0412`,
  3,336,492 bytes, 1,576 archive entries yielding 1,576 extracted files
  (reproducible), extracted to `legacy/curl-link-hub-7-extracted/`; known
  generation on or about 2025-07-25. SRC-004..008 are re-pointed to the `(7)`
  extraction.
- **SRC-009 (historical export, superseded)** preserves the original `(5)`
  baseline immutably: `curl-link-hub (5).zip`, SHA-256
  `a627d60e8aeebd7a47099af4681eb8427da0ba2647da1ab8f537712394850c95`,
  3,046,971 bytes, 1,485 files. The `(5)` fingerprint and counts recorded in
  V1-05.2..V1-05.5 below are retained as the historical baseline and are read as
  SRC-009, not SRC-001.

**Corrected current-state counts (SRC-001 = export 7), reproducible via
`npm run qualification:base44 -- --source-id SRC-001`:** 1,576 files; 95 entities
(93 with app-layer `rls`, 53 with a status enum); 101 server functions (99
`Deno.serve` handlers; 2 of 101 reference a permission check; 68 of 101 mutate
without a check; 80 of 101 use `asServiceRole`); 155 declared routes (guards:
none 46, RoleGate 83, ProtectedRoute 23, FeatureGate 3); 132 access-matrix
entries; 23 routes with no matrix entry; unknown paths still default open; 151
page components; 604 other components; 288 governance-style markdown documents;
198 library files; 1 agent. Dependencies (65/17 dev, Stripe present) and
localization (5 i18n files) are unchanged from `(5)`. Automated tests and CI
remain absent.

**Delta (5) -> (7) [`generated/base44/delta-5-to-7.json`, deterministic]:** the
change is strictly **additive** - zero routes, entities, or functions were
removed. Routes +7, entities +8, functions +2. The additions are two capability
domains that the original `(5)` assessment never saw: an **IEBOK** body-of-
knowledge module (entities IEBOKArtifact, IEBOKGlossaryTerm, IEBOKMechanic,
IEBOKProposal, IEBOKRelationship, IEBOKWorkingGroup; `/iebok/*` routes and pages)
and a **Jobs board** (entities JobPosting, SavedJob; `/jobs`, `/jobs/review`;
functions expireJobPostings, notifyJobStatus). These are recorded as new findings
FND-021 and FND-022 and new capabilities CAP-017 and CAP-018, both DEFER. Every
security-relevant finding from the `(5)` assessment is CONFIRMED_IN_CURRENT (and
marginally worse in absolute counts); none was resolved by the newer export.

The sections below are the original v1.0.0 text preserved as the historical
`(5)` / SRC-009 baseline; read them together with this amendment record.

## V1-05.1 Purpose

This section is normative.

This chapter establishes the cryptographic source baseline for the Base44 export
(SRC-001) and records the reproducible technical inventory extracted from it. Its
role is evidentiary: it fixes exactly which artifact was assessed, proves the
extraction is repeatable, and states the mechanical counts on which later
qualification chapters rely. It does not qualify capabilities, assign
dispositions, or authorize any implementation.

## V1-05.2 Source fingerprint

This section is normative.

The assessed artifact is a single export archive. Its identity is fixed by a
content digest so that a later Base44 export cannot silently replace the evidence
baseline while retaining the same source identifier.

- Original filename: `curl-link-hub (5).zip`
- SHA-256: `a627d60e8aeebd7a47099af4681eb8427da0ba2647da1ab8f537712394850c95`
- Size: 3,046,971 bytes
- Ingestion date: 2025-06-29
- Known generation date: on or about 2025-06-28 (self-reported by the export)
- Extraction location: `legacy/curl-link-hub-extracted/`
- Archive location: `legacy/curl-link-hub (5).zip`
- Export type: Base44 application project export (source tree, not a running system)
- Declared application name: "TheHouse v2" (as embedded in the export)
- Prior-export relationship: the `(5)` suffix indicates earlier local copies; no
  earlier export is registered as a controlled source. Only this digest is the
  baseline.
- Generated assets/dependencies: the archive lists `node_modules` entries;
  extraction and all analysis exclude `node_modules` and version-control folders.
- Inaccessible/excluded material: any Base44 platform-side runtime state,
  database contents, deployed configuration, secrets, and traffic are NOT in the
  export and are out of scope. Only source-tree artifacts are assessed.

This fingerprint is recorded in REG-101 (SRC-001) and in the generated
`source-manifest.json`.

## V1-05.3 Reproducibility

This section is normative.

The archive index lists 1,485 files. Deterministic extraction (excluding
`node_modules` and `.git`) yields 1,485 files. The counts in this chapter are
produced by self-contained analyzers under
`docs/program/volume-1/controls/` and regenerated by `npm run
qualification:base44`. The analyzers are marked NON-AUTHORITATIVE: they report
structure; they do not assert business validity. Every generated artifact carries
a `_meta` authority note to that effect.

Reproducibility is itself the evidence basis for the E3 (DEMONSTRATED) rating of
the structural counts below. Counts derived from a single indirect signal (for
example, dependency presence implying a capability) are rated no higher than E2.

## V1-05.4 Sub-source decomposition

This section is normative.

The single archive (SRC-001) is decomposed into controlled sub-sources so that
findings cite the narrowest reviewable material and so that implementation truth
is never conflated with design-intent narrative:

- SRC-004 - entity schema corpus (`base44/entities/*.jsonc`) - implementation truth
- SRC-005 - server-function corpus (`base44/functions/*/entry.ts`) - implementation truth
- SRC-006 - access-control model (`src/lib/access/`) - implementation truth
- SRC-007 - governance narrative corpus (`src/**/*.md`) - stakeholder statement
- SRC-008 - frontend route/experience corpus (`src/App.jsx`, pages, components) - implementation truth

The narrative corpus (SRC-007) is explicitly classified as stakeholder statement:
its assertions describe intended behaviour and are not, by their existence,
evidence that the behaviour is implemented or enforced.

## V1-05.5 Technical inventory (mechanical counts)

This section is normative. All counts are E3 unless noted; each is reproducible.

**Overall corpus**

- Files (excluding `node_modules`/`.git`): 1,485
- Entity schemas: 87
- Server functions: 99 (97 `Deno.serve` HTTP handlers)
- Agents: 1
- Page components (`*.jsx` under pages): 144
- Other components (`*.jsx`): 589
- Library files: 196
- Governance-style markdown documents: 231
- Declared routes (`src/App.jsx`): 148

**Entities (SRC-004)**

- 85 of 87 declare an app-layer `rls` block (Mongo-style, not a database boundary)
- 49 of 87 declare a status/state enum

**Server functions (SRC-005)**

- 2 of 99 reference any permission check
- 66 of 99 mutate entities with no server-side permission check
- 78 of 99 use `asServiceRole` (privileged execution)

**Routing and access (SRC-006, SRC-008)**

- Route guard distribution: none 45, RoleGate 82, ProtectedRoute 18, FeatureGate 3
- Access matrix entries: 130; declared role keys: 23
- Routes with no matrix entry: 18
- Matrix entries with no route: 4
- Routes whose hardcoded roles drift from the matrix: 82
- Unknown paths default to open (default-allow): true
- Dual role vocabulary (fine keys plus coarse buckets): present

**Integrations and localization (SRC-001, SRC-008)**

- Dependencies: 65 (17 dev); 27 Radix packages; Stripe present; Base44 SDK present
- Localization: homegrown i18n (`src/lib/i18n/useTranslation.js`), 5 i18n files,
  admin Translations page present. Coverage completeness is E1 (not established).

**Quality signals (SRC-001)**

- Automated test suite: absent in the export
- CI configuration: absent in the export

## V1-05.6 Interpretation limits

This section is normative.

The counts are structural measurements, not judgments. In particular:

- A high document count (231 markdown files) does not demonstrate implemented or
  enforced behaviour; the narrative is stakeholder statement (SRC-007).
- Static markers (for example, mutation and permission-check patterns) may under-
  or over-count semantically; the security-critical counts are corroborated by
  direct inspection in V1-08.
- Absence of tests in the export does not preclude ad hoc manual testing on the
  Base44 platform; it means no regression protection is present in the assessed
  artifact.

## V1-05.7 Evidence and cross-references

This section is informative.

- Source and fingerprint: REG-101 (SRC-001, SRC-004..008)
- Evidence items: REG-102 (EV-001..016)
- Generated artifacts: `docs/program/volume-1/generated/base44/`
- Extraction command: `npm run qualification:base44`

Nothing in this chapter authorizes implementation. Dispositions are recorded in
REG-106 and authorize no construction (V1-07, V1-B).
