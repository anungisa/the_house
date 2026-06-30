/**
 * Synthetic tenant-lifecycle test harness.
 *
 * Assembles the EXISTING governance/evidence/workflow/authorization/observability services into
 * one hermetic, in-memory rig so a single tenant-scoped lifecycle can be driven end-to-end:
 * application submission -> two-tier workflow review -> approved execution through the kernel ->
 * evidence ingestion (clean store vs. infected quarantine) -> quarantine disposition, with the
 * shared outbox, centralized authorization, and telemetry all observable.
 *
 * This harness adds NO production behavior. It only wires real components:
 *  - the Governance Kernel (sole authority for lifecycle transitions) via the shared kernel
 *    harness, with the two-tier {@link AffiliationWorkflowPlanner} enabled;
 *  - the in-memory workflow store/decision/execution services sharing the kernel's workflow
 *    backing;
 *  - the real malware-scan ingestion gate + evidence storage + quarantine service, with the
 *    quarantine outbox sharing the SAME backing array as the kernel's lifecycle outbox;
 *  - the centralized authorization policy and a trusted-headers HTTP edge over the read surface;
 *  - in-memory telemetry.
 *
 * Tenant Alpha is the subject; Tenant Beta is only ever used to prove isolation. Nothing here is
 * durable, contacts Azure/Entra/Service Bus/a real AV engine, or stores infected bytes.
 */

import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Bind the global fetch locally (Node >=20) so lint's no-undef is satisfied.
const { fetch } = globalThis;

import {
  buildKernelHarness,
  makeInput,
  reviewerActor,
  sequentialIds,
  type KernelHarness,
} from '../../helpers/affiliationKernel.js';
import { fixedClock } from '../../../src/shared/time/clock.js';
import {
  AffiliationWorkflowPlanner,
  AFFILIATION_NATIONAL_STEP_CODE,
  AFFILIATION_REGIONAL_STEP_CODE,
} from '../../../src/governance/workflow/AffiliationWorkflowPlanner.js';
import { InMemoryWorkflowStore } from '../../../src/governance/workflow/InMemoryWorkflowStore.js';
import { WorkflowDecisionService } from '../../../src/governance/workflow/WorkflowDecisionService.js';
import { ApprovedWorkflowExecutionService } from '../../../src/governance/workflow/ApprovedWorkflowExecutionService.js';
import { InMemoryOutboxStore } from '../../../src/governance/outbox/InMemoryOutboxStore.js';
import { InMemoryEvidenceStorage } from '../../../src/governance/evidence/InMemoryEvidenceStorage.js';
import { GovernanceEvidenceService } from '../../../src/governance/evidence/GovernanceEvidenceService.js';
import {
  EICAR_TEST_SIGNATURE,
  SignatureEvidenceMalwareScanner,
  evaluateEvidenceScan,
} from '../../../src/governance/evidence/scanning/index.js';
import { InMemoryEvidenceQuarantineStore } from '../../../src/governance/evidence/quarantine/InMemoryEvidenceQuarantineStore.js';
import { EvidenceQuarantineService } from '../../../src/governance/evidence/quarantine/EvidenceQuarantineService.js';
import type { QuarantineDisposition } from '../../../src/governance/evidence/quarantine/EvidenceQuarantineTypes.js';
import {
  InMemoryOrganizationRegistryStore,
  OrganizationRegistryService,
  type OrganizationType,
  type OrganizationView,
} from '../../../src/domains/organization-registry/index.js';
import {
  InMemoryParticipantRegistryStore,
  ParticipantRegistryService,
  type ParticipantView,
  type OrganizationParticipantView,
  type RelationshipType,
} from '../../../src/domains/participant-registry/index.js';
import { createAffiliationHttpServer } from '../../../src/http/server.js';
import {
  TrustedHeadersAuthContextResolver,
  TRUSTED_HEADER_NAMES,
} from '../../../src/http/auth/TrustedHeadersAuthContextResolver.js';
import { InMemoryTelemetry } from '../../../src/observability/index.js';
import type {
  ExecuteApprovedTransitionResult,
  TransitionActor,
  TransitionResult,
} from '../../../src/governance/types/TransitionTypes.js';
import type { OutboxRecord } from '../../../src/governance/outbox/OutboxStore.js';
import type { WorkflowListResult } from '../../../src/governance/workflow/WorkflowStore.js';
import { toAuthActor, type SyntheticActor } from './syntheticActors.js';
import { TENANT_ALPHA_ID } from './syntheticTenants.js';
import {
  CLEAN_EVIDENCE_BYTES,
  EICAR_EVIDENCE_BYTES,
  SYNTHETIC_EVIDENCE_CONTENT_TYPE,
} from './syntheticPayloads.js';

