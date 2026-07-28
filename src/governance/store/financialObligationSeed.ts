/**
 * In-memory AffiliationFinancialObligation v1 state machine seed.
 *
 * Mirrors db/migrations/0013_affiliation_financial_obligation.sql (PART A) so unit tests exercise
 * the identical FSM the database serves. Kept in sync by hand (single small slice). ALL financial
 * transitions are approval_required = false in v1; high-risk transitions require evidence.
 */

import { AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE } from '../../domains/affiliation-finance/index.js';
import type { StateMachineRow } from '../kernel/ports.js';
import type { SeededTransition } from './affiliationSeed.js';

const STATE_MACHINE_ID = '00000000-0000-0000-0000-0000000000fa';
const POLICY_VERSION_ID = '00000000-0000-0000-0000-0000000000f1';

type Risk = 'low' | 'high';

interface TransitionSpec {
  trigger: string;
  fromState: string;
  toState: string;
  risk: Risk;
  guards: string[];
}

/** high-risk ⇒ evidence required (mirrors the migration). approval_required is always false. */
const SPECS: TransitionSpec[] = [
  { trigger: 'assess', fromState: 'unassessed', toState: 'assessed', risk: 'low', guards: [] },
  { trigger: 'revise_assessment', fromState: 'assessed', toState: 'assessed', risk: 'high', guards: [] },
  { trigger: 'acknowledge', fromState: 'assessed', toState: 'acknowledged', risk: 'low', guards: [] },
  { trigger: 'acknowledge', fromState: 'acknowledged', toState: 'acknowledged', risk: 'low', guards: [] },
  { trigger: 'confirm', fromState: 'acknowledged', toState: 'confirmed', risk: 'high', guards: [] },
  { trigger: 'confirm', fromState: 'confirmed', toState: 'confirmed', risk: 'high', guards: [] },
  {
    trigger: 'reconcile',
    fromState: 'confirmed',
    toState: 'reconciled',
    risk: 'high',
    guards: ['FINANCIAL_ACCOUNTING_CONFIRMED', 'FINANCIAL_AMOUNTS_MATCH'],
  },
  {
    trigger: 'record_mismatch',
    fromState: 'confirmed',
    toState: 'mismatch',
    risk: 'high',
    guards: ['FINANCIAL_ACCOUNTING_CONFIRMED', 'FINANCIAL_AMOUNTS_DIFFER'],
  },
  { trigger: 'resolve_mismatch', fromState: 'mismatch', toState: 'reconciled', risk: 'high', guards: [] },
  { trigger: 'waive', fromState: 'assessed', toState: 'waived', risk: 'high', guards: [] },
  { trigger: 'exempt', fromState: 'assessed', toState: 'exempt', risk: 'high', guards: [] },
  { trigger: 'close', fromState: 'reconciled', toState: 'closed', risk: 'high', guards: [] },
  { trigger: 'close', fromState: 'waived', toState: 'closed', risk: 'high', guards: [] },
  { trigger: 'close', fromState: 'exempt', toState: 'closed', risk: 'high', guards: [] },
];

export interface FinancialSeed {
  stateMachines: StateMachineRow[];
  transitions: SeededTransition[];
}

/** Build a fresh AffiliationFinancialObligation seed (new object graph each call). */
export function buildFinancialObligationSeed(): FinancialSeed {
  const stateMachine: StateMachineRow = {
    id: STATE_MACHINE_ID,
    policyVersionId: POLICY_VERSION_ID,
    entityType: AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE,
    version: 1,
    initialState: 'unassessed',
  };

  const transitions: SeededTransition[] = SPECS.map((spec, index) => ({
    id: `00000000-0000-0000-0000-0000000002${index.toString(16).padStart(2, '0')}`,
    stateMachineId: STATE_MACHINE_ID,
    trigger: spec.trigger,
    fromState: spec.fromState,
    toState: spec.toState,
    riskLevel: spec.risk,
    // high-risk ⇒ evidence required.
    evidenceRequired: spec.risk === 'high',
    approvalRequired: false,
    guards: spec.guards.map((guardCode, sortOrder) => ({ guardCode, parameters: {}, sortOrder })),
  }));

  return { stateMachines: [stateMachine], transitions };
}
