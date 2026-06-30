// ============================================================================
// Module: Key Vault access (RBAC) — SKELETON
// ----------------------------------------------------------------------------
// Grants a workload managed identity the built-in "Key Vault Secrets User" role
// on the vault, so the runtime can READ secret values at startup via
// DefaultAzureCredential (system-assigned managed identity). This is the minimal
// least-privilege binding for the managed-identity / Key Vault delivery path.
//
// No secret values appear here. principalId is a runtime-resolved managed identity
// object id (passed from the container-apps module outputs), NOT a secret. Role
// assignment is skipped when principalId is empty so the template stays valid for
// preview/what-if before identities exist.
// ============================================================================

@description('Existing Key Vault name to scope the role assignment to.')
param keyVaultName string

@description('Managed identity (principal) object id to grant Secrets User. Empty skips the assignment.')
param principalId string

@description('Principal type for the role assignment.')
@allowed([
  'ServicePrincipal'
  'User'
  'Group'
])
param principalType string = 'ServicePrincipal'

// Built-in role: Key Vault Secrets User (read secret contents only).
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource secretsUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(principalId)) {
  name: guid(keyVault.id, principalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      keyVaultSecretsUserRoleId
    )
    principalId: principalId
    principalType: principalType
  }
}