/** Stable clock used by the evidence/quarantine collaborators (deterministic timestamps). */
const SYNTHETIC_CLOCK = fixedClock(1_700_000_000_000);

/** Result of pushing an evidence payload through the real malware-scan ingestion gate. */
export type EvidenceGateOutcome =
  | { readonly outcome: 'stored'; readonly evidenceObjectId: string; readonly sha256: string }
  | {
      readonly outcome: 'quarantined';
      readonly quarantineEventId: string;
      readonly scanStatus: string;
      readonly threatName?: string;
    };

/** Minimal HTTP response capture for read-surface assertions. */
export interface HttpJsonResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** Identity projected onto trusted edge headers for an HTTP read-surface call. */
export interface HttpCaller {
  readonly tenantId: string;
  readonly actor: SyntheticActor;
}

export class SyntheticTenantLifecycleHarness {
  readonly kernel: KernelHarness;
  readonly telemetry: InMemoryTelemetry;
  readonly workflowStore: InMemoryWorkflowStore;
  readonly decisions: WorkflowDecisionService;
  readonly execution: ApprovedWorkflowExecutionService;
  readonly evidence: GovernanceEvidenceService;
  readonly evidenceStorage: InMemoryEvidenceStorage;
  readonly quarantine: EvidenceQuarantineService;
  readonly organizationRegistry: OrganizationRegistryService;
  readonly participantRegistry: ParticipantRegistryService;
  readonly tenantId: string;

  /** Evidence object ids that were actually STORED (clean uploads only). */
  private readonly storedEvidenceIds: string[] = [];
  private readonly scanner: SignatureEvidenceMalwareScanner;

  constructor() {
    this.kernel = buildKernelHarness({ workflowPlanner: new AffiliationWorkflowPlanner() });
    this.tenantId = this.kernel.tenantId;
    // Invariant: the kernel-seeded lifecycle data must land under Tenant Alpha.
    if (this.tenantId !== TENANT_ALPHA_ID) {
      throw new Error(
        `Harness tenant '${this.tenantId}' does not match TENANT_ALPHA_ID '${TENANT_ALPHA_ID}'.`,
      );
    }

    this.telemetry = new InMemoryTelemetry();

    // Workflow store/decision/execution all share the kernel's workflow backing.
    this.workflowStore = new InMemoryWorkflowStore(
      this.kernel.store.workflowBacking,
      sequentialIds('wf'),
    );
    this.decisions = new WorkflowDecisionService(
      new InMemoryWorkflowStore(this.kernel.store.workflowBacking, sequentialIds('wd')),
      { clock: SYNTHETIC_CLOCK },
    );
    this.execution = new ApprovedWorkflowExecutionService(this.kernel.kernel, this.workflowStore);

    // Evidence storage + governance binding service.
    this.evidenceStorage = new InMemoryEvidenceStorage({ clock: SYNTHETIC_CLOCK });
    this.evidence = new GovernanceEvidenceService(this.evidenceStorage, {
      generateId: sequentialIds('evd'),
    });

    // Malware-scan gate loaded with the EICAR test signature only.
    this.scanner = new SignatureEvidenceMalwareScanner({
      signatures: [EICAR_TEST_SIGNATURE],
      signatureVersion: 'synthetic-1.0.0',
      clock: SYNTHETIC_CLOCK,
    });

    // Quarantine outbox SHARES the kernel's lifecycle outbox backing array, so every outbox
    // effect (lifecycle + quarantine) is observable in one place.
    const quarantineOutbox = new InMemoryOutboxStore(
      SYNTHETIC_CLOCK,
      sequentialIds('qobx'),
      this.kernel.store.outboxRecords,
    );
    this.quarantine = new EvidenceQuarantineService(
      new InMemoryEvidenceQuarantineStore(quarantineOutbox, { clock: SYNTHETIC_CLOCK }),
      { generateId: sequentialIds('qev') },
    );

    // Organization registry shares the SAME lifecycle outbox backing array, so a registry signal
    // (organization.registry.created) is observable alongside the lifecycle/quarantine effects.
    // The registry NEVER calls the kernel or mutates governed state — it is reference structure.
    const registryOutbox = new InMemoryOutboxStore(
      SYNTHETIC_CLOCK,
      sequentialIds('robx'),
      this.kernel.store.outboxRecords,
    );
    const organizationStore = new InMemoryOrganizationRegistryStore(registryOutbox, {
      clock: SYNTHETIC_CLOCK,
    });
    this.organizationRegistry = new OrganizationRegistryService(organizationStore, {
      telemetry: this.telemetry,
      clock: SYNTHETIC_CLOCK,
      ids: sequentialIds('org'),
    });

    // Participant registry shares the SAME lifecycle outbox backing array, so a participant
    // signal (participant.registry.created / organization_linked) is observable alongside the
    // lifecycle/quarantine/organization effects. The registry NEVER calls the kernel or mutates
    // governed state, and it only READS the organization registry as same-tenant reference
    // structure — it never mutates it.
    const participantOutbox = new InMemoryOutboxStore(
      SYNTHETIC_CLOCK,
      sequentialIds('pobx'),
      this.kernel.store.outboxRecords,
    );
    this.participantRegistry = new ParticipantRegistryService(
      new InMemoryParticipantRegistryStore(participantOutbox, { clock: SYNTHETIC_CLOCK }),
      {
        telemetry: this.telemetry,
        clock: SYNTHETIC_CLOCK,
        ids: sequentialIds('ptp'),
        organizationReader: organizationStore,
      },
    );
  }

