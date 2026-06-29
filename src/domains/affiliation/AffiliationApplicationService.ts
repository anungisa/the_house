/**
 * AffiliationApplicationService — the thin, typed boundary between consumers and the
 * Governance Kernel.
 *
 * Responsibilities (ONLY):
 *  1. validate the request shape,
 *  2. resolve the command → trigger,
 *  3. map the DTO into a kernel {@link TransitionInput},
 *  4. call {@link GovernanceKernel.transition} exactly once,
 *  5. map the kernel result into a response DTO.
 *
 * Explicit NON-responsibilities (owned by the kernel): mutating `entity_state`/status,
 * evaluating guards, writing audit/evidence/outbox, enforcing permissions/tenant
 * isolation/idempotency. This layer cannot bypass the kernel — it has no store/tx access.
 */

import type { TransitionInput, TransitionResult } from '../../governance/types/TransitionTypes.js';
import {
  AFFILIATION_APPLICATION_COMMANDS,
  triggerForCommand,
  type AffiliationApplicationCommand,
} from './AffiliationApplicationCommands.js';
import type {
  AffiliationApplicationTransitionRequest,
  AffiliationApplicationTransitionResponse,
} from './AffiliationApplicationDtos.js';
import { validateTransitionRequest } from './AffiliationApplicationErrors.js';
import { toResponse, toTransitionInput } from './AffiliationApplicationMapper.js';

/**
 * Minimal kernel surface this boundary depends on. Depending on the method (not the
 * concrete {@link GovernanceKernel}) keeps the service unit-testable with a fake kernel
 * and prevents the boundary from reaching past `transition()`.
 */
export interface AffiliationKernelPort {
  transition(input: TransitionInput): Promise<TransitionResult>;
}

export class AffiliationApplicationService {
  constructor(private readonly kernel: AffiliationKernelPort) {}

  // --- Named commands: each maps to exactly one FSM trigger (no new triggers). ---

  submitAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('submitAffiliationApplication', request);
  }

  startAffiliationReview(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('startAffiliationReview', request);
  }

  approveAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('approveAffiliationApplication', request);
  }

  rejectAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('rejectAffiliationApplication', request);
  }

  activateAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('activateAffiliationApplication', request);
  }

  suspendAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('suspendAffiliationApplication', request);
  }

  reinstateAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('reinstateAffiliationApplication', request);
  }

  revokeAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('revokeAffiliationApplication', request);
  }

  closeAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('closeAffiliationApplication', request);
  }

  archiveAffiliationApplication(
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run('archiveAffiliationApplication', request);
  }

  /**
   * Execute a governed transition by command name. Fails CLOSED for an unknown command.
   * Used by the framework-agnostic handler; typed callers should prefer the named methods.
   */
  executeCommand(
    command: string,
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    return this.run(command, request);
  }

  /** Single governed path: validate → map → kernel.transition() (exactly once) → map back. */
  private async run(
    command: string,
    request: AffiliationApplicationTransitionRequest,
  ): Promise<AffiliationApplicationTransitionResponse> {
    const trigger = triggerForCommand(command);
    validateTransitionRequest(request, trigger);
    const input = toTransitionInput(request, trigger);
    const result = await this.kernel.transition(input);
    return toResponse(result, request.applicationId);
  }
}

/** Re-export for callers that want to introspect the command/trigger mapping. */
export { AFFILIATION_APPLICATION_COMMANDS };
export type { AffiliationApplicationCommand };
