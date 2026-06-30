// ============================================================================
// Example parameters — PROD environment (NON-SECRET).
// Copy to prod.bicepparam and adjust. NEVER put secrets here: secrets live in
// Key Vault and are referenced by the runtime via managed identity.
//
// Production must NOT use AUTH_MODE=demo. evidence storage must be azure_blob and
// malware scanning should be a real (signature) scanner.
// ============================================================================
using '../main.bicep'

param resourcePrefix = 'house'
param environmentName = 'prod'
param location = 'canadacentral'
param appEnv = 'production'

param authMode = 'entra_jwt'
param evidenceStorageProvider = 'azure_blob'
param evidenceMalwareScanningMode = 'signature'
param observabilityExporter = 'console'
param serviceBusEnabled = true

// Container images: replace with your registry references at deploy time.
param apiImage = 'REPLACE_WITH_API_IMAGE_REF'
param outboxWorkerImage = 'REPLACE_WITH_WORKER_IMAGE_REF'

// PostgreSQL admin LOGIN only (non-secret). The PASSWORD is a Key Vault secret.
param postgresAdminLogin = 'house_admin'

param tags = {
  application: 'the-house-v2'
  environment: 'prod'
  managedBy: 'bicep'
  costCenter: 'platform'
  dataClassification: 'confidential'
}