  // ---------------------------------------------------------------------------------------------
  // Lifecycle (always through the Governance Kernel)
  // ---------------------------------------------------------------------------------------------

  /** Submit a synthetic application (draft -> submitted). */
  submit(entityId: string): Promise<TransitionResult> {
    return this.kernel.kernel.transition(
      makeInput({ entityId, trigger: 'submit', idempotencyKey: `${entityId}-submit` }),
    );
  }

  /** Drive submitted -> under_review -> approve request (approval_required; creates the workflow). */
  async driveToApprovalRequest(entityId: string): Promise<TransitionResult> {
    await this.submit(entityId);
    await this.kernel.kernel.transition(
      makeInput({ entityId, trigger: 'review_start', idempotencyKey: `${entityId}-review` }),
    );
    return this.kernel.kernel.transition(
      makeInput({ entityId, trigger: 'approve', idempotencyKey: `${entityId}-approve` }),
    );
  }

  /** Record the first-tier (regional) sign-off decision. */
  recordRegionalDecision(
    workflowInstanceId: string,
    decision: 'approve' | 'reject' = 'approve',
  ): Promise<unknown> {
    return this.decisions.recordDecision({
      tenantId: this.tenantId,
      workflowInstanceId,
      stepCode: AFFILIATION_REGIONAL_STEP_CODE,
      decision,
      actorUserId: 'regional-reviewer-1',
    });
  }

  /** Record the second-tier (national) sign-off decision. */
  recordNationalDecision(
    workflowInstanceId: string,
    decision: 'approve' | 'reject' = 'approve',
  ): Promise<unknown> {
    return this.decisions.recordDecision({
      tenantId: this.tenantId,
      workflowInstanceId,
      stepCode: AFFILIATION_NATIONAL_STEP_CODE,
      decision,
      actorUserId: 'national-reviewer-1',
    });
  }

  /** Execute an approved workflow's original pending transition through the kernel. */
  executeApprovedWorkflow(args: {
    readonly workflowInstanceId: string;
    readonly idempotencyKey: string;
    readonly actor?: TransitionActor;
  }): Promise<ExecuteApprovedTransitionResult> {
    return this.execution.execute({
      tenantId: this.tenantId,
      workflowInstanceId: args.workflowInstanceId,
      actor: args.actor ?? reviewerActor(),
      idempotencyKey: args.idempotencyKey,
    });
  }

  /** Current governed state of an entity (read-only snapshot). */
  entityState(entityId: string): string | undefined {
    return this.kernel.store.entityStateSnapshots.find((e) => e.entityId === entityId)
      ?.currentState;
  }

  // ---------------------------------------------------------------------------------------------
  // Evidence ingestion (real malware-scan gate; infected bytes are NEVER stored)
  // ---------------------------------------------------------------------------------------------

