/**
 * Synthetic tenant identities for the tenant-lifecycle confidence suite.
 *
 * These are deliberately NSO-GENERIC and hermetic: two opaque tenant UUIDs with neutral labels.
 * No sport, no organization name, no real-world identifier ever appears here. Tenant Alpha is the
 * subject under test; Tenant Beta exists only to prove isolation (Alpha data must never surface to
 * Beta, and a governed read for Beta must come back empty).
 *
 * `TENANT_ALPHA_ID` MUST equal the in-memory kernel harness tenant so the kernel-seeded lifecycle
 * data lands under Alpha. The harness asserts this invariant at construction time.
 */

/** The tenant under test. Aligned with the in-memory kernel harness tenant. */
export const TENANT_ALPHA_ID = '11111111-1111-1111-1111-111111111111';

/** A second, unrelated tenant used solely to prove cross-tenant isolation. */
export const TENANT_BETA_ID = '22222222-2222-2222-2222-222222222222';

/** Neutral display labels (never used for authorization; for readable assertions only). */
export const TENANT_ALPHA_LABEL = 'tenant-alpha';
export const TENANT_BETA_LABEL = 'tenant-beta';

/** Both synthetic tenants, for table-driven isolation checks. */
export const SYNTHETIC_TENANTS = [
  { id: TENANT_ALPHA_ID, label: TENANT_ALPHA_LABEL },
  { id: TENANT_BETA_ID, label: TENANT_BETA_LABEL },
] as const;
