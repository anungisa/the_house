// ============================================================================
// Module: Storage Account + Blob container (evidence payloads) — SKELETON
// ----------------------------------------------------------------------------
// Backs EVIDENCE_STORAGE_PROVIDER=azure_blob. Stores evidence document BYTES
// (hash-addressed). Governance evidence METADATA always lives in PostgreSQL and
// is created solely by the Governance Kernel — this account never holds governed
// lifecycle state.
//
// The connection string is a secret and is NOT emitted here. The runtime should
// prefer managed-identity access (future pass); a connection string, if used,
// must be stored in Key Vault.
// ============================================================================

@description('Globally unique storage account name (3-24 lowercase alphanumerics).')
param storageAccountName string

@description('Azure region.')
param location string

@description('Resource tags. No secrets.')
param tags object

@description('Evidence blob container name.')
param evidenceContainerName string = 'evidence'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    // Networking is intentionally future: a hardening pass should restrict
    // public network access and add a private endpoint.
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 30
    }
  }
}

resource evidenceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: evidenceContainerName
  properties: {
    publicAccess: 'None'
  }
}

output storageAccountName string = storageAccount.name
output evidenceContainerName string = evidenceContainer.name
