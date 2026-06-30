// ============================================================================
// Module: Service Bus (outbox transport) — SKELETON
// ----------------------------------------------------------------------------
// Transport for the transactional outbox. The platform writes the outbox row in
// the same DB transaction as a governed transition; the outbox worker publishes
// AFTER commit. v1 does NOT use Service Bus sessions.
//
// The connection string is a secret and is NOT emitted here. Prefer
// managed-identity access (future pass); a connection string, if used, must be
// stored in Key Vault. An authorization rule is created WITHOUT exposing its keys
// in template outputs.
// ============================================================================

@description('Resource name prefix (e.g. "house-dev").')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags. No secrets.')
param tags object

@description('Outbox topic name (matches SERVICE_BUS_TOPIC_NAME).')
param topicName string = 'house-outbox'

@description('Default subscription name for downstream consumers.')
param subscriptionName string = 'house-outbox-consumers'

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: '${namePrefix}-sb'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
  }
}

resource outboxTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: topicName
  properties: {
    // Sessions are intentionally DISABLED in v1.
    requiresDuplicateDetection: true
    duplicateDetectionHistoryTimeWindow: 'PT10M'
    supportOrdering: true
  }
}

resource outboxSubscription 'Microsoft.ServiceBus/namespaces/topics/subscriptions@2022-10-01-preview' = {
  parent: outboxTopic
  name: subscriptionName
  properties: {
    // Sessions are intentionally DISABLED in v1.
    requiresSession: false
    deadLetteringOnMessageExpiration: true
    maxDeliveryCount: 10
  }
}

// Authorization rule for the publisher. Keys are NOT exposed as outputs; an
// operator/pipeline reads them via control-plane and stores them in Key Vault.
resource publishRule 'Microsoft.ServiceBus/namespaces/authorizationRules@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'outbox-publisher'
  properties: {
    rights: [
      'Send'
    ]
  }
}

output namespaceName string = serviceBusNamespace.name
output topicName string = outboxTopic.name
