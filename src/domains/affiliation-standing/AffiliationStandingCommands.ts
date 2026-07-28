/**
 * AffiliationStanding domain commands.
 *
 * Every command name maps to EXACTLY ONE kernel-resolved FSM trigger (no dynamic/derived triggers
 * in this domain). The boundary never invents new triggers or states; unknown commands fail closed.
 */

import { AppError, ErrorCode } from '../../shared/errors/AppError.js';
import type { StandingTrigger } from './index.js';

/**
 * Canonical 1:1 command → trigger map. The `satisfies` clause guarantees every value is a real
 * trigger.
 */
export const STANDING_COMMANDS = {
  openStanding: 'open',
  activateStanding: 'activate',
  expireStanding: 'expire',
  renewStanding: 'renew',
  renewActiveStanding: 'renew_active',
  suspendStanding: 'suspend',
  reinstateStanding: 'reinstate',
  terminateStanding: 'terminate',
} as const satisfies Record<string, StandingTrigger>;

/** Union of the command names. */
export type StandingCommand = keyof typeof STANDING_COMMANDS;

/** All valid command names (stable order). */
export const STANDING_COMMAND_NAMES: readonly StandingCommand[] = Object.keys(
  STANDING_COMMANDS,
) as StandingCommand[];

/** Type guard: is the given string a known command? */
export function isStandingCommand(command: string): command is StandingCommand {
  return Object.prototype.hasOwnProperty.call(STANDING_COMMANDS, command);
}

/** Resolve a command name to its FSM trigger. Fails CLOSED (INVALID_INPUT) for an unknown command. */
export function triggerForStandingCommand(command: string): StandingTrigger {
  if (!Object.prototype.hasOwnProperty.call(STANDING_COMMANDS, command)) {
    throw new AppError(ErrorCode.INVALID_INPUT, `Unknown AffiliationStanding command: ${command}`, {
      details: { command, knownCommands: STANDING_COMMAND_NAMES },
    });
  }
  return STANDING_COMMANDS[command as StandingCommand];
}
