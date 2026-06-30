# Production Release Checklist — The House v2

> Copy this template for **each** release and fill it in as you progress through
> the [production release runbook](../production-release-runbook.md). Do **not**
> paste real secrets, tokens, connection strings, or environment URLs into a
> completed checklist — record digests, decisions, and references only.

---

## Release identification

- **Release ID:** `____________________`
- **Date / time (UTC):** `____________________`
- **Environment:** `____________________` (e.g. dev / test / prod)
- **Operator:** `____________________`
- **Technical approver:** `____________________`
- **Business approver:** `____________________`

---

## Build under release

- **Commit SHA:** `____________________`
- **API image digest:** `sha256:____________________`
- **Worker image digest:** `sha256:____________________`

---

## Migration

- [ ] **Migration plan reviewed:** yes / no
- **Pending migrations:**
  - `____________________`
  - `____________________`

---

## Supply-chain and provenance

- [ ] **SBOM artifacts captured:** yes / no
- [ ] **Scan artifacts reviewed:** yes / no
- [ ] **Signature / provenance verified (by digest):** yes / no

---

## Validation

- **Preflight (`ci:check` + `release:check`):** pass / fail
- **Smoke test result:** pass / fail / skipped

---

## Decision

- [ ] **Go / no-go decision:** GO / NO-GO
- **Rationale:** `____________________`

---

## Rollback readiness

- **Rollback image / digest (prior good build):** `sha256:____________________`
- **Rollback owner:** `____________________`

---

## After release

- **Post-release notes:** `____________________`
- **Incident notes (if any):** `____________________`