  /**
   * Push an evidence payload through the REAL ingestion gate. A clean payload is stored via the
   * evidence abstraction; a blocked (infected) payload records sanitized quarantine metadata and
   * is NEVER stored as governed evidence.
   */
  async uploadEvidenceThroughGate(args: {
    readonly content: Uint8Array;
    readonly contentType?: string;
  }): Promise<EvidenceGateOutcome> {
    const contentType = args.contentType ?? SYNTHETIC_EVIDENCE_CONTENT_TYPE;
    const decision = await evaluateEvidenceScan(
      { scanner: this.scanner, required: true, clock: SYNTHETIC_CLOCK },
      { content: args.content, contentType, tenantId: this.tenantId },
    );

    if (decision.outcome === 'accept') {
      const stored = await this.evidence.storeEvidencePayload({
        tenantId: this.tenantId,
        content: args.content,
        contentType,
      });
      this.storedEvidenceIds.push(stored.evidenceObjectId);
      return { outcome: 'stored', evidenceObjectId: stored.evidenceObjectId, sha256: stored.metadata.sha256 };
    }

    // Blocked upload: record quarantine metadata only (no bytes are ever handed to storage).
    const contentHash = createHash('sha256').update(args.content).digest('hex');
    const recorded = await this.quarantine.recordBlockedUpload({
      tenantId: this.tenantId,
      contentType,
      sizeBytes: args.content.byteLength,
      contentHash,
      scanStatus: 'infected',
      scanner: decision.result.scanner,
      ...(decision.result.signatureVersion !== undefined
        ? { signatureVersion: decision.result.signatureVersion }
        : {}),
      ...(decision.result.threatName !== undefined ? { threatName: decision.result.threatName } : {}),
    });
    return {
      outcome: 'quarantined',
      quarantineEventId: recorded.quarantineEventId,
      scanStatus: decision.result.status,
      ...(decision.result.threatName !== undefined ? { threatName: decision.result.threatName } : {}),
    };
  }

  /** Convenience: upload the benign clean payload. */
  uploadCleanEvidence(): Promise<EvidenceGateOutcome> {
    return this.uploadEvidenceThroughGate({ content: CLEAN_EVIDENCE_BYTES });
  }

  /** Convenience: upload the EICAR test payload (always quarantined). */
  uploadInfectedEvidence(): Promise<EvidenceGateOutcome> {
    return this.uploadEvidenceThroughGate({ content: EICAR_EVIDENCE_BYTES });
  }

  /** How many evidence objects were actually STORED (clean uploads only). */
  storedEvidenceCount(): number {
    return this.storedEvidenceIds.length;
  }

