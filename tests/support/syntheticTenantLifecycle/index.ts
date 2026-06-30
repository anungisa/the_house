/**
 * Public surface of the synthetic tenant-lifecycle test support harness.
 *
 * Import from this barrel in scenario tests so the wiring details (which in-memory store, which
 * planner, how the outbox is shared) stay encapsulated in the harness.
 */

export {
  SyntheticTenantLifecycleHarness,
  type EvidenceGateOutcome,
  type HttpCaller,
  type HttpJsonResponse,
} from './SyntheticTenantLifecycleHarness.js';
export {
  TENANT_ALPHA_ID,
  TENANT_BETA_ID,
  TENANT_ALPHA_LABEL,
  TENANT_BETA_LABEL,
  SYNTHETIC_TENANTS,
} from './syntheticTenants.js';
export {
  applicantActor,
  workflowReaderActor,
  regionalReviewerActor,
  nationalReviewerActor,
  workflowAdminActor,
  securityReviewerActor,
  unauthorizedActor,
  toAuthActor,
  toTransitionActor,
  type SyntheticActor,
} from './syntheticActors.js';
export {
  SYNTHETIC_ALL_PASS_FACTS,
  SYNTHETIC_EVIDENCE_CONTENT_TYPE,
  CLEAN_EVIDENCE_BYTES,
  EICAR_EVIDENCE_BYTES,
  sha256Hex,
} from './syntheticPayloads.js';
export {
  SYNTHETIC_FORBIDDEN_TERMS,
  assertNoForbiddenTerms,
  assertTelemetryHasNoSensitiveValues,
} from './assertions.js';
