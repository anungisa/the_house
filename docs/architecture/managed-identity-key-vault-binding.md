# Managed Identity / Key Vault Binding

Status: baseline (vendor-isolated seam; no live Azure dependency)

## Purpose

Introduce a safe, vendor-isolated **secret-provider** seam so that sensitive runtime
configuration (connection strings, identity endpoints) can be sourced either from environment
variables (default, local/dev/test) or from **Azure Key Vault** using a **managed identity**
(deployed runtimes) — **without changing local/default behavior** and without requiring live
Azure credentials to build, test, or run locally.

This pass does **not** deploy anything, populate any vault, or contact Azure. It establishes the
code seam, configuration contract, infrastructure alignment, tests, and documentation.

## Provider model

A `SecretProvider` resolves a *logical config key* (the canonical environment-variable name, e.g.
`DATABASE_URL`) to its secret value:

```ts
interface SecretProvider {
  readonly name: string;
  getSecret(key: string): Promise<string | undefined>;
}
```

| Provider | Module | Behavior |
| --- | --- | --- |
| `env` (default) | `EnvSecretProvider` | Reads `process.env[key]`. Identical to existing behavior. No Azure, no network. |
| `key_vault` (opt-in) | `AzureKeyVaultSecretProvider` | Fetches from Azure Key Vault via a managed identity (`DefaultAzureCredential`). |

The `key_vault` provider is the **only** module that touches the Azure SDKs
(`@azure/keyvault-secrets`, `@azure/identity`), and it does so behind a **lazy dynamic import** so
default/local execution and the hermetic test suite never load Azure code. A `KeyVaultSecretClient`
seam allows tests to inject a fake client, so **no test contacts a real vault**.

Selection is driven by validated `SecretsConfig` via `createSecretProvider(...)`.

## Secret name mapping

`key_vault` maps a config key to a deterministic, vault-safe secret name (Azure Key Vault secret
names allow only alphanumerics and hyphens):

- lowercase the key,
- replace every run of non-alphanumeric characters with a single `-`,
- optionally prepend a normalized operator prefix.

Examples:

| Config key | Prefix | Vault secret name |
| --- | --- | --- |
| `DATABASE_URL` | _(none)_ | `database-url` |
| `DATABASE_URL` | `house-dev` | `house-dev-database-url` |
| `SERVICE_BUS_CONNECTION_STRING` | `house-prod` | `house-prod-service-bus-connection-string` |

The catalog of keys that may be sourced from a provider (`SECRET_CONFIG_KEYS`): `DATABASE_URL`,
`MIGRATE_DATABASE_URL`, `SERVICE_BUS_CONNECTION_STRING`, `EVIDENCE_BLOB_CONNECTION_STRING`,
`ENTRA_ISSUER`, `ENTRA_AUDIENCE`, `ENTRA_JWKS_URI`. Local/dev does **not** require all of them —
missing secrets are simply omitted and existing env/defaults apply.

## Configuration contract

| Variable | Required | Notes |
| --- | --- | --- |
| `SECRET_PROVIDER` | no (default `env`) | `env` or `key_vault`. Any other value **fails closed** at config load. |
| `KEY_VAULT_URI` | when `key_vault` | Must be a valid **HTTPS** vault URI. Public endpoint, **not** a secret. |
| `KEY_VAULT_SECRET_PREFIX` | no | Optional namespace prefix applied to every vault secret name. |

`SecretsConfig` is part of `AppConfig` (`config.secrets`). Diagnostics report the provider **mode**
and presence booleans (under the non-sensitive `vault` summary block) — never secret values.

## Runtime config loading path

`loadConfig()` remains **synchronous and env-only** and is unchanged for existing callers.

Deployed runtimes that use `SECRET_PROVIDER=key_vault` should call the new async entrypoint at
startup:

```ts
const config = await loadConfigFromSecretProvider();
```

This resolves the configured secret set through the provider, overlays the resolved values onto the
environment, then delegates to `loadConfig()` for the same typed/validated shape. With the default
`env` provider it is behaviorally identical to `loadConfig()`.

**Fail-closed:** provider transport/auth errors propagate, and any required value still missing
after resolution causes `loadConfig()` to throw in production-like environments. Resolved secret
values are **never logged**, and provider error messages include only the secret *name*, never the
value.

## Infrastructure alignment (skeleton, non-deploying)

- Both container apps (`api`, `outbox-worker`) declare a **system-assigned managed identity**.
- `SECRET_PROVIDER` and `KEY_VAULT_URI` are injected as **non-secret** environment values.
- A new `modules/key-vault-access.bicep` grants each managed identity the built-in **Key Vault
  Secrets User** role (read-only) on the vault. Principal ids resolve from the container-apps
  outputs; the assignment is skipped when a principal id is empty (preview/what-if safe).
- The Key Vault module (RBAC authorization enabled) is unchanged except for exposing its resource id.
- No secret **values** appear in any template or parameter file.

`npm run deploy:check` validates the presence of the new module and the secret-provider env vars,
and re-confirms that no secret-like values or sport-specific terminology leak into IaC.

## Local development behavior

- Default `SECRET_PROVIDER=env`: no Azure, no Key Vault, no managed identity, no network.
- `loadConfig()` and `loadConfigFromSecretProvider()` behave identically under the env provider.
- The Azure SDKs are never imported unless a runtime selects `key_vault`.

## Production behavior

- Set `SECRET_PROVIDER=key_vault` and a valid HTTPS `KEY_VAULT_URI`.
- Pre-populate the vault with the deterministically named secrets (operator/pipeline, out of band).
- The container apps' managed identities read secrets at startup via `DefaultAzureCredential`.
- No client secrets/credentials are stored in config, env, or IaC.

## Failure modes

| Situation | Result |
| --- | --- |
| Unknown `SECRET_PROVIDER` | Config load throws (fail closed). |
| `key_vault` without `KEY_VAULT_URI` | Config load throws. |
| Non-HTTPS `KEY_VAULT_URI` | Config load throws. |
| Required secret missing in production-like env | `loadConfig()` throws (e.g. `DATABASE_URL`). |
| Vault transport/auth error | Provider throws a sanitized error (no secret value). |
| Secret not found (404) | Resolves to `undefined` (caller falls back / fails closed if required). |

## Out of scope (intentional)

- Live Azure deployment and `az deployment` execution.
- Automated Key Vault secret population.
- Microsoft Entra app registration / identity provisioning automation.
- Private networking / private endpoints for Key Vault.
- Certificate/secret rotation automation.
- Full CI/CD wiring.
