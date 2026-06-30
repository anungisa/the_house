// ============================================================================
// The House v2 — Azure deployment baseline (SKELETON, NON-DEPLOYING REFERENCE)
// ============================================================================
//
// This template describes the TARGET Azure shape for The House v2. It is a
// reviewable Infrastructure-as-Code baseline, NOT a live deployment: it is not
// wired into CI deployment, contains NO secrets, and must be reviewed and
// completed (identity, networking, Key Vault secret population) before any real
// `az deployment` is attempted.
//
// Scope: resourceGroup. Create the resource group out-of-band (or via a
// subscription-scope wrapper) before deploying this template into it.
//
// Secrets are NEVER passed as plaintext parameters. Application secrets
// (DATABASE_URL, SERVICE_BUS_CONNECTION_STRING, EVIDENCE_BLOB_CONNECTION_STRING,
// PostgreSQL admin password) must be stored in Key Vault and referenced by the
// runtime via managed identity (future pass). Parameter files carry only names,
// locations, tags, and non-secret toggles.
// ============================================================================

targetScope = 'resourceGroup'

// ---------------------------------------------------------------------------
// Core parameters (non-secret)
// ---------------------------------------------------------------------------

@description('Short, lowercase resource name prefix (e.g. "house"). No secrets.')
@minLength(2)
@maxLength(12)
param resourcePrefix string

@description('Environment name. Drives APP_ENV and resource naming.')
@allowed([
  'dev'
  'test'
  'prod'
])
param environmentName string

@description('Azure region for all resources (e.g. "canadacentral").')
param location string = resourceGroup().location

@description('APP_ENV value injected into the API and worker runtimes.')
@allowed([
  'development'
  'test'
  'production'
])
param appEnv string

@description('Resource tags applied to every resource. No secrets.')
param tags object = {
  application: 'the-house-v2'
  environment: environmentName
  managedBy: 'bicep'
  costCenter: 'platform'
}

// ---------------------------------------------------------------------------
// Non-secret runtime toggles (mirror src/config/index.ts)
// ---------------------------------------------------------------------------

@description('Edge identity mode for the HTTP API. Production should NOT use "demo".')
@allowed([
  'demo'
  'trusted_headers'
  'entra_jwt'
])
param authMode string = 'entra_jwt'

@description('Evidence payload storage provider. Production uses azure_blob.')
@allowed([
  'memory'
  'azure_blob'
])
param evidenceStorageProvider string = 'azure_blob'

@description('Evidence malware scanning mode.')
@allowed([
  'disabled'
  'signature'
])
param evidenceMalwareScanningMode string = 'signature'

@description('Vendor-neutral telemetry exporter mode.')
@allowed([
  'noop'
  'memory'
  'console'
])
param observabilityExporter string = 'console'

@description('Whether to publish outbox messages to Azure Service Bus.')
param serviceBusEnabled bool = true

@description('Container image reference for the HTTP API process.')
param apiImage string = 'mcr.microsoft.com/azuredocs/aci-helloworld:latest'

@description('Container image reference for the outbox worker process.')
param outboxWorkerImage string = 'mcr.microsoft.com/azuredocs/aci-helloworld:latest'

@description('PostgreSQL administrator login name (NOT a secret; the password lives in Key Vault).')
param postgresAdminLogin string = 'house_admin'

// ---------------------------------------------------------------------------
// Derived, deterministic resource names
// ---------------------------------------------------------------------------

var namePrefix = '${resourcePrefix}-${environmentName}'
// Storage account names must be globally unique, 3-24 chars, lowercase alphanumerics.
var storageAccountName = toLower(replace('${resourcePrefix}${environmentName}evid${uniqueString(resourceGroup().id)}', '-', ''))
var keyVaultName = take(toLower('${resourcePrefix}-${environmentName}-kv-${uniqueString(resourceGroup().id)}'), 24)

// ---------------------------------------------------------------------------
// Modules — each is a self-contained skeleton. Networking/private endpoints are
// intentionally future (public access with platform auth in this baseline).
// ---------------------------------------------------------------------------

module keyVault 'modules/key-vault.bicep' = {
  name: 'keyVault'
  params: {
    keyVaultName: keyVaultName
    location: location
    tags: tags
  }
}

module observability 'modules/observability.bicep' = {
  name: 'observability'
  params: {
    namePrefix: namePrefix
    location: location
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    storageAccountName: storageAccountName
    location: location
    tags: tags
  }
}

module serviceBus 'modules/service-bus.bicep' = {
  name: 'serviceBus'
  params: {
    namePrefix: namePrefix
    location: location
    tags: tags
  }
}

module postgres 'modules/postgres.bicep' = {
  name: 'postgres'
  params: {
    namePrefix: namePrefix
    location: location
    tags: tags
    administratorLogin: postgresAdminLogin
  }
}

module containerApps 'modules/container-apps.bicep' = {
  name: 'containerApps'
  params: {
    namePrefix: namePrefix
    location: location
    tags: tags
    appEnv: appEnv
    authMode: authMode
    evidenceStorageProvider: evidenceStorageProvider
    evidenceMalwareScanningMode: evidenceMalwareScanningMode
    observabilityExporter: observabilityExporter
    serviceBusEnabled: serviceBusEnabled
    apiImage: apiImage
    outboxWorkerImage: outboxWorkerImage
    logAnalyticsCustomerId: observability.outputs.logAnalyticsCustomerId
  }
}

// ---------------------------------------------------------------------------
// Outputs (non-secret references only)
// ---------------------------------------------------------------------------

output keyVaultName string = keyVault.outputs.keyVaultName
output storageAccountName string = storage.outputs.storageAccountName
output serviceBusNamespace string = serviceBus.outputs.namespaceName
output postgresServerName string = postgres.outputs.serverName
output apiFqdn string = containerApps.outputs.apiFqdn
output environment string = environmentName
