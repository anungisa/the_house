# Production Release Runbook — The House v2

> Operational control, **not** deployment automation. This runbook is the single
> human-operable go/no-go procedure that ties together the release-safety
> controls already formalized in this repo (IaC, secrets, CI/CD, migrations,
> SBOM/scanning, signed provenance, and optional Azure smoke validation).
>
> Running this runbook is a **deliberate human activity**. Nothing here deploys
> by default, runs live migrations by default, calls Azure by default, or
> requires secrets in local/PR validation. Default validation stays hermetic.

---

## 1. Purpose and scope

This runbook describes the end-to-end procedure an operator follows to promote a
commit on `main` to a deployed environment, capture release evidence, and make a
documented go/no-go decision.

**In scope:** preflight gates, image build/packaging, SBOM/vulnerability review,
provenance/signature review, migration plan/apply, deployment execution, smoke
validation, go/no-go decisioning, rollback decisioning and procedure, release
evidence capture, and post-release monitoring.

**Not a source of runtime truth.** The Governance Kernel, workflows, RLS, and
the application services remain the authority for runtime behaviour. This runbook
references commands and workflows; it never re-implements them.

See also:

- [Production deployment baseline](../architecture/production-deployment-baseline.md)
- [Production CI/CD baseline](../architecture/production-cicd-baseline.md)
- [Migration orchestration baseline](../architecture/migration-orchestration-baseline.md)
- [Image SBOM / vulnerability baseline](../architecture/image-sbom-vulnerability-baseline.md)
- [Signed provenance / Cosign baseline](../architecture/signed-provenance-cosign-baseline.md)
- [Azure environment smoke-test baseline](../architecture/azure-environment-smoke-test-baseline.md)
- [Managed identity / Key Vault binding](../architecture/managed-identity-key-vault-binding.md)
- [Deployment / secrets / observability hardening](../architecture/deployment-secrets-observability-hardening.md)
- Release checklist template: [templates/production-release-checklist.md](templates/production-release-checklist.md)

---

## 2. Roles and responsibilities

| Role | Responsibility |
| --- | --- |
| **Release operator** | Drives the runbook end to end: runs preflight, dispatches the guarded deploy workflow, records evidence, and executes rollback if directed. |
| **Technical approver** | Reviews preflight results, the migration plan, and provenance/scan posture; gives the technical go/no-go. |
| **Business approver** | Confirms the release is authorized for the target environment and timing; gives the business go/no-go. |
| **Rollback owner** | Owns the decision to roll back, the previous-image digest, and post-rollback verification. May be the operator for non-production environments. |

No single person should self-approve a production release. Technical and business
approvals are recorded in the release checklist.

---

## 3. Release prerequisites

Before starting, confirm **all** of the following:

- [ ] `main` is clean and up to date; the release commit SHA is known.
- [ ] CI is green on the release commit (the `ci` workflow passed).
- [ ] Target environment is explicitly selected (e.g. `dev`, `test`, `prod`).
- [ ] The migration plan for this release has been reviewed (see §8).
- [ ] Required secrets are present in Key Vault / platform secrets — never
      committed. The application uses managed identity; the migration role uses a
      separate privileged credential.
- [ ] Image targets are identified (API image and worker image).
- [ ] The **rollback image / tag / digest** (the currently-deployed good build)
      is recorded **before** rollout.

Do not proceed if unrelated working-tree changes exist or any prerequisite is
unmet.

---

## 4. Preflight gates (hermetic; no cloud access)

