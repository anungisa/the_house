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
} from './composition.js';
