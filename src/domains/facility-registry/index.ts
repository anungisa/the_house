/**
 * Facility Registry domain barrel.
 *
 * Generic, tenant-scoped NSO facility/site registry: models places that belong to an organization
 * in the Organization Registry. It is REFERENCE-DATA structure that NEVER calls the Governance
 * Kernel, mutates governed state, or mutates the Organization Registry. It holds only minimal
 * descriptive/location/contact fields; the architecture doc's out-of-scope section lists the
 * operational and transactional behavior intentionally excluded from this slice.
 */

export * from './FacilityTypes.js';
export {
  type CreateFacilityOutcome,
  type UpdateFacilityOutcome,
  type FacilityRegistryStore,
  type OrganizationReader,
  type OutboxCorrelation,
  FACILITY_OUTBOX_MAX_RETRIES,
  buildFacilityCreatedOutbox,
  buildFacilityUpdatedOutbox,
  buildFacilityStatusChangedOutbox,
  facilityCreatedDedupeKey,
  facilityUpdatedDedupeKey,
  facilityStatusChangedDedupeKey,
} from './FacilityRegistryStore.js';
export { InMemoryFacilityRegistryStore } from './InMemoryFacilityRegistryStore.js';
export type { InMemoryFacilityRegistryStoreDeps } from './InMemoryFacilityRegistryStore.js';
export { PgFacilityRegistryStore } from './PgFacilityRegistryStore.js';
export {
  FacilityRegistryService,
  type FacilityRegistryServiceDeps,
  type CreateFacilityInput,
  type UpdateFacilityInput,
  type ChangeFacilityStatusInput,
} from './FacilityRegistryService.js';
