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
import { AffiliationActiveStandingSerializationResolver } from '../domains/affiliation/AffiliationActiveStandingSerializationResolver.js';
import { AFFILIATION_APPLICATION_ENTITY_TYPE } from '../domains/affiliation/index.js';
import {
  AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE,
  DomainBackedFinancialGuardRepository,
  FinancialObligationSerializationResolver,
  PgFinancialClearanceReader,
  PgFinancialObligationEffect,
  PgFinancialObligationStore,
  FinancialObligationService,
} from '../domains/affiliation-finance/index.js';
import {
  AFFILIATION_STANDING_ENTITY_TYPE,
  AffiliationStandingSerializationResolver,
  AffiliationStandingService,
  DomainBackedStandingGuardRepository,
  PgAffiliationStandingEffect,
  PgAffiliationStandingStore,
} from '../domains/affiliation-standing/index.js';
import { GuardRegistry } from '../governance/guards/GuardRegistry.js';
import { registerAffiliationGuards } from '../governance/guards/handlers.js';
import { registerFinancialObligationGuards } from '../governance/guards/financialHandlers.js';
import { registerStandingGuards } from '../governance/guards/standingHandlers.js';
import { DefaultPermissionChecker } from '../governance/permissions/PermissionChecker.js';
import { FinancialObligationPermissionChecker } from '../governance/permissions/FinancialObligationPermissionChecker.js';
import { StandingPermissionChecker } from '../governance/permissions/StandingPermissionChecker.js';
import { systemClock } from '../shared/time/clock.js';
import { GovernanceKernel } from '../governance/kernel/GovernanceKernel.js';
import type { TransitionSerializationKeyResolver } from '../governance/kernel/ports.js';
import type { TransitionDomainEffect } from '../governance/kernel/ports.js';
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
import type { OrganizationReadHttpDeps } from './organization/index.js';
import type { ParticipantWriteHttpDeps } from './participant/index.js';
import type { FacilityReadHttpDeps, FacilityWriteHttpDeps } from './facility/index.js';
import { PgOrganizationRegistryStore } from '../domains/organization-registry/index.js';
import {
  ParticipantRegistryService,
  PgParticipantRegistryStore,
} from '../domains/participant-registry/index.js';
import {
  FacilityRegistryService,
  PgFacilityRegistryStore,
} from '../domains/facility-registry/index.js';
import type { Server } from 'node:http';

/**
 * Build the production-intended {@link GovernanceKernel} backed by PostgreSQL. Guards read
 * PERSISTED domain facts (never caller payloads); the review-workflow planner is wired so
 * approval-required transitions create two-tier review metadata atomically. Shared by the
 * domain command boundary and the approved-workflow execution path.
 *
 * A SINGLE shared kernel serves BOTH governed entity types — AffiliationApplication and
 * AffiliationFinancialObligation:
 *  - Affiliation guards read affiliation facts; the AFFILIATION_FINANCIALLY_CLEARED guard also
 *    consults the finance clearance reader so activation is blocked while a blocking obligation
 *    is unresolved.
 *  - Financial guards read persisted reconciliation facts; the financial permission checker
 *    enforces segregated financial authority (falling back to the default checker for
 *    affiliation transitions).
 *  - The financial domain effect persists obligation facts INSIDE the governed transaction, and
 *    the financial serialization resolver serializes concurrent reconciliation on one obligation.
 */
export function createPgGovernanceKernel(): GovernanceKernel {
  const registry = new GuardRegistry();
  const affiliationStore = new PgAffiliationApplicationStore();
  const financialStore = new PgFinancialObligationStore();
  const standingStore = new PgAffiliationStandingStore();

  // Affiliation guards gain the finance clearance reader so activation observes financial state.
  registerAffiliationGuards(
    registry,
    new DomainBackedAffiliationGuardRepository(affiliationStore, new PgFinancialClearanceReader()),
  );
  // Financial reconciliation guards read persisted amounts/confirmations.
  registerFinancialObligationGuards(
    registry,
    new DomainBackedFinancialGuardRepository(financialStore),
  );
  // Standing term/renewal-window guards read the persisted effective period against the clock.
  registerStandingGuards(
    registry,
    new DomainBackedStandingGuardRepository(standingStore, systemClock),
  );

  const serializationKeyResolvers = new Map<string, TransitionSerializationKeyResolver>([
    [
      AFFILIATION_APPLICATION_ENTITY_TYPE,
      new AffiliationActiveStandingSerializationResolver(affiliationStore),
    ],
    [
      AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE,
      new FinancialObligationSerializationResolver(),
    ],
    [AFFILIATION_STANDING_ENTITY_TYPE, new AffiliationStandingSerializationResolver()],
  ]);

  // Financial + standing facts persist atomically with the governed transition via the effect port.
  const domainEffects = new Map<string, TransitionDomainEffect>([
    [AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE, new PgFinancialObligationEffect()],
    [AFFILIATION_STANDING_ENTITY_TYPE, new PgAffiliationStandingEffect()],
  ]);

  return new GovernanceKernel({
    store: new PgGovernanceStore(),
    guards: registry,
    workflowPlanner: new AffiliationWorkflowPlanner(),
    // Segregated financial authority for AffiliationFinancialObligation and segregated standing
    // authority for AffiliationStanding; default reviewer-class policy for every other entity type.
    permissions: new StandingPermissionChecker(
      new FinancialObligationPermissionChecker(new DefaultPermissionChecker()),
    ),
    // Exactly-once activation: serialize concurrent transitions that grant ACTIVE affiliation
    // standing (activate / reinstate) per tenant + subject + season, concurrent reconciliation of
    // ONE financial obligation, and concurrent renewal/expiry of ONE standing, via
    // transaction-scoped advisory locks.
    serializationKeyResolvers,
    domainEffects,
  });
}

