/**
 * AffiliationApplication HTTP adapter — public surface.
 *
 * A thin transport that exposes the existing domain command boundary over HTTP. It never
 * bypasses {@link AffiliationApplicationService} / GovernanceKernel.transition(): see
 * docs/architecture/affiliation-http-adapter.md.
 */

export {
  handleAffiliationHttpTransition,
  errorToHttpResult,
  type AffiliationCommandExecutor,
  type AffiliationHttpRequest,
  type AffiliationHttpResult,
} from './AffiliationHttpAdapter.js';

export {
  createAffiliationHttpServer,
  type AffiliationHttpServerDeps,
} from './server.js';

export {
  createPgAffiliationApplicationService,
  createPgAffiliationHttpServer,
  createEvidenceHttpDeps,
} from './composition.js';

// Evidence payload transport surface (upload/download).
export {
  handleEvidenceUpload,
  handleEvidenceDownload,
  evidenceErrorToHttpResult,
  EVIDENCE_HEADER_NAMES,
  type EvidenceHttpDeps,
  type EvidenceHttpResult,
  type EvidenceReadPort,
  type EvidenceUploadService,
  type EvidenceUploadRequest,
  type EvidenceDownloadRequest,
  type EvidenceUploadResponseBody,
} from './evidence/index.js';

// Edge identity / auth surface.
export type { AuthActor, AuthContext } from './auth/AuthContext.js';
export {
  createAuthContextResolver,
  TRUSTED_HEADER_NAMES,
  type AuthContextResolver,
  type AuthResolveInput,
} from './auth/AuthContextResolver.js';
export { DemoAuthContextResolver } from './auth/DemoAuthContextResolver.js';
export { TrustedHeadersAuthContextResolver } from './auth/TrustedHeadersAuthContextResolver.js';
export { UnauthenticatedError, ForbiddenError } from './auth/AuthErrors.js';
