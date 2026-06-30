# Production CI/CD baseline

This document describes the build and release **contract** for The House v2: how
the platform is validated in CI and packaged into container images, and the
shape of the (still-manual, still-disabled) production deployment path.

It is a baseline, not a live pipeline. Nothing here deploys to Azure by default,
requires repository secrets for normal validation, or contacts external systems.
Live deployment stays gated behind a manual, confirmation-guarded template until
a real registry and Azure environment are configured.

## Overview

| Concern | Artifact | Behaviour |
| --- | --- | --- |
| Continuous integration | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | Runs the full hermetic gate on PRs and pushes to `main`. No secrets, no Azure. |
| Image build validation | [.github/workflows/container-build.yml](../../.github/workflows/container-build.yml) | Builds the `api` and `worker` images on PRs. Never pushes to a registry. |
| Production deploy (template) | [.github/workflows/production-deploy-template.yml](../../.github/workflows/production-deploy-template.yml) | Manual-only, confirmation-guarded. Disabled until configured. |
| Container packaging | [Dockerfile](../../Dockerfile), [.dockerignore](../../.dockerignore) | Multi-stage, prod-deps-only, non-root, two runtime targets. |
| Static validation | `npm run container:check` | Pure checker proving the contract above stays coherent. |

> The earlier [deployment-baseline.yml](../../.github/workflows/deployment-baseline.yml)
> workflow runs the deployment validator subset. `ci.yml` supersedes it by also
> running `container:check`.

## CI gates

`ci.yml` runs the same hermetic checks developers run locally, in order:

1. `npm run typecheck`
2. `npm run lint`
3. `npm test` — hermetic; DB-gated integration tests stay skipped (`RUN_DB_TESTS` unset)
4. `npm run build`
5. `npm run deploy:check` — static deployment/IaC baseline validator
6. `npm run container:check` — static container/CI baseline validator

`npm run ci:check` runs the same sequence locally in one command.

None of these steps require secrets, a database, Service Bus, Entra/JWKS,
Key Vault, a container registry, or any network access.

## Container strategy

A single multi-stage [Dockerfile](../../Dockerfile) produces two runtime targets
from one source tree:

```sh
docker build --target api    -t the-house-api    .
docker build --target worker -t the-house-worker .
```

Stages:

- **builder** — installs all dependencies and compiles `src/` to `dist/` via
  `tsconfig.build.json` (tests and scripts are excluded from the image).
- **prod-deps** — installs production dependencies only (`npm ci --omit=dev`).
- **runtime-base** — copies production `node_modules` + compiled `dist/` only,
  then drops to the unprivileged stock `node` user. No source, tests, or secrets.
- **api** / **worker** — thin final stages selecting the runtime entrypoint.

Properties:

- Production dependencies only in the runtime layers.
- Runs as a non-root user.
- No secrets baked in: `DATABASE_URL`, `AUTH_MODE`, Service Bus, Key Vault, and
  observability settings are supplied at runtime via environment variables /
  managed identity. `.env` is never copied (and is excluded by `.dockerignore`).
- No fabricated health check and no sport-specific terminology in image metadata.

### API vs. worker split

Two distinct runtime processes are packaged as two image targets:

- **api** (`dist/src/server/api.js`, from [src/server/api.ts](../../src/server/api.ts))
  — the HTTP AffiliationApplication adapter. Exposes the API port (default 3000;
  override with `API_PORT`). Edge authentication is config-driven via `AUTH_MODE`
  (`entra_jwt` / `trusted_headers` in real deployments).
- **worker** (`dist/src/server/worker.js`, from [src/server/worker.ts](../../src/server/worker.ts))
  — the transactional outbox drain loop. No HTTP ingress. Connects with the
  dedicated SECURITY DEFINER worker role. Service Bus stays disabled unless
  `SERVICE_BUS_ENABLED=true` (no Service Bus sessions in v1).

Both entrypoints are thin shells over already-tested logic. The worker wiring is
centralised in [src/workers/outbox/composition.ts](../../src/workers/outbox/composition.ts)
and reused by both the compiled entrypoint and the local `worker:outbox` script,
so there is exactly one production-intended wiring.

## Registry placeholder

CI builds images but never pushes them. Publishing happens only via the manual
production deploy template, which uses `az acr build` against a registry named by
the `AZURE_CONTAINER_REGISTRY` environment variable. No registry name, login
server, or credential is committed.

## Manual production deploy template

[production-deploy-template.yml](../../.github/workflows/production-deploy-template.yml)
is a documented contract, intentionally inert:

- Triggers **only** on `workflow_dispatch` (never `push` / `pull_request`).
- The `deploy` job is guarded by `if: ${{ inputs.confirm == 'DEPLOY' }}`. A
  dispatch without typing the exact phrase `DEPLOY` is a no-op.
- Targets a protected GitHub `production` environment (configure required
  reviewers before enabling).
- Authenticates via OIDC (`azure/login` with `id-token: write`); no static
  credentials. All credentials are `${{ secrets.* }}` / `${{ vars.* }}`
  references — no secret values are committed.
- Steps: Azure login → `what-if` preview → `az acr build` (api + worker) →
  `az containerapp update` (api + worker).

### Required future secrets / variables

Before enabling the template, configure these on the `production` environment:

- Secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
  (federated credential for OIDC; no client secret).
- Variables: `AZURE_RESOURCE_GROUP`, `AZURE_CONTAINER_REGISTRY`,
  `AZURE_API_CONTAINER_APP`, `AZURE_WORKER_CONTAINER_APP`.

### Environment protection assumptions

The `production` environment is expected to have required reviewers and (optionally)
a deployment branch rule limiting dispatch to `main`. The confirmation input is a
second, in-workflow guard on top of environment protection.

### Rollback assumptions

Container Apps keeps prior revisions; rollback is performed by reactivating the
previous healthy revision (`az containerapp revision`) or re-dispatching the
template with the previous `image_tag`. Database migrations are forward-only and
are **not** part of this template (migration orchestration is out of scope here).

## Static validation

`npm run container:check` ([src/deployment/validateContainerBaseline.ts](../../src/deployment/validateContainerBaseline.ts))
is a pure, deterministic checker. It only reads files and asserts:

- the Dockerfile and `.dockerignore` exist;
- the Dockerfile never copies `.env` and `.dockerignore` excludes it;
- the API and worker entrypoints exist and are referenced by the build;
- the image drops to a non-root user;
- `ci.yml` runs the required gates and performs no Azure login/deploy;
- `container-build.yml` builds on PRs but never pushes by default;
- the production deploy template is manual-only and confirmation-guarded;
- no secret-like values or sport-specific terminology leak into these files;
- `package.json` exposes `container:check` and `ci:check`.

It never builds or runs a container, calls Docker/a registry/Azure, or needs
credentials.

## Out of scope (this pass)

- Live Azure deployment (the template stays disabled).
- Pushing images to a real registry by default.
- Database migration orchestration in the pipeline.
- DNS, certificates, autoscaling rules, and load/perf testing.
- Image vulnerability scanning / SBOM signing (recommended as a follow-up).
- Terraform / remote state (the IaC baseline remains Bicep skeletons).
