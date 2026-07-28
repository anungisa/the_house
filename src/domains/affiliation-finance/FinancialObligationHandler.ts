/**
 * Framework-agnostic AffiliationFinancialObligation transition handler.
 *
 * The boundary's entry point for a transport adapter (an HTTP route, a message consumer, a CLI, a
 * test harness). It is deliberately NOT an HTTP server and pulls in NO web framework. Validation
 * and unknown-command rejection happen inside the service (fail closed). Callers receive a typed
 * response DTO for executed/approval_required/rejected outcomes, or an {@link AppError} for
 * fail-closed conditions.
 */

import type { FinancialObligationTransitionRequest } from './FinancialObligationDtos.js';
import type { FinancialObligationTransitionResponse } from './FinancialObligationDtos.js';
import type { FinancialObligationService } from './FinancialObligationService.js';

export function handleFinancialObligationTransition(
  service: FinancialObligationService,
  command: string,
  request: FinancialObligationTransitionRequest,
): Promise<FinancialObligationTransitionResponse> {
  return service.executeCommand(command, request);
}
