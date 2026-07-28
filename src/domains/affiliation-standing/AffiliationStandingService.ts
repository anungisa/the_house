/**
 * AffiliationStandingService — the thin, typed boundary between consumers and the Governance Kernel
 * for AffiliationStanding transitions.
 *
 * Responsibilities (ONLY): validate the request shape, resolve the command → trigger (1:1), map the
 * DTO into a kernel {@link TransitionInput}, call {@link GovernanceKernel.transition} exactly once,
 * and map the kernel result back into a response DTO. It CANNOT bypass the kernel — it has no
 * store/tx access and never mutates governed state, evaluates guards, or writes audit/evidence/
 * outbox. Unlike the finance boundary there is NO dynamic/derived trigger: every command maps to a
 * single fixed trigger, so the boundary carries no domain decision of its own.
 */

import type { TransitionInput, TransitionResult } from '../../governance/types/TransitionTypes.js';
import {
  STANDING_COMMANDS,
  triggerForStandingCommand,
  type StandingCommand,
} from './AffiliationStandingCommands.js';
import type {
  StandingTransitionRequest,
  StandingTransitionResponse,
} from './AffiliationStandingDtos.js';
import { validateStandingTransitionRequest } from './AffiliationStandingErrors.js';
import { toStandingResponse, toStandingTransitionInput } from './AffiliationStandingMapper.js';
import type { StandingTrigger } from './index.js';

/** Minimal kernel surface this boundary depends on. */
export interface StandingKernelPort {
  transition(input: TransitionInput): Promise<TransitionResult>;
}

export class AffiliationStandingService {
  constructor(private readonly kernel: StandingKernelPort) {}

  openStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse> {
    return this.runDirect('openStanding', request);
  }

  activateStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse> {
    return this.runDirect('activateStanding', request);
  }

  expireStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse> {
    return this.runDirect('expireStanding', request);
  }

  renewStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse> {
    return this.runDirect('renewStanding', request);
  }

  renewActiveStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse> {
    return this.runDirect('renewActiveStanding', request);
  }

  suspendStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse> {
    return this.runDirect('suspendStanding', request);
  }

  reinstateStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse> {
    return this.runDirect('reinstateStanding', request);
  }

  terminateStanding(request: StandingTransitionRequest): Promise<StandingTransitionResponse> {
    return this.runDirect('terminateStanding', request);
  }

  /**
   * Execute a governed command by name. Fails CLOSED for an unknown command; all standing commands
   * map 1:1 to a fixed trigger.
   */
  executeCommand(
    command: string,
    request: StandingTransitionRequest,
  ): Promise<StandingTransitionResponse> {
    return this.runDirect(command, request);
  }

  /** 1:1 governed path: resolve trigger → validate → map → kernel.transition() → map back. */
  private async runDirect(
    command: string,
    request: StandingTransitionRequest,
  ): Promise<StandingTransitionResponse> {
    const trigger = triggerForStandingCommand(command);
    return this.dispatch(trigger, request);
  }

  private async dispatch(
    trigger: StandingTrigger,
    request: StandingTransitionRequest,
  ): Promise<StandingTransitionResponse> {
    validateStandingTransitionRequest(request, trigger);
    const input = toStandingTransitionInput(request, trigger);
    const result = await this.kernel.transition(input);
    return toStandingResponse(result, request.standingId);
  }
}

/** Re-export the command catalog for callers that introspect the mapping. */
export { STANDING_COMMANDS };
export type { StandingCommand };
