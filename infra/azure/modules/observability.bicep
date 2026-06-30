// ============================================================================
// Module: Observability (Log Analytics) — SKELETON / OPTIONAL
// ----------------------------------------------------------------------------
// The House v2 telemetry is vendor-neutral (counters/durations/events emitted to
// a console/stdout exporter by default). A Log Analytics workspace is provided so
// Container Apps stdout can be collected, but the application does NOT depend on
// Application Insights or any vendor SDK. Wiring an App Insights exporter is a
// future, optional pass.
// ============================================================================

@description('Resource name prefix (e.g. "house-dev").')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags. No secrets.')
param tags object

@description('Daily ingestion cap in GB (cost guard). -1 means no cap.')
param dailyQuotaGb int = 1

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: dailyQuotaGb
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

output logAnalyticsWorkspaceId string = logAnalytics.id
output logAnalyticsCustomerId string = logAnalytics.properties.customerId