  /** Record a security-operator disposition for a quarantine event. */
  disposeQuarantine(args: {
    readonly quarantineEventId: string;
    readonly disposition: QuarantineDisposition;
    readonly actorUserId?: string;
  }): Promise<unknown> {
    return this.quarantine.recordQuarantineDisposition({
      tenantId: this.tenantId,
      quarantineEventId: args.quarantineEventId,
      disposition: args.disposition,
      actorUserId: args.actorUserId ?? 'security-reviewer-1',
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Read surfaces & outbox observation
  // ---------------------------------------------------------------------------------------------

  /** List workflows for a tenant via the in-memory read store (tenant-scoped). */
  listWorkflows(tenantId: string): Promise<WorkflowListResult> {
    return this.workflowStore.listWorkflows(tenantId, {});
  }

  /** All outbox records enqueued so far (lifecycle + quarantine), newest-inclusive snapshot. */
  outboxRecords(): readonly OutboxRecord[] {
    return [...this.kernel.store.outboxRecords];
  }

  /** Distinct outbox message types observed so far. */
  outboxMessageTypes(): readonly string[] {
    return Array.from(new Set(this.outboxRecords().map((r) => r.messageType)));
  }

  /**
   * Drive the workflow admin LIST endpoint over the real native HTTP server using the
   * trusted-headers edge, so centralized authorization and tenant scoping are exercised exactly
   * as in production. Starts and stops a throwaway server per call (hermetic).
   */
  async httpListWorkflows(caller: HttpCaller): Promise<HttpJsonResponse> {
    const server = createAffiliationHttpServer({
      executor: {
        executeCommand: () =>
          Promise.reject(new Error('transition executor is not exercised by this read test')),
      },
      resolver: new TrustedHeadersAuthContextResolver(),
      workflowRead: { readStore: this.workflowStore, telemetry: this.telemetry },
      telemetry: this.telemetry,
    });

    try {
      const port = await listen(server);
      const response = await fetch(`http://127.0.0.1:${port}/v1/workflows`, {
        method: 'GET',
        headers: {
          [TRUSTED_HEADER_NAMES.tenantId]: caller.tenantId,
          [TRUSTED_HEADER_NAMES.actorUserId]: caller.actor.userId,
          [TRUSTED_HEADER_NAMES.actorRoleKeys]: caller.actor.roleKeys.join(','),
        },
      });
      const body = (await response.json()) as Record<string, unknown>;
      return { status: response.status, body };
    } finally {
      await close(server);
    }
  }

  /** Project a synthetic actor to the authenticated identity the authz policy reasons about. */
  authActor(actor: SyntheticActor): ReturnType<typeof toAuthActor> {
    return toAuthActor(actor);
  }

  // ---------------------------------------------------------------------------------------------
  // Organization registry (reference structure; NEVER calls the kernel or mutates governed state)
  // ---------------------------------------------------------------------------------------------

  /**
   * Register an organization as a one-way PROJECTION of an already-approved affiliation
   * application. This neither calls the kernel nor mutates governed state — it records reference
   * structure derived from the approved application, with its id retained as the source reference.
   */
  registerOrganizationFromApprovedAffiliation(args: {
    readonly affiliationApplicationId: string;
    readonly organizationType?: OrganizationType;
    readonly displayName?: string;
    readonly tenantId?: string;
  }): Promise<OrganizationView> {
    return this.organizationRegistry.registerOrganizationFromApprovedAffiliationApplication({
      tenantId: args.tenantId ?? this.tenantId,
      affiliationApplicationId: args.affiliationApplicationId,
      organizationType: args.organizationType ?? 'local',
      displayName: args.displayName ?? 'Registered Local Organization',
    });
  }

  /** Tenant-scoped registry detail read. */
  getOrganization(tenantId: string, organizationId: string): Promise<OrganizationView | undefined> {
    return this.organizationRegistry.getOrganization(tenantId, organizationId);
  }

  /** Tenant-scoped registry list read (organization ids only). */
  async listOrganizationIds(tenantId: string): Promise<readonly string[]> {
    const result = await this.organizationRegistry.listOrganizations(tenantId);
    return result.items.map((o) => o.organizationId);
  }

  // ---------------------------------------------------------------------------------------------
  // Participant registry (reference structure; NEVER calls the kernel or mutates governed state)
  // ---------------------------------------------------------------------------------------------

  /**
   * Record a participant as tenant-scoped reference structure. This neither calls the kernel nor
   * mutates governed state — it is a generic person/member record, with no registration,
   * eligibility, or sport-specific meaning attached.
   */
  registerParticipant(args: {
    readonly displayName?: string;
    readonly tenantId?: string;
    readonly participantId?: string;
  }): Promise<ParticipantView> {
    return this.participantRegistry.createParticipant({
      tenantId: args.tenantId ?? this.tenantId,
      ...(args.participantId !== undefined ? { participantId: args.participantId } : {}),
      displayName: args.displayName ?? 'Reference Person',
      status: 'active',
    });
  }

  /** Link a participant to a same-tenant organization (read-only org reference; idempotent). */
  linkParticipantToOrganization(args: {
    readonly organizationId: string;
    readonly participantId: string;
    readonly relationshipType?: RelationshipType;
    readonly tenantId?: string;
  }): Promise<OrganizationParticipantView> {
    return this.participantRegistry.linkParticipantToOrganization({
      tenantId: args.tenantId ?? this.tenantId,
      organizationId: args.organizationId,
      participantId: args.participantId,
      relationshipType: args.relationshipType ?? 'member',
    });
  }

  /** Tenant-scoped participant detail read. */
  getParticipant(tenantId: string, participantId: string): Promise<ParticipantView | undefined> {
    return this.participantRegistry.getParticipant(tenantId, participantId);
  }

  /** Tenant-scoped participant list read (participant ids only). */
  async listParticipantIds(tenantId: string): Promise<readonly string[]> {
    const result = await this.participantRegistry.listParticipants(tenantId);
    return result.items.map((p) => p.participantId);
  }
}

/** Start listening on an ephemeral port and resolve it. */
function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });
}

/** Close the server. */
function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err !== undefined && err !== null ? reject(err) : resolve()));
  });
}
