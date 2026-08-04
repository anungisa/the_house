/**
 * Governed jurisdiction domain module — public barrel.
 *
 * The jurisdiction catalog + organization assignment edge are the persisted, tenant-isolated,
 * governed source of an organization's governing jurisdiction (migration 0023). They replace the
 * organization-type-derived stub: resolution walks the governed organization hierarchy (direct
 * assignment overrides inherited), fails closed on ambiguity / broken hierarchy, and projects a
 * representative-safe { code, label, level } view — every command recorded through audit +
 * transactional outbox.
 */

export * from './JurisdictionTypes.js';
export {
  jurisdictionDedupeKey,
  JURISDICTION_ASSIGNED_MESSAGE_TYPE,
  JURISDICTION_ASSIGNMENT_REPLACED_MESSAGE_TYPE,
  JURISDICTION_ASSIGNMENT_REVOKED_MESSAGE_TYPE,
  JURISDICTION_CREATED_MESSAGE_TYPE,
  JURISDICTION_PUBLISHED_MESSAGE_TYPE,
  JURISDICTION_RETIRED_MESSAGE_TYPE,
  JURISDICTION_REVISED_MESSAGE_TYPE,
  type AssignPrimaryJurisdictionCommand,
  type CreateJurisdictionDraftCommand,
  type CreateJurisdictionDraftOutcome,
  type JurisdictionAssignmentOutcome,
  type JurisdictionCommandMeta,
  type JurisdictionMutationOutcome,
  type JurisdictionStore,
  type PublishJurisdictionCommand,
  type ReplacePrimaryJurisdictionCommand,
  type RetireJurisdictionCommand,
  type RevokeJurisdictionAssignmentCommand,
  type ReviseJurisdictionDraftCommand,
} from './JurisdictionStore.js';
export {
  GovernedJurisdictionResolver,
  type JurisdictionOrganizationReader,
  type JurisdictionResolver,
  type JurisdictionResolverStore,
} from './JurisdictionResolver.js';
export { JurisdictionCatalogService } from './JurisdictionCatalogService.js';
export { InMemoryJurisdictionStore } from './InMemoryJurisdictionStore.js';
export { JURISDICTION_OUTBOX_MAX_RETRIES, PgJurisdictionStore } from './PgJurisdictionStore.js';
