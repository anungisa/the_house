/**
 * Affiliation Finance domain module — the governed AffiliationFinancialObligation lifecycle.
 *
 * This DOMAIN owns the FINANCIAL FACTS of an affiliation obligation (obligation type, assessed
 * amount/currency, assessment history, provider acknowledgements, accounting confirmations,
 * reconciliation outcomes, and authorized waiver/exemption clearances). It does NOT own the
 * governed lifecycle STATE — that lives in `governance.entity_state` and is written EXCLUSIVELY
 * by the Governance Kernel.
 *
 * Architectural rule (identical to every other domain): this module may REQUEST governed
 * transitions through the kernel, but it MUST NOT mutate governed state directly. Its financial
 * facts are persisted by a kernel {@link TransitionDomainEffect} INSIDE the same governed
 * transaction as the state mutation, journal, audit, evidence, and outbox — so a financial write
 * commits/rolls back atomically with the governed transition.
 *
 * The financial FSM enforces the required, non-collapsible distinctions:
 *   provider acknowledgement  ≠  accounting confirmation  ≠  reconciliation
 *   decision approved         ≠  financially cleared      ≠  activation authorized
 *   payment/waiver granted    ≠  obligation reconciled
 *
 * NSO-GENERIC: `AffiliationFinancialObligation` and every field name are sport-agnostic.
 *
 * AffiliationFinancialObligation v1 FSM (owned by the kernel, see migration 0013):
 *   unassessed   --assess-->            assessed
 *   assessed     --revise_assessment--> assessed        (self-loop; append new version)
 *   assessed     --acknowledge-->       acknowledged
 *   acknowledged --acknowledge-->       acknowledged    (self-loop; idempotent extra callback)
 *   acknowledged --confirm-->           confirmed
 *   confirmed    --confirm-->           confirmed        (self-loop; extra confirmation)
 *   confirmed    --reconcile-->         reconciled       [amounts match]
 *   confirmed    --record_mismatch-->   mismatch         [amounts differ]
 *   mismatch     --resolve_mismatch-->  reconciled
 *   assessed     --waive-->             waived
 *   assessed     --exempt-->            exempt
 *   reconciled   --close-->             closed
 *   waived       --close-->             closed
 *   exempt       --close-->             closed
 */

/** Governed entity type handled by this domain module. */
export const AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE = 'AffiliationFinancialObligation';

/** Canonical AffiliationFinancialObligation v1 transition triggers (kernel-resolved). */
export const FINANCIAL_OBLIGATION_TRIGGERS = [
  'assess',
  'revise_assessment',
  'acknowledge',
  'confirm',
  'reconcile',
  'record_mismatch',
  'resolve_mismatch',
  'waive',
  'exempt',
  'close',
] as const;

export type FinancialObligationTrigger = (typeof FINANCIAL_OBLIGATION_TRIGGERS)[number];

/**
 * High-risk triggers that require evidence metadata (resolved/enforced by the kernel). Only
 * `assess` and `acknowledge` are low-risk: an assessment is the opening record and a provider
 * acknowledgement is an external callback that is NOT itself a governed financial determination.
 */
export const FINANCIAL_OBLIGATION_HIGH_RISK_TRIGGERS: ReadonlySet<FinancialObligationTrigger> =
  new Set([
    'revise_assessment',
    'confirm',
    'reconcile',
    'record_mismatch',
    'resolve_mismatch',
    'waive',
    'exempt',
    'close',
  ]);

/**
 * Terminal-clearance obligation states: a blocking obligation in ANY of these is considered
 * financially cleared for the purpose of the affiliation activation guard. Kept as a single
 * source of truth shared by the clearance reader and its tests.
 */
export const FINANCIAL_CLEARED_STATES: ReadonlySet<string> = new Set([
  'reconciled',
  'waived',
  'exempt',
]);

// ---------------------------------------------------------------------------------------
// Public boundary re-exports.
// ---------------------------------------------------------------------------------------

export type {
  FinancialObligationHead,
  FinancialReconciliationView,
  FinancialObligationStore,
} from './FinancialObligationStore.js';

export { InMemoryFinancialObligationStore } from './InMemoryFinancialObligationStore.js';
export { PgFinancialObligationStore } from './PgFinancialObligationStore.js';

export {
  PgFinancialObligationEffect,
  InMemoryFinancialObligationEffect,
} from './FinancialObligationEffect.js';

export {
  DomainBackedFinancialGuardRepository,
  PayloadBackedFinancialGuardRepository,
  type FinancialGuardRepository,
} from './FinancialObligationGuardRepository.js';

export {
  PgFinancialClearanceReader,
  type FinancialClearanceReader,
} from './FinancialClearanceReader.js';

export { FinancialObligationSerializationResolver } from './FinancialObligationSerializationResolver.js';

export {
  FINANCIAL_OBLIGATION_COMMANDS,
  FINANCIAL_OBLIGATION_COMMAND_NAMES,
  isFinancialObligationCommand,
  triggerForFinancialCommand,
  type FinancialObligationCommand,
} from './FinancialObligationCommands.js';

export type {
  FinancialActorDto,
  FinancialObligationTransitionRequest,
  FinancialObligationTransitionResponse,
  FinancialObligationExecutedResponse,
  FinancialObligationApprovalRequiredResponse,
  FinancialObligationRejectedResponse,
  AssessmentDetails,
  RevisionDetails,
  ProviderAcknowledgementDetails,
  AccountingConfirmationDetails,
  ClearanceDetails,
} from './FinancialObligationDtos.js';

export {
  validateFinancialTransitionRequest,
  suggestFinancialIdempotencyKey,
} from './FinancialObligationErrors.js';

export { toFinancialTransitionInput, toFinancialResponse } from './FinancialObligationMapper.js';

export {
  FinancialObligationService,
  type FinancialObligationKernelPort,
  type FinancialReconciliationDecisionPort,
} from './FinancialObligationService.js';

export { handleFinancialObligationTransition } from './FinancialObligationHandler.js';
