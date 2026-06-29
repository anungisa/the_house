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
 *  - No real document/blob evidence storage, workflow executor, or payment processor.
 *  - AuthN/AuthZ at the edge is NOT implemented here: the adapter trusts the parsed
 *    `actor`/`tenantId` in the request. A real deployment must terminate auth in front of
 *    this adapter (gateway/identity) and derive these from verified claims.
 */

import { AffiliationApplicationService } from '../domains/affiliation/AffiliationApplicationService.js';
import { DomainBackedAffiliationGuardRepository } from '../domains/affiliation/DomainBackedAffiliationGuardRepository.js';
import { PgAffiliationApplicationStore } from '../domains/affiliation/PgAffiliationApplicationStore.js';
import { GuardRegistry } from '../governance/guards/GuardRegistry.js';
import { registerAffiliationGuards } from '../governance/guards/handlers.js';
import { GovernanceKernel } from '../governance/kernel/GovernanceKernel.js';
import { PgGovernanceStore } from '../governance/store/PgGovernanceStore.js';
import { createAffiliationHttpServer, type AffiliationHttpServerDeps } from './server.js';
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
  const kernel = new GovernanceKernel({ store: new PgGovernanceStore(), guards: registry });
  return new AffiliationApplicationService(kernel);
}

/**
 * Build (but do not start) the production HTTP server wired to the Pg-backed service.
 * The caller owns `listen()`; an explicit local/demo runtime script is a future pass.
 */
export function createPgAffiliationHttpServer(
  options?: Omit<AffiliationHttpServerDeps, 'executor'>,
): Server {
  return createAffiliationHttpServer({
    executor: createPgAffiliationApplicationService(),
    ...options,
  });
}
