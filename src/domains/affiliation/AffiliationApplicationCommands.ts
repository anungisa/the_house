/**
 * AffiliationApplication domain commands.
 *
 * Each command name maps to EXACTLY ONE kernel-resolved FSM trigger. The boundary never
 * invents new triggers or states — the v1 AffiliationApplication FSM is owned by the
 * Governance Kernel (see {@link AFFILIATION_TRIGGERS}). Callers select a command; the
 * service translates it to the corresponding trigger.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { AffiliationTrigger } from './index.js';

/** Canonical command → trigger map. The `satisfies` clause guarantees every value is a real trigger. */
export const AFFILIATION_APPLICATION_COMMANDS = {
  submitAffiliationApplication: 'submit',
  startAffiliationReview: 'review_start',
  approveAffiliationApplication: 'approve',
  rejectAffiliationApplication: 'reject',
  activateAffiliationApplication: 'activate',
  suspendAffiliationApplication: 'suspend',
  reinstateAffiliationApplication: 'reinstate',
  revokeAffiliationApplication: 'revoke',
  closeAffiliationApplication: 'close',
  archiveAffiliationApplication: 'archive',
} as const satisfies Record<string, AffiliationTrigger>;

/** Union of valid command names. */
export type AffiliationApplicationCommand = keyof typeof AFFILIATION_APPLICATION_COMMANDS;

/** All valid command names (stable order). */
export const AFFILIATION_APPLICATION_COMMAND_NAMES = Object.keys(
  AFFILIATION_APPLICATION_COMMANDS,
) as readonly AffiliationApplicationCommand[];

/** Type guard: is the given string a known command? */
export function isAffiliationApplicationCommand(
  command: string,
): command is AffiliationApplicationCommand {
  return Object.prototype.hasOwnProperty.call(AFFILIATION_APPLICATION_COMMANDS, command);
}

/**
 * Resolve a command name to its FSM trigger. Fails CLOSED (INVALID_INPUT) for an unknown
 * command — the boundary refuses to forward an unrecognized action to the kernel.
 */
export function triggerForCommand(command: string): AffiliationTrigger {
  if (!isAffiliationApplicationCommand(command)) {
    throw new AppError(ErrorCode.INVALID_INPUT, `Unknown AffiliationApplication command: ${command}`, {
      details: { command, knownCommands: AFFILIATION_APPLICATION_COMMAND_NAMES },
    });
  }
  return AFFILIATION_APPLICATION_COMMANDS[command];
}
