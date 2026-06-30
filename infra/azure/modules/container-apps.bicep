// ============================================================================
// Module: Container Apps (HTTP API + outbox worker) — SKELETON
// ----------------------------------------------------------------------------
// Two separate processes share one Container Apps environment:
//   - api          the HTTP API (ingress enabled), scales on HTTP load.
//   - outbox-worker the outbox drainer (NO ingress), a long-running background
//                   process. Kept as a separate app so it scales and fails
//                   independently of the API.
//
// SECRETS: this skeleton injects only NON-SECRET environment values. Secret
// values (DATABASE_URL, SERVICE_BUS_CONNECTION_STRING, EVIDENCE_BLOB_CONNECTION_
// STRING) must be delivered as Container Apps secrets sourced from Key Vault via
// managed identity (future pass) — they are deliberately absent here so no secret
// is ever rendered into the template.
// ============================================================================

@description('Resource name prefix (e.g. "house-dev").')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags. No secrets.')
param tags object

@description('APP_ENV injected into both processes.')
param appEnv string

@description('AUTH_MODE for the HTTP API.')
param authMode string

@description('EVIDENCE_STORAGE_PROVIDER.')
param evidenceStorageProvider string

@description('EVIDENCE_MALWARE_SCANNING_MODE.')
param evidenceMalwareScanningMode string

@description('OBSERVABILITY_EXPORTER.')
param observabilityExporter string

@description('SERVICE_BUS_ENABLED toggle.')
param serviceBusEnabled bool

@description('API container image reference.')
param apiImage string

@description('Outbox worker container image reference.')
param outboxWorkerImage string

@description('Log Analytics customer id for the Container Apps environment.')
param logAnalyticsCustomerId string

@description('Secret provider mode injected into both processes (env or key_vault).')
param secretProvider string = 'env'

@description('Key Vault URI (public, NOT a secret) used when secretProvider=key_vault.')
param keyVaultUri string = ''

@description('Container target port for the HTTP API.')
param apiTargetPort int = 3000

resource environment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-cae'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalyticsCustomerId
        // The shared key is a SECRET injected at deploy time from Key Vault — it
        // is intentionally not present in this skeleton.
        sharedKey: ''
      }
    }
  }
}

// Non-secret environment values shared by both processes. Secret values are
// added as Container Apps secrets in the identity/Key Vault pass.
var sharedEnv = [
  {
    name: 'NODE_ENV'
    value: 'production'
  }
  {
    name: 'APP_ENV'
    value: appEnv
  }
  {
    name: 'OBSERVABILITY_ENABLED'
    value: 'true'
  }
  {
    name: 'OBSERVABILITY_EXPORTER'
    value: observabilityExporter
  }
  {
    name: 'SERVICE_BUS_ENABLED'
    value: string(serviceBusEnabled)
  }
  {
    name: 'SECRET_PROVIDER'
    value: secretProvider
  }
  {
    name: 'KEY_VAULT_URI'
    value: keyVaultUri
  }
]

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-api'
  location: location
  tags: tags
  identity: {
    // System-assigned managed identity: used by the runtime (DefaultAzureCredential)
    // to read secrets from Key Vault. No client secret/credential is stored anywhere.
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: apiTargetPort
        transport: 'auto'
        allowInsecure: false
      }
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          env: concat(sharedEnv, [
            {
              name: 'AUTH_MODE'
              value: authMode
            }
            {
              name: 'EVIDENCE_STORAGE_PROVIDER'
              value: evidenceStorageProvider
            }
            {
              name: 'EVIDENCE_MALWARE_SCANNING_MODE'
              value: evidenceMalwareScanningMode
            }
          ])
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: apiTargetPort
              }
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/readyz'
                port: apiTargetPort
              }
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
      }
    }
  }
}

resource outboxWorkerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-outbox-worker'
  location: location
  tags: tags
  identity: {
    // System-assigned managed identity for Key Vault secret reads (see apiApp).
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      // No ingress: the worker is a background process, not an HTTP endpoint.
    }
    template: {
      containers: [
        {
          name: 'outbox-worker'
          image: outboxWorkerImage
          env: concat(sharedEnv, [
            {
              name: 'OUTBOX_WORKER_ENABLED'
              value: 'true'
            }
          ])
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        // Single worker replica by default; outbox leasing is concurrency-safe
        // (FOR UPDATE SKIP LOCKED) so this can be raised carefully.
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output apiFqdn string = apiApp.properties.configuration.ingress.fqdn
output environmentName string = environment.name
// Managed identity object ids (NOT secrets) for Key Vault RBAC grants.
output apiPrincipalId string = apiApp.identity.principalId
output outboxWorkerPrincipalId string = outboxWorkerApp.identity.principalId
