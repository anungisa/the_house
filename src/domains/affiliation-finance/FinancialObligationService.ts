/**
 * FinancialObligationService — the thin, typed boundary between consumers and the Governance
 * Kernel for AffiliationFinancialObligation transitions.
 *
 * Responsibilities (ONLY): validate the request shape, resolve the command → trigger, map the DTO
 * into a kernel {@link TransitionInput}, call {@link GovernanceKernel.transition} exactly once, and
 * map the kernel result back into a response DTO. It CANNOT bypass the kernel — it has no store/tx
 * access and never mutates governed state, evaluates guards, or writes audit/evidence/outbox.
 *
 * The ONE piece of domain logic here is the DETERMINISTIC reconcile decision: `reconcileObligation`
 * reads the obligation's PERSISTED expected vs latest confirmed amount and drives `reconcile` (equal)
 * or `record_mismatch` (differ / unconfirmed). The caller never chooses the outcome; the kernel
 * guards re-verify the same persisted facts and fail closed, so a mis-driven trigger cannot produce
 * a wrong state.
 */

import type { TransitionInput, TransitionResult } from '../../governance/types/TransitionTypes.js';
import {
  FINANCIAL_OBLIGATION_COMMANDS,
  RECONCILE_OBLIGATION_COMMAND,
  triggerForFinancialCommand,
  type FinancialObligationCommand,
} from './FinancialObligationCommands.js';
import type {
  FinancialObligationTransitionRequest,
  FinancialObligationTransitionResponse,
} from './FinancialObligationDtos.js';
import { validateFinancialTransitionRequest } from './FinancialObligationErrors.js';
import { toFinancialResponse, toFinancialTransitionInput } from './FinancialObligationMapper.js';
import type { FinancialReconciliationView } from './FinancialObligationStore.js';
import { amountsEqual } from './Money.js';
import type { FinancialObligationTrigger } from './index.js';

/** Minimal kernel surface this boundary depends on. */
export interface FinancialObligationKernelPort {
  transition(input: TransitionInput): Promise<TransitionResult>;
}

/** Read port used ONLY to deterministically resolve the reconcile/record_mismatch trigger. */
export interface FinancialReconciliationDecisionPort {
  getReconciliationView(
    tenantId: string,
    obligationId: string,
  ): Promise<FinancialReconciliationView | undefined>;
}

export class FinancialObligationService {
  constructor(
    private readonly kernel: FinancialObligationKernelPort,
    private readonly reconciliation: FinancialReconciliationDecisionPort,
  ) {}

  assessObligation(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runDirect('assessObligation', request);
  }

  reviseObligationAssessment(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runDirect('reviseObligationAssessment', request);
  }

  acknowledgeObligation(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runDirect('acknowledgeObligation', request);
  }

  confirmObligation(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runDirect('confirmObligation', request);
  }

  /** Deterministic reconcile: drives `reconcile` (amounts match) or `record_mismatch` (differ). */
  reconcileObligation(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runReconcile(request);
  }

  resolveObligationMismatch(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runDirect('resolveObligationMismatch', request);
  }

  waiveObligation(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runDirect('waiveObligation', request);
  }

  exemptObligation(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runDirect('exemptObligation', request);
  }

  closeObligation(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    return this.runDirect('closeObligation', request);
  }

  /**
   * Execute a governed command by name. Fails CLOSED for an unknown command. Routes the dynamic
   * `reconcileObligation` command to the deterministic reconcile path; all others map 1:1.
   */
  executeCommand(
    command: string,
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    if (command === RECONCILE_OBLIGATION_COMMAND) {
      return this.runReconcile(request);
    }
    return this.runDirect(command, request);
  }

  /** 1:1 governed path: resolve trigger → validate → map → kernel.transition() → map back. */
  private async runDirect(
    command: string,
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    const trigger = triggerForFinancialCommand(command);
    return this.dispatch(trigger, request);
  }

  /** Deterministic reconcile path. */
  private async runReconcile(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    const trigger = await this.resolveReconcileTrigger(request);
    return this.dispatch(trigger, request);
  }

  private async dispatch(
    trigger: FinancialObligationTrigger,
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTransitionResponse> {
    validateFinancialTransitionRequest(request, trigger);
    const input = toFinancialTransitionInput(request, trigger);
    const result = await this.kernel.transition(input);
    return toFinancialResponse(result, request.obligationId);
  }

  /**
   * Resolve `reconcile` vs `record_mismatch` from PERSISTED facts. Drives `reconcile` only when an
   * accounting confirmation exists AND its amount equals the currently assessed amount; otherwise
   * `record_mismatch` (which fails closed at the guards if no confirmation exists).
   */
  private async resolveReconcileTrigger(
    request: FinancialObligationTransitionRequest,
  ): Promise<FinancialObligationTrigger> {
    const view = await this.reconciliation.getReconciliationView(
      request.tenantId,
      request.obligationId,
    );
    if (
      view?.confirmedAmount !== undefined &&
      amountsEqual(view.expectedAmount, view.confirmedAmount)
    ) {
      return 'reconcile';
    }
    return 'record_mismatch';
  }
}

/** Re-export the command catalog for callers that introspect the mapping. */
export { FINANCIAL_OBLIGATION_COMMANDS };
export type { FinancialObligationCommand };
