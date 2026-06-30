// ============================================================================
// Module: Key Vault (secrets boundary) — SKELETON
// ----------------------------------------------------------------------------
// Holds application secrets (DATABASE_URL, SERVICE_BUS_CONNECTION_STRING,
// EVIDENCE_BLOB_CONNECTION_STRING, PostgreSQL admin password). This module
// creates the vault ONLY. Secret VALUES are populated out-of-band (operator or
// pipeline with appropriate identity) and consumed by the runtime via managed
// identity (future pass). No secret values appear in IaC.
// ============================================================================

@description('Key Vault name (globally unique, 3-24 chars).')
param keyVaultName string

@description('Azure region.')
param location string

@description('Resource tags. No secrets.')
param tags object

@description('Enable RBAC authorization (recommended over access policies).')
param enableRbacAuthorization bool = true

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: enableRbacAuthorization
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    // Networking is intentionally future: a production hardening pass should set
    // publicNetworkAccess to 'Disabled' and add a private endpoint.
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