Run the full hermetic gate locally and confirm each passes. These require no
Azure, no live URL, no database, and no secrets:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run deploy:check
npm run container:check
npm run migrations:check
npm run supply-chain:check
npm run provenance:check
npm run smoke:check
npm run release:check
npm run ci:check
```

`npm run ci:check` chains all of the above static gates. A failing preflight is an
automatic **no-go**.

---

## 5. Image build and packaging

- The release builds two images from the single multi-stage `Dockerfile`: the
  **API** image (`--target api`) and the **worker** image (`--target worker`).
- Images are built in the registry via the guarded deploy workflow (`az acr
  build`), not pushed from a developer laptop.
- **No secrets are baked into images.** `.dockerignore` excludes `.env`; the
  `container:check` gate enforces this and confirms a non-root runtime user.
- Record both resulting image **digests** (not just tags) for evidence.

---

## 6. SBOM and vulnerability review

- The container-build workflow generates an SBOM and runs a vulnerability scan on
  pull requests (build/scan-only; no push, no secrets).
- **Current posture is reporting-only**: scan findings are surfaced for review but
  do not yet hard-block. The operator/technical approver reviews CRITICAL/HIGH
  findings and records the decision.
- **Future enforced thresholds**: scan severity thresholds will become blocking;
  the `supply-chain:check` gate already forbids blanket suppressions.
- Capture the SBOM and scan artifacts for the candidate image digests.

---

## 7. Provenance and signature review

- Production images must be **signed by digest** (never tag-only) and carry an
  **SBOM attestation**.
- Signing is keyless (Fulcio identity + Rekor transparency log) via Cosign in the
  manual, confirmation-guarded provenance workflow. Signing never runs on pull
  requests.
- The deploy workflow verifies the image **signature** and **SBOM attestation**
  against the immutable digest before rollout; these gates must not be bypassed.
- Tag-only approval is **not acceptable**. Record the verified digest.

---

## 8. Migration plan

- Preview pending schema changes with a read-only plan:

  ```bash
  npm run migrations:plan
  ```

- Review the list of pending migrations with the technical approver.
- The **application role must not run migrations**. Migrations run under a
  separate privileged migration credential, distinct from the restricted
  application `DATABASE_URL`.
- **No automatic API/worker startup migrations.** Application and worker
  containers never apply schema changes at boot. Migrations are an explicit,
  ordered, forward-only release step.

---

## 9. Release execution

Execute the release through the manual, guarded deploy workflow —
`.github/workflows/production-deploy-template.yml`:

1. Dispatch the workflow via `workflow_dispatch` (never on push/PR).
2. Type the confirmation phrase `DEPLOY`; without it every job is a no-op.
3. The job runs in a **protected** GitHub environment (required reviewers).
4. Order of operations: what-if preview → verify scan/SBOM → migration plan →
   build images → **migration apply (forward-only) before rollout** → verify
   signature + attestation → roll out API → roll out worker → optional smoke.
5. Migrations are applied **before** the new revisions start so the schema is
   ready when the new containers come up. The apply step runs the same governed
   command used everywhere else:

   ```bash
   npm run migrations:apply
   ```

---

## 10. Smoke validation

- Post-deploy smoke is **read-only** and **opt-in**: it runs only when the
  operator sets `run_smoke_tests = true` on top of the `DEPLOY` confirmation.
- The runner is default-off and refuses to call anything unless
  `AZURE_SMOKE_ENABLED=true`:

  ```bash
  npm run smoke:azure
  ```

- Live checks cover readiness (`/readyz`), liveness (`/healthz`), and authenticated
  / unauthenticated read behaviour. They **never** mutate governed state.
- Record the smoke result (pass / fail / skipped) in the checklist.

---

## 11. Go/no-go decision

Declare **GO** only when all of the following hold:

- Preflight gates passed (`ci:check`, `release:check`).
- SBOM/scan posture reviewed and accepted.
- Signature + SBOM attestation verified by digest.
- Migration plan reviewed and approved.
- Technical approver and business approver both approve.

Any unmet item is a **NO-GO**. Record the decision, the approvers, and the
rationale in the release checklist.

---

## 12. Rollback criteria

Initiate rollback when, after rollout:

- Readiness/liveness fail or remain unhealthy beyond the agreed window.
- Smoke validation fails (when run).
- A surge in HTTP errors, authorization denials, or workflow failures appears.
- Evidence quarantine or outbox-failure signals spike abnormally.
- The technical or business approver calls an abort.

---

## 13. Rollback procedure

- **Image rollback:** redeploy the previously-recorded good image **digest** for
  both the API and worker container apps (roll the revisions back to the prior
  digest). Use the same guarded workflow / `az containerapp update` path.
- **Config rollback:** revert configuration/secret references to the previous
  known-good values via the platform (Key Vault / app settings), never by
  committing secrets.
- **Migration caveat:** there are **no automated down-migrations**. Schema changes
  are forward-only; a schema rollback is a deliberate, separately-authored,
  human-reviewed forward migration — never an automatic reversal.
- **Data/state caution:** rolling images back does **not** undo data already
  written under the new schema. Assess data/state impact before rolling back and
  involve the rollback owner.

---

## 14. Evidence capture

Record, for every release, in the [release checklist](templates/production-release-checklist.md):

- Commit SHA.
- API and worker image **digests**.
- SBOM artifacts (per digest).
- Vulnerability scan artifacts / decision.
- Migration plan output and migration apply output.
- Smoke output (or "skipped").
- Approvals (technical + business) with names and timestamps.
- Incident notes, if any.

---

## 15. Post-release monitoring

Watch for a defined window after rollout:

- Readiness / liveness health.
- HTTP error rates.
- Authorization (authz) denials.
- Workflow failures.
- Evidence quarantine signals.
- Outbox publish failures / backlog.

---

## 16. Failure modes and escalation

| Failure | First response | Escalation |
| --- | --- | --- |
| Preflight gate fails | Fix on `main`, re-run preflight | Technical approver |
| Scan shows new CRITICAL/HIGH | Review + risk-accept or rebuild | Technical approver |
| Signature/attestation verify fails | Stop; do not roll out | Technical approver + rollback owner |
| Migration apply fails | Halt rollout; assess schema state | Technical approver + rollback owner |
| Rollout unhealthy / smoke fails | Trigger rollback (§13) | Rollback owner + business approver |
| Data integrity concern | Freeze; assess before any rollback | Rollback owner + business approver |

---

## 17. Out of scope

This runbook intentionally does **not** cover:

- automated rollback
- blue/green deployments
- canary deployments
- live Azure deployment execution from local dev
- database down-migrations
- load testing
- production incident automation
- SLO enforcement

These represent later maturity and are deliberately excluded so the procedure
stays honest about current capabilities.
