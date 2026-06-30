# `infra/azure/` — Azure Bicep baseline (skeleton)

A non-deploying Bicep skeleton describing the target Azure shape for The House v2.

## Files

```
azure/
  main.bicep                 ← resourceGroup-scope orchestrator (modules below)
  modules/
    container-apps.bicep     ← Container Apps env + api (ingress) + outbox-worker (no ingress)
    postgres.bicep           ← PostgreSQL Flexible Server (RLS system-of-record)
    service-bus.bicep        ← Service Bus namespace + outbox topic (no sessions)
    storage.bicep            ← Storage account + Blob container (evidence payload bytes)
    key-vault.bicep          ← Key Vault (secrets boundary)
    key-vault-access.bicep   ← Key Vault Secrets User RBAC grant for workload identities
    observability.bicep      ← Log Analytics workspace (optional stdout collection)
  parameters/
    dev.example.bicepparam   ← example DEV params (non-secret)
    test.example.bicepparam  ← example TEST params (non-secret)
    prod.example.bicepparam  ← example PROD params (non-secret)
```

## Conventions

- **Scope:** `main.bicep` targets a pre-created **resource group** (one per environment).
- **Naming:** resources derive from `${resourcePrefix}-${environmentName}`; globally unique
  names (storage, Key Vault) append `uniqueString(resourceGroup().id)`.
- **Tags:** every resource is tagged (`application`, `environment`, `managedBy`, `costCenter`).
- **Secrets:** never passed as plaintext parameters and never emitted as outputs. Connection
  strings, the PostgreSQL admin password, and Service Bus / Storage keys belong in Key Vault.
- **Networking:** intentionally **future** — resources use public access with platform auth in
  this baseline. Hardening points (private endpoints, disabled public access) are marked in the
  module comments.
- **Identity:** both container apps declare a **system-assigned managed identity** and receive
  the **Key Vault Secrets User** role (`key-vault-access.bicep`) so the runtime can read secrets
  via `SECRET_PROVIDER=key_vault`. Binding to Storage / Service Bus and live vault population are
  **future**; the containers still receive only non-secret environment values inline. See
  [managed-identity-key-vault-binding.md](../../docs/architecture/managed-identity-key-vault-binding.md).

## Validating (no deployment)

```sh
npm run deploy:check
```

This static check confirms the structure and the absence of secrets. It does **not** run
`az bicep build`, `az deployment`, or contact Azure. To compile the Bicep locally (optional,
requires the Azure CLI / Bicep — not required by CI):

```sh
az bicep build --file infra/azure/main.bicep
```

## Example deploy (manual, after review + Key Vault population)

```sh
# 1. Create the resource group (out-of-band).
az group create -n house-dev-rg -l canadacentral

# 2. Populate Key Vault secrets out-of-band (DB URLs, connection strings, PG password).

# 3. Run migrations separately with the privileged migration role.
MIGRATE_DATABASE_URL=... npm run db:migrate

# 4. Deploy the baseline into the resource group.
az deployment group create \
  -g house-dev-rg \
  -f infra/azure/main.bicep \
  -p infra/azure/parameters/dev.example.bicepparam
```
