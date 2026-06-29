/**
 * Framework-agnostic AffiliationApplication transition handler.
 *
 * This is the boundary's entry point for a transport adapter (a future HTTP route, a
 * message consumer, a CLI, a test harness). It is deliberately NOT an HTTP server and
 * pulls in NO web framework (no Express/Fastify/Nest). A transport adapter is responsible
 * for parsing/authn and for translating the returned response DTO (and thrown
 * {@link AppError}) into its own protocol.
 */

import type { AffiliationApplicationTransitionRequest } from './AffiliationApplicationDtos.js';
import type { AffiliationApplicationTransitionResponse } from './AffiliationApplicationDtos.js';
import type { AffiliationApplicationService } from './AffiliationApplicationService.js';

/**
 * Invoke a single governed AffiliationApplication command through the service.
 *
 * Validation and unknown-command rejection happen inside the service (fail closed). The
 * caller receives a typed response DTO for executed/approval_required/rejected outcomes,
 * or an {@link AppError} for fail-closed conditions (unknown command, invalid input,
 * unknown transition/guard surfaced by the kernel).
 */
export function handleAffiliationApplicationTransition(
  service: AffiliationApplicationService,
  command: string,
  request: AffiliationApplicationTransitionRequest,
): Promise<AffiliationApplicationTransitionResponse> {
  return service.executeCommand(command, request);
}
