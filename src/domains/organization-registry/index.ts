/**
 * Organization Registry domain barrel.
 *
 * Generic, tenant-scoped NSO organization registry: models national/regional/local/external/
 * applicant organizations and their parent/child hierarchy. It is REFERENCE-DATA structure that
 * NEVER calls the Governance Kernel, mutates governed state, or substitutes for a kernel-approved
 * lifecycle transition.
 */

export * from './OrganizationTypes.js';
export {
  type CreateOrganizationOutcome,
  type OrganizationRegistryStore,
  type UpdateOrganizationOutcome,
  type OutboxCorrelation,
  ORGANIZATION_OUTBOX_MAX_RETRIES,
  buildOrganizationCreatedOutbox,
  buildOrganizationStatusChangedOutbox,
  buildOrganizationUpdatedOutbox,
  organizationCreatedDedupeKey,
  organizationStatusChangedDedupeKey,
  organizationUpdatedDedupeKey,
} from './OrganizationRegistryStore.js';
export { InMemoryOrganizationRegistryStore } from './InMemoryOrganizationRegistryStore.js';
export type { InMemoryOrganizationRegistryStoreDeps } from './InMemoryOrganizationRegistryStore.js';
export { PgOrganizationRegistryStore } from './PgOrganizationRegistryStore.js';
export {
  OrganizationRegistryService,
  type OrganizationRegistryServiceDeps,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type ChangeOrganizationStatusInput,
  type RegisterFromAffiliationInput,
} from './OrganizationRegistryService.js';
