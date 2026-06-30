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
import { ApprovedWorkflowExecutionService } from '../governance/workflow/ApprovedWorkflowExecutionService.js';
import { PgWorkflowStore } from '../governance/workflow/PgWorkflowStore.js';
import { WorkflowDecisionService } from '../governance/workflow/WorkflowDecisionService.js';
import { createEvidenceStorage } from '../governance/evidence/EvidenceStorageFactory.js';
import { GovernanceEvidenceService } from '../governance/evidence/GovernanceEvidenceService.js';
import { createEvidenceMalwareScanner } from '../governance/evidence/scanning/index.js';
import {
  EvidenceQuarantineService,
  PgEvidenceQuarantineStore,
} from '../governance/evidence/quarantine/index.js';
import { createAuthContextResolver } from './auth/AuthContextResolver.js';
import { createDatabaseReadinessCheck } from './readiness.js';
import { createAffiliationHttpServer, type AffiliationHttpServerDeps } from './server.js';
import { queryRaw } from '../db/pool.js';
import { createTelemetry, type Telemetry } from '../observability/index.js';
import type { EvidenceHttpDeps, EvidenceQuarantineHttpDeps } from './evidence/index.js';
import type {
  WorkflowExecutionHttpDeps,
  WorkflowHttpDeps,
  WorkflowReadHttpDeps,
} from './workflow/index.js';
import type { Server } from 'node:http';

/**
 * Build the production-intended {@link GovernanceKernel} backed by PostgreSQL. Guards read
 * PERSISTED affiliation domain facts (never caller payloads); the review-workflow planner is
 * wired so approval-required transitions create two-tier review metadata atomically. Shared by
 * the domain command boundary and the approved-workflow execution path.
 */
export function createPgGovernanceKernel(): GovernanceKernel {
  const registry = new GuardRegistry();
  registerAffiliationGuards(
    registry,
    new DomainBackedAffiliationGuardRepository(new PgAffiliationApplicationStore()),
  );
  return new GovernanceKernel({
    store: new PgGovernanceStore(),
    guards: registry,
    workflowPlanner: new AffiliationWorkflowPlanner(),
  });
}

/**
 * Build the production-intended {@link AffiliationApplicationService} backed by PostgreSQL.
 * Guards read PERSISTED affiliation domain facts (never caller payloads). Uses the shared
 * pool (DATABASE_URL) via the Pg stores.
 */
export function createPgAffiliationApplicationService(): AffiliationApplicationService {
  return new AffiliationApplicationService(createPgGovernanceKernel());
}

/**
 * Build the single, shared {@link Telemetry} instance from the observability config. Returns a
 * no-op when observability is disabled or the exporter is `noop`; otherwise the configured
 * exporter (`console`/`memory`). This is the ONE place runtime telemetry is constructed so the
 * server and every adapter share an identical, behavior-neutral sink.
 */
export function createPgTelemetry(): Telemetry {
  return createTelemetry(loadConfig().observability);
}

/**
 * Build the evidence HTTP transport from the evidence-storage config. The provider defaults
 * to in-memory (no Azure required); `azure_blob` is config-gated. When quarantine is enabled
 * (default), blocked uploads are recorded as sanitized security events that emit an outbox
 * event through the RLS-enforced {@link PgEvidenceQuarantineStore} — the infected bytes are
 * never stored. This is governance infrastructure only — it never touches governed tables or
 * the kernel.
 */
export function createEvidenceHttpDeps(telemetry?: Telemetry): EvidenceHttpDeps {
  const config = loadConfig();
  const storage = createEvidenceStorage(config.evidenceStorage);
  return {
    uploadService: new GovernanceEvidenceService(storage),
    storage,
    maxUploadBytes: config.evidenceStorage.uploadMaxBytes,
    scanner: createEvidenceMalwareScanner(config.evidenceMalwareScanning),
    scanRequired: config.evidenceMalwareScanning.required,
    ...(telemetry !== undefined ? { telemetry } : {}),
    ...(config.evidenceQuarantine.enabled
      ? {
          quarantine: new EvidenceQuarantineService(new PgEvidenceQuarantineStore(), {
            maxRetries: config.outbox.maxRetries,
          }),
          includeQuarantineEventIdInResponse: config.evidenceQuarantine.includeEventIdInResponse,
        }
      : {}),
  };
}

/**
 * Build the evidence QUARANTINE review HTTP transport backed by PostgreSQL. Operators list/read
 * quarantine events and record dispositions through the RLS-enforced
 * {@link PgEvidenceQuarantineStore}; a disposition advances only the quarantine event's own
 * status and emits a sanitized outbox event. It never stores payload bytes, creates governed
 * evidence, mutates governed state, or invokes the kernel.
 */
export function createEvidenceQuarantineHttpDeps(telemetry?: Telemetry): EvidenceQuarantineHttpDeps {
  const config = loadConfig();
  return {
    reviewer: new EvidenceQuarantineService(new PgEvidenceQuarantineStore(), {
      maxRetries: config.outbox.maxRetries,
    }),
    ...(telemetry !== undefined ? { telemetry } : {}),
  };
}

/**
 * Build the workflow decision HTTP transport backed by PostgreSQL. The decision service
 * records review metadata (approve/reject) through the RLS-enforced {@link PgWorkflowStore};
 * it never mutates governed state and never executes the pending lifecycle transition.
 */
export function createWorkflowHttpDeps(telemetry?: Telemetry): WorkflowHttpDeps {
  return {
    decisionService: new WorkflowDecisionService(new PgWorkflowStore()),
    ...(telemetry !== undefined ? { telemetry } : {}),
  };
}

/**
 * Build the workflow execution HTTP transport backed by PostgreSQL. Resolves an approved
 * workflow instance to its governing transition request and drives the GOVERNED execution of
 * the original pending transition through the Governance Kernel (exactly once). It never
 * mutates governed state itself and is never invoked by the decision endpoint.
 */
export function createWorkflowExecutionHttpDeps(telemetry?: Telemetry): WorkflowExecutionHttpDeps {
  return {
    executor: new ApprovedWorkflowExecutionService(
      createPgGovernanceKernel(),
      new PgWorkflowStore(),
    ),
    ...(telemetry !== undefined ? { telemetry } : {}),
  };
}

/**
 * Build the read-only workflow admin transport backed by PostgreSQL. Reads run through the
 * RLS-enforced {@link PgWorkflowStore}; the adapter is read-only and never mutates governed
 * state, records decisions, or executes a transition.
 */
export function createWorkflowReadHttpDeps(telemetry?: Telemetry): WorkflowReadHttpDeps {
  return {
    readStore: new PgWorkflowStore(),
    ...(telemetry !== undefined ? { telemetry } : {}),
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
  const telemetry = createTelemetry(config.observability);
  return createAffiliationHttpServer({
    executor: createPgAffiliationApplicationService(),
    resolver: createAuthContextResolver(config),
    telemetry,
    evidence: createEvidenceHttpDeps(telemetry),
    ...(config.evidenceQuarantine.enabled
      ? { evidenceQuarantine: createEvidenceQuarantineHttpDeps(telemetry) }
      : {}),
    workflow: createWorkflowHttpDeps(telemetry),
    workflowExecution: createWorkflowExecutionHttpDeps(telemetry),
    workflowRead: createWorkflowReadHttpDeps(telemetry),
    readiness: createDatabaseReadinessCheck({
      // Tenant-agnostic, read-only probe: never touches governed/tenant-owned tables.
      probe: () => queryRaw('SELECT 1'),
    }),
    ...options,
  });
}
