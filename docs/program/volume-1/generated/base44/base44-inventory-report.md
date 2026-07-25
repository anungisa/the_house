# Base44 Inventory Report (NON-AUTHORITATIVE)

> Generated deterministically by `docs/program/volume-1/controls/inventory-base44.mjs`.
> This report is an EVIDENCE INPUT to Volume 1 Package 2 qualification. It is not a
> qualification decision and confers no production authority on any Base44 artifact.

## Assessed source

- Source ID: `SRC-001`
- Source label: Base44 current declared export (7)
- Archive: `curl-link-hub (7).zip`
- SHA-256: `50d94c56a40caf853bffa3ede8183a9b424dd2874ceccd5fa8cc1247ca1d0412`
- Size: 3336492 bytes
- Extraction: `legacy/curl-link-hub-7-extracted`
- Application: TheHouse v2
- Framework: Base44 low-code (React 18 + Vite + Tailwind + Radix/shadcn; Deno serverless functions)

## Inventory totals

| Artifact | Count |
| --- | --- |
| total_files_excl_node_modules | 1576 |
| entities | 95 |
| functions | 101 |
| agents | 1 |
| pages_jsx | 151 |
| components_jsx | 604 |
| lib_files | 198 |
| governance_md_docs | 288 |
| routes (App.jsx) | 155 |

## Route guard distribution

| Guard | Routes |
| --- | --- |
| none | 46 |
| FeatureGate | 3 |
| ProtectedRoute | 23 |
| RoleGate | 83 |

## Server-function enforcement posture

- Functions: 101 (HTTP handlers: 99)
- Reference a permission check: 2 (2%)
- Mutate entities: 68
- Mutate entities WITHOUT a permission check: 68
- Use service-role escalation: 80

## Access-matrix drift

- Matrix entries: 132
- Declared role keys: 23
- Routes missing from matrix: 23
- Matrix entries without a route: 4
- Route/matrix role drift: 83
- Unknown path defaults open: true

## Automated tests & CI

- Test directories: []
- Test files (*.test/*.spec): 0
- CI configuration: []
- Runnable test script: false (none)

## Candidate capability domains (search domains, not conclusions)

| Domain | Routes | Entities | Functions | Pages |
| --- | --- | --- | --- | --- |
| unclassified | 50 | 52 | 55 | 57 |
| event_operations | 19 | 8 | 6 | 15 |
| organization_registry | 15 | 5 | 10 | 8 |
| governance_administration | 12 | 7 | 8 | 11 |
| national_operations | 16 | 3 | 1 | 17 |
| analytics | 16 | 0 | 3 | 18 |
| payments | 11 | 4 | 5 | 10 |
| compliance | 7 | 7 | 2 | 7 |
| membership | 8 | 3 | 9 | 9 |
| participant_identity | 5 | 4 | 0 | 5 |
| knowledge | 5 | 2 | 3 | 5 |
| club_affiliation | 3 | 2 | 1 | 3 |
| registration | 3 | 1 | 0 | 3 |
| support | 2 | 1 | 1 | 2 |
| club_360 | 2 | 0 | 0 | 2 |

## Integrations & localization

- Dependencies: 65 (dev: 17); Radix UI packages: 27
- Stripe payments: true; Base44 SDK: true
- Localization: 5 i18n files; Homegrown i18n (src/lib/i18n/useTranslation.js); not a standard i18n library

## Automated observations

- **OBS-COUNT-ROUTES** (inventory): App.jsx declares 155 routes across guard types {"none":46,"FeatureGate":3,"ProtectedRoute":23,"RoleGate":83}.
- **OBS-COUNT-ENTITIES** (inventory): 95 entity schemas; 93 declare an app-layer rls block; 53 declare a status enum.
- **OBS-COUNT-FUNCTIONS** (inventory): 101 server functions; 99 are Deno.serve handlers.
- **OBS-BACKEND-ENFORCEMENT** (production_risk): Only 2 of 101 server functions reference any permission check, yet 68 functions mutate entities with no server-side permission check. Frontend guards are UX-only.
- **OBS-SERVICE-ROLE** (production_risk): 80 functions use asServiceRole (privilege escalation), amplifying the impact of missing server-side authorization.
- **OBS-ACCESS-DRIFT** (production_risk): 23 routes have no access-matrix entry; unknown_path_defaults_open=true. Access can drift from the declared single-source-of-truth matrix.
- **OBS-DUAL-ROLE-VOCAB** (production_risk): Dual role vocabulary present (fine keys + coarse buckets); 23 distinct role tokens are hardcoded directly in App.jsx routes despite the doctrine that roles live only in accessMatrix.js.
- **OBS-PAYMENTS** (product_value): Stripe integration present (true); a payments/fees capability was explored.
- **OBS-LOCALIZATION** (unknown): Localization is a homegrown i18n (5 files) with an admin Translations page (true); completeness and bilingual coverage require evidence.
- **OBS-TEST-CI** (production_risk): Automated tests detected: false (test files: 0, test dirs: []); CI config detected: false ([]); runnable test script: false.
- **OBS-DOC-VOLUME** (unknown): 288 governance-style markdown documents are present in src/. Volume of documentation is not evidence of implemented or validated behaviour.

