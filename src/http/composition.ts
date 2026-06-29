/**
 * Composition root for the AffiliationApplication HTTP adapter.
 *
 * Wires the PRODUCTION-intended dependency graph and keeps that wiring in ONE place:
 *
 *   HTTP adapter (server.ts / AffiliationHttpAdapter.ts)
 *     → AffiliationApplicationService            (domain command boundary)
 *       → GovernanceKernel.transition()          (sole authority for governed transitions)
 *         → PgGovernanceStore                     (governed tables + transactional outbox, RLS)
 *         → GuardRegistry + registerAffiliationGuards(
 *             DomainBackedAffiliationGuardRepository(PgAffiliationApplicationStore))
 *                                                 (guards read PERSISTED domain facts)
 *
 * The adapter adds NO new authority: it only translates HTTP ⇄ the existing boundary.
 *
 * Intentional stubs at this layer (unchanged by this pass; tracked for later):
 *  - Outbox publishing still uses the Noop Service Bus publisher (no real broker in v1).
 *  - Evidence payload storage defaults to in-memory (durable `azure_blob` is config-gated);
 *    no workflow executor or payment processor.
 *  - Edge identity is established by an {@link AuthContextResolver} selected from AUTH_MODE
 *    (`demo` = LOCAL/DEMO body-trusted default; `trusted_headers` = identity derived from
 *    trusted headers injected by a verifying edge). This is NOT token/JWT validation: a real
 *    deployment must still terminate authentication in front of this adapter
 *    (gateway/identity provider) so the trusted headers can be trusted.
 */

import { loadConfig } from '../config/index.js';
import { AffiliationApplicationService } from '../domains/affiliation/AffiliationApplicationService.js';
import { DomainBackedAffiliationGuardRepository } from '../domains/affiliation/DomainBackedAffiliationGuardRepository.js';
import { PgAffiliationApplicationStore } from '../domains/affiliation/PgAffiliationApplicationStore.js';
import { GuardRegistry } from '../governance/guards/GuardRegistry.js';
import { registerAffiliationGuards } from '../governance/guards/handlers.js';
import { GovernanceKernel } from '../governance/kernel/GovernanceKernel.js';
import { PgGovernanceStore } from '../governance/store/PgGovernanceStore.js';
import { AffiliationWorkflowPlanner } from '../governance/workflow/AffiliationWorkflowPlanner.js';
import { PgWorkflowStore } from '../governance/workflow/PgWorkflowStore.js';
import { WorkflowDecisionService } from '../governance/workflow/WorkflowDecisionService.js';
import { createEvidenceStorage } from '../governance/evidence/EvidenceStorageFactory.js';
import { GovernanceEvidenceService } from '../governance/evidence/GovernanceEvidenceService.js';
import { createAuthContextResolver } from './auth/AuthContextResolver.js';
import { createAffiliationHttpServer, type AffiliationHttpServerDeps } from './server.js';
import type { EvidenceHttpDeps } from './evidence/index.js';
import type { WorkflowHttpDeps } from './workflow/index.js';
import type { Server } from 'node:http';

/**
 * Build the production-intended {@link AffiliationApplicationService} backed by PostgreSQL.
 * Guards read PERSISTED affiliation domain facts (never caller payloads). Uses the shared
 * pool (DATABASE_URL) via the Pg stores.
 */
export function createPgAffiliationApplicationService(): AffiliationApplicationService {
  const registry = new GuardRegistry();
  registerAffiliationGuards(
    registry,
    new DomainBackedAffiliationGuardRepository(new PgAffiliationApplicationStore()),
  );
  const kernel = new GovernanceKernel({
    store: new PgGovernanceStore(),
    guards: registry,
    workflowPlanner: new AffiliationWorkflowPlanner(),
  });
  return new AffiliationApplicationService(kernel);
}

/**
 * Build the evidence HTTP transport from the evidence-storage config. The provider defaults
 * to in-memory (no Azure required); `azure_blob` is config-gated. This is governance
 * infrastructure only — it never touches governed tables or the kernel.
 */
export function createEvidenceHttpDeps(): EvidenceHttpDeps {
  const config = loadConfig();
  const storage = createEvidenceStorage(config.evidenceStorage);
  return {
    uploadService: new GovernanceEvidenceService(storage),
    storage,
    maxUploadBytes: config.evidenceStorage.uploadMaxBytes,
  };
}

/**
 * Build the workflow decision HTTP transport backed by PostgreSQL. The decision service
 * records review metadata (approve/reject) through the RLS-enforced {@link PgWorkflowStore};
 * it never mutates governed state and never executes the pending lifecycle transition.
 */
export function createWorkflowHttpDeps(): WorkflowHttpDeps {
  return {
    decisionService: new WorkflowDecisionService(new PgWorkflowStore()),
  };
}

/**
 * Build (but do not start) the production HTTP server wired to the Pg-backed service.
 * The edge-identity resolver is selected from AUTH_MODE (see {@link createAuthContextResolver}).
 * The caller owns `listen()`; an explicit local/demo runtime script is a future pass.
 */
export function createPgAffiliationHttpServer(
  options?: Omit<AffiliationHttpServerDeps, 'executor'>,
): Server {
  const config = loadConfig();
  return createAffiliationHttpServer({
    executor: createPgAffiliationApplicationService(),
    resolver: createAuthContextResolver(config),
    evidence: createEvidenceHttpDeps(),
    workflow: createWorkflowHttpDeps(),
    ...options,
  });
}
