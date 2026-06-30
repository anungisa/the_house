# `infra/` — Infrastructure as Code (baseline)

This directory holds The House v2 deployment baseline. It is a **reviewable skeleton**, not a
live deployment: nothing here creates cloud resources by itself, requires credentials, or
contains secrets.

## Layout

```
infra/
  README.md            ← this file
  azure/               ← Azure-native Bicep baseline (see azure/README.md)
```

Bicep is used (Azure-native, no extra tooling or remote state). There is no existing Terraform
in this repository, so Terraform is intentionally not introduced.

## Guarantees

- **No secrets.** Only resource names, locations, tags, prefixes, and non-secret toggles /
  placeholders appear here. Application secrets live in **Azure Key Vault** and are consumed by
  the runtime via **managed identity** (a future pass).
- **Non-deploying.** These files are validated statically (`npm run deploy:check`) but are not
  wired into any automated deployment.
- **NSO-generic.** No sport-specific terminology appears in platform IaC.

See `docs/architecture/production-deployment-baseline.md` for the full topology, environment
model, config/secrets matrix, and migration/startup order.
