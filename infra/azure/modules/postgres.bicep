// ============================================================================
// Module: Azure Database for PostgreSQL Flexible Server — SKELETON
// ----------------------------------------------------------------------------
// Durable system-of-record. RLS-enforced governance tables live here. The app
// connects as a NON-superuser, RLS-respecting role; migrations run separately as
// a privileged migration role (MIGRATE_DATABASE_URL). This module does NOT set or
// output any password: the administrator password must be supplied out-of-band
// from Key Vault, and per-role app/migration credentials are provisioned
// separately (future pass).
// ============================================================================

@description('Resource name prefix (e.g. "house-dev").')
param namePrefix string

@description('Azure region.')
param location string

@description('Resource tags. No secrets.')
param tags object

@description('PostgreSQL administrator login (NOT a secret).')
param administratorLogin string

@description('Compute tier SKU name.')
param skuName string = 'Standard_B1ms'

@description('Compute tier.')
@allowed([
  'Burstable'
  'GeneralPurpose'
  'MemoryOptimized'
])
param skuTier string = 'Burstable'

@description('Storage size in GB.')
param storageSizeGb int = 32

@description('PostgreSQL major version.')
param postgresVersion string = '16'

@description('Application database name.')
param databaseName string = 'the_house'

// The administrator password is a SECRET and is intentionally NOT a parameter
// here. Provision the server with an admin password sourced from Key Vault using
// a getSecret() reference from a parent template, or set it out-of-band. This
// skeleton leaves authentication wiring to the identity/Key Vault pass.
@description('Reference to the Key Vault secret URI holding the admin password (non-secret URI).')
param administratorPasswordSecretUri string = ''

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${namePrefix}-pg'
  location: location
  tags: tags
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    storage: {
      storageSizeGB: storageSizeGb
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      // Single-zone in the baseline; a reliability pass can enable zone-redundant HA.
      mode: 'Disabled'
    }
    // Networking is intentionally future: a hardening pass should switch to
    // private access (delegated subnet) instead of public + firewall rules.
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource appDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

output serverName string = postgres.name
output databaseName string = appDatabase.name
output adminPasswordSecretUri string = administratorPasswordSecretUri
