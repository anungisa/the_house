# The Button — Affiliation frontend (`apps/button`)

The representative-facing experience for club-affiliation, built over The House governed backend.
This is a **standalone npm package** (its own `package.json`, lockfile, TypeScript, Vite, Vitest,
Playwright, and ESLint config) so the backend build/typecheck/lint stay hermetic. The root
`tsconfig`/`eslint` deliberately do **not** include `apps/**`.

## What this app is (and is not)

- It is a thin, representative-safe consumer of the governed `GET /v1/button/context` endpoint.
- It never asserts authority, capabilities, or accessible organizations — every access decision is
  **server-derived** and re-authorized server-side. The browser is a consumer only.
- It is **not** a parallel source of truth and performs no governed writes.

## Stack

React + TypeScript + Vite, React Router, TanStack Query, Testing Library + Vitest + jest-axe
(component/route/a11y tests), Playwright (browser e2e). The API client is injectable; a mock
transport (`VITE_BUTTON_MOCK=1`) serves deterministic synthetic data for offline dev and e2e.

## Commands

```bash
npm install          # from apps/button
npm run dev          # dev server (proxies /v1 to the House API; set BUTTON_API_TARGET)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest (component/route/a11y)
npm run build        # typecheck + vite build
npm run e2e          # Playwright (uses the mock transport; no backend needed)
```

## Routes

`/button` (home) · `/button/select-context` · `/button/affiliation` (guarded) ·
`/button/access-denied` · `/button/authority-expired` · `/button/service-unavailable`

## Known gaps (Slice B)

- Representative authority + validity come from the default role-derived provider on the server
  (a real authorization-service-backed provider is a later slice).
- Seasons and jurisdiction are policy-derived server stubs.
- The affiliation landing is a representative-safe overview; requirements/responses/evidence arrive
  in Slice C.
