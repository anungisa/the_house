/**
 * AffiliationFinancialObligation domain commands.
 *
 * Most command names map to EXACTLY ONE kernel-resolved FSM trigger. The single exception is
 * `reconcileObligation`, which resolves DETERMINISTICALLY at the service to either `reconcile`
 * (persisted assessed amount equals the latest accounting-confirmed amount) or `record_mismatch`
 * (they differ) — the caller never chooses the outcome, and the matching kernel guards
 * (FINANCIAL_AMOUNTS_MATCH / FINANCIAL_AMOUNTS_DIFFER) re-verify the same persisted facts and
 * fail closed. The boundary never invents new triggers or states.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { FinancialObligationTrigger } from './index.js';

/** Command name used for the deterministic reconcile/record_mismatch decision. */
export const RECONCILE_OBLIGATION_COMMAND = 'reconcileObligation';

/**
 * Canonical 1:1 command → trigger map. The `satisfies` clause guarantees every value is a real
 * trigger. `reconcileObligation` is intentionally absent here — it is resolved at the service.
 */
export const FINANCIAL_OBLIGATION_COMMANDS = {
  assessObligation: 'assess',
  reviseObligationAssessment: 'revise_assessment',
  acknowledgeObligation: 'acknowledge',
  confirmObligation: 'confirm',
  resolveObligationMismatch: 'resolve_mismatch',
  waiveObligation: 'waive',
  exemptObligation: 'exempt',
  closeObligation: 'close',
} as const satisfies Record<string, FinancialObligationTrigger>;

/** Union of the 1:1 command names. */
export type FinancialObligationDirectCommand = keyof typeof FINANCIAL_OBLIGATION_COMMANDS;

/** Union of ALL command names (including the dynamic reconcile command). */
export type FinancialObligationCommand =
  | FinancialObligationDirectCommand
  | typeof RECONCILE_OBLIGATION_COMMAND;

/** All valid command names (stable order), reconcile last. */
export const FINANCIAL_OBLIGATION_COMMAND_NAMES: readonly FinancialObligationCommand[] = [
  ...(Object.keys(FINANCIAL_OBLIGATION_COMMANDS) as FinancialObligationDirectCommand[]),
  RECONCILE_OBLIGATION_COMMAND,
];

/** Type guard: is the given string a known command (including reconcile)? */
export function isFinancialObligationCommand(
  command: string,
): command is FinancialObligationCommand {
  return (
    command === RECONCILE_OBLIGATION_COMMAND ||
    Object.prototype.hasOwnProperty.call(FINANCIAL_OBLIGATION_COMMANDS, command)
  );
}

/**
 * Resolve a 1:1 command name to its FSM trigger. Fails CLOSED (INVALID_INPUT) for an unknown
 * command AND for `reconcileObligation` (which has no static trigger — the service resolves it).
 */
export function triggerForFinancialCommand(command: string): FinancialObligationTrigger {
  if (command === RECONCILE_OBLIGATION_COMMAND) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'reconcileObligation resolves its trigger dynamically; use the service reconcile path.',
      { details: { command } },
    );
  }
  if (!Object.prototype.hasOwnProperty.call(FINANCIAL_OBLIGATION_COMMANDS, command)) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      `Unknown AffiliationFinancialObligation command: ${command}`,
      { details: { command, knownCommands: FINANCIAL_OBLIGATION_COMMAND_NAMES } },
    );
  }
  return FINANCIAL_OBLIGATION_COMMANDS[command as FinancialObligationDirectCommand];
}
