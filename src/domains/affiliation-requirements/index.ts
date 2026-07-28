/**
 * Affiliation requirements + DRAFT experience (Slice C).
 *
 * The representative-facing pre-submission working set: a versioned institutional requirement
 * catalog, per-application requirement-version bindings, saved responses, associated governed
 * evidence references, server-derived completeness, and optimistic-concurrency draft saves. This
 * module owns NO governed lifecycle state (that lives in governance.entity_state and is written
 * EXCLUSIVELY by the Governance Kernel) and NEVER invokes the kernel — submission is Slice D.
 */

export * from './RequirementCatalog.js';
export * from './AffiliationDraftTypes.js';
export * from './Completeness.js';
export * from './AffiliationDraftStore.js';
export { InMemoryAffiliationDraftStore } from './InMemoryAffiliationDraftStore.js';
export { PgAffiliationDraftStore } from './PgAffiliationDraftStore.js';
export * from './RequirementCatalogStore.js';
export * from './AffiliationLifecycleReader.js';
export * from './EvidenceReferenceValidator.js';
export * from './AffiliationDraftService.js';
