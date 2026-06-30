/**
 * Participant Registry domain barrel.
 *
 * Generic, tenant-scoped NSO participant/member registry: models people and their relationships
 * to organizations in the Organization Registry. It is REFERENCE-DATA structure that NEVER calls
 * the Governance Kernel, mutates governed state, or mutates the Organization Registry. It holds
 * only minimal identifying fields — no registration, payments, program enrollment, event
 * participation, eligibility, or sensitive attributes.
 */

export * from './ParticipantTypes.js';
export {
  type CreateParticipantOutcome,
  type UpdateParticipantOutcome,
  type CreateOrganizationLinkOutcome,
  type UpdateOrganizationLinkOutcome,
  type ParticipantRegistryStore,
  type OrganizationReader,
  type OutboxCorrelation,
  PARTICIPANT_OUTBOX_MAX_RETRIES,
  buildParticipantCreatedOutbox,
  buildParticipantUpdatedOutbox,
  buildParticipantStatusChangedOutbox,
  buildOrganizationLinkedOutbox,
  buildOrganizationLinkStatusChangedOutbox,
  participantCreatedDedupeKey,
  participantUpdatedDedupeKey,
  participantStatusChangedDedupeKey,
  organizationLinkedDedupeKey,
  organizationLinkStatusChangedDedupeKey,
} from './ParticipantRegistryStore.js';
export { InMemoryParticipantRegistryStore } from './InMemoryParticipantRegistryStore.js';
export type { InMemoryParticipantRegistryStoreDeps } from './InMemoryParticipantRegistryStore.js';
export { PgParticipantRegistryStore } from './PgParticipantRegistryStore.js';
export {
  ParticipantRegistryService,
  type ParticipantRegistryServiceDeps,
  type CreateParticipantInput,
  type UpdateParticipantInput,
  type ChangeParticipantStatusInput,
  type LinkParticipantToOrganizationInput,
  type ChangeOrganizationParticipantStatusInput,
} from './ParticipantRegistryService.js';
