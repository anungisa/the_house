# Base44 Inventory Report (NON-AUTHORITATIVE)

> Generated deterministically by `docs/program/volume-1/controls/inventory-base44.mjs`.
> This report is an EVIDENCE INPUT to Volume 1 Package 2 qualification. It is not a
> qualification decision and confers no production authority on any Base44 artifact.

## Assessed source

- Archive: `curl-link-hub (5).zip`
- SHA-256: `a627d60e8aeebd7a47099af4681eb8427da0ba2647da1ab8f537712394850c95`
- Size: 3046971 bytes
- Application: TheHouse v2
- Framework: Base44 low-code (React 18 + Vite + Tailwind + Radix/shadcn; Deno serverless functions)

## Inventory totals

| Artifact | Count |
| --- | --- |
| total_files_excl_node_modules | 1485 |
| entities | 87 |
| functions | 99 |
| agents | 1 |
| pages_jsx | 144 |
| components_jsx | 589 |
| lib_files | 196 |
| governance_md_docs | 231 |
| routes (App.jsx) | 148 |

## Route guard distribution

| Guard | Routes |
| --- | --- |
| none | 45 |
| FeatureGate | 3 |
| ProtectedRoute | 18 |
| RoleGate | 82 |

## Server-function enforcement posture

- Functions: 99 (HTTP handlers: 97)
- Reference a permission check: 2 (2%)
- Mutate entities: 66
- Mutate entities WITHOUT a permission check: 66
- Use service-role escalation: 78

## Access-matrix drift

- Matrix entries: 130
- Declared role keys: 23
- Routes missing from matrix: 18
- Matrix entries without a route: 4
- Route/matrix role drift: 82
- Unknown path defaults open: true

## Candidate capability domains (search domains, not conclusions)

| Domain | Routes | Entities | Functions | Pages |
| --- | --- | --- | --- | --- |
| unclassified | 44 | 44 | 53 | 51 |
| event_operations | 19 | 8 | 6 | 15 |
| organization_registry | 15 | 5 | 10 | 8 |
| governance_administration | 12 | 7 | 8 | 11 |
| national_operations | 15 | 3 | 1 | 16 |
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

- **OBS-COUNT-ROUTES** (inventory): App.jsx declares 148 routes across guard types {"none":45,"FeatureGate":3,"ProtectedRoute":18,"RoleGate":82}.
- **OBS-COUNT-ENTITIES** (inventory): 87 entity schemas; 85 declare an app-layer rls block; 49 declare a status enum.
- **OBS-COUNT-FUNCTIONS** (inventory): 99 server functions; 97 are Deno.serve handlers.
- **OBS-BACKEND-ENFORCEMENT** (production_risk): Only 2 of 99 server functions reference any permission check, yet 66 functions mutate entities with no server-side permission check. Frontend guards are UX-only.
- **OBS-SERVICE-ROLE** (production_risk): 78 functions use asServiceRole (privilege escalation), amplifying the impact of missing server-side authorization.
- **OBS-ACCESS-DRIFT** (production_risk): 18 routes have no access-matrix entry; unknown_path_defaults_open=true. Access can drift from the declared single-source-of-truth matrix.
- **OBS-DUAL-ROLE-VOCAB** (production_risk): Dual role vocabulary present (fine keys + coarse buckets); 23 distinct role tokens are hardcoded directly in App.jsx routes despite the doctrine that roles live only in accessMatrix.js.
- **OBS-PAYMENTS** (product_value): Stripe integration present (true); a payments/fees capability was explored.
- **OBS-LOCALIZATION** (unknown): Localization is a homegrown i18n (5 files) with an admin Translations page (true); completeness and bilingual coverage require evidence.
- **OBS-TEST-CI** (production_risk): No test suite or CI configuration detected in the export (test/CI absence).
- **OBS-DOC-VOLUME** (unknown): 231 governance-style markdown documents are present in src/. Volume of documentation is not evidence of implemented or validated behaviour.