/**
 * Build the production-intended {@link AffiliationStandingService} backed by PostgreSQL. Shares the
 * SAME kernel wiring as the affiliation and finance services (guards, effects, serialization,
 * authority). Standing facts persist atomically with the governed transition.
 */
export function createPgAffiliationStandingService(): AffiliationStandingService {
  return new AffiliationStandingService(createPgGovernanceKernel());
}

/**
 * Build the production-intended {@link FinancialObligationService} backed by PostgreSQL. Shares
 * the SAME kernel wiring as the affiliation service (guards, effects, serialization, authority).
 * The reconcile decision reads persisted amounts via the RLS-enforced financial store.
 */
export function createPgFinancialObligationService(): FinancialObligationService {
  return new FinancialObligationService(
    createPgGovernanceKernel(),
    new PgFinancialObligationStore(),
  );
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
 * Build the read-only Organization Registry transport backed by PostgreSQL. Reads run through
 * the RLS-enforced {@link PgOrganizationRegistryStore}; the adapter is read-only and never
 * mutates the registry, enqueues outbox messages, touches governed state, or invokes the kernel.
 */
export function createOrganizationReadHttpDeps(telemetry?: Telemetry): OrganizationReadHttpDeps {
  return {
    readStore: new PgOrganizationRegistryStore(),
    ...(telemetry !== undefined ? { telemetry } : {}),
  };
}

/**
 * Build the Participant Registry WRITE transport (create + update + reference-data status
 * transition + organization-link create) backed by PostgreSQL. The command service, the write
 * pre-check read port, and the organization-existence reader all run through RLS-enforced Pg
 * stores, so they see exactly the same tenant-scoped rows. The service owns the transactional
 * outbox; the adapter never enqueues directly, never touches governed lifecycle state, never
 * invokes the kernel, and never mutates the read-only Organization Registry. Changing an existing
 * relationship's status is deliberately NOT part of this surface.
 */
export function createParticipantWriteHttpDeps(telemetry?: Telemetry): ParticipantWriteHttpDeps {
  const store = new PgParticipantRegistryStore();
  const service = new ParticipantRegistryService(store, {
    organizationReader: new PgOrganizationRegistryStore(),
    ...(telemetry !== undefined ? { telemetry } : {}),
  });
  return {
    service,
    readStore: store,
    ...(telemetry !== undefined ? { telemetry } : {}),
  };
}

/**
 * Build the read-only Facility Registry transport backed by PostgreSQL. Reads run through the
 * RLS-enforced {@link PgFacilityRegistryStore}; the adapter is read-only and never mutates the
 * registry, enqueues outbox messages, touches governed state, invokes the kernel, or mutates the
 * Organization Registry.
 */
export function createFacilityReadHttpDeps(telemetry?: Telemetry): FacilityReadHttpDeps {
  return {
    readStore: new PgFacilityRegistryStore(),
    ...(telemetry !== undefined ? { telemetry } : {}),
  };
}

/**
 * Build the Facility Registry WRITE transport (phase 1: create + update) backed by PostgreSQL. The
 * command service, the write pre-check read port, and the organization-existence reader all run
 * through RLS-enforced Pg stores, so they see exactly the same tenant-scoped rows. The service owns
 * the transactional outbox; the adapter never enqueues directly, never touches governed lifecycle
 * state, never invokes the kernel, and never mutates the read-only Organization Registry. A facility
 * STATUS transition is deliberately NOT part of this surface (a separate future pass).
 */
export function createFacilityWriteHttpDeps(telemetry?: Telemetry): FacilityWriteHttpDeps {
  const store = new PgFacilityRegistryStore();
  const service = new FacilityRegistryService(store, {
    organizationReader: new PgOrganizationRegistryStore(),
    ...(telemetry !== undefined ? { telemetry } : {}),
  });
  return {
    service,
    readStore: store,
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
    financialExecutor: createPgFinancialObligationService(),
    standingExecutor: createPgAffiliationStandingService(),
    resolver: createAuthContextResolver(config),
    telemetry,
    evidence: createEvidenceHttpDeps(telemetry),
    ...(config.evidenceQuarantine.enabled
      ? { evidenceQuarantine: createEvidenceQuarantineHttpDeps(telemetry) }
      : {}),
    workflow: createWorkflowHttpDeps(telemetry),
    workflowExecution: createWorkflowExecutionHttpDeps(telemetry),
    workflowRead: createWorkflowReadHttpDeps(telemetry),
    organizationRead: createOrganizationReadHttpDeps(telemetry),
    participantWrite: createParticipantWriteHttpDeps(telemetry),
    facilityRead: createFacilityReadHttpDeps(telemetry),
    facilityWrite: createFacilityWriteHttpDeps(telemetry),
    readiness: createDatabaseReadinessCheck({
      // Tenant-agnostic, read-only probe: never touches governed/tenant-owned tables.
      probe: () => queryRaw('SELECT 1'),
    }),
    ...options,
  });
}
