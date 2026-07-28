/**
 * In-memory AffiliationApplication v1 state machine seed.
 *
 * Mirrors db/migrations/0002_affiliation_application_v1_seed.sql so unit tests exercise
 * the identical FSM the database serves. Kept in sync by hand (single small slice).
 * Migration 0013 additionally binds AFFILIATION_FINANCIALLY_CLEARED to `activate` and
 * `reinstate` (financial activation gate); that binding is reflected here.
 */

import { AFFILIATION_APPLICATION_ENTITY_TYPE } from '../../domains/affiliation/index.js';
import type { StateMachineRow, TransitionGuardRow } from '../kernel/ports.js';

export interface SeededTransition {
  id: string;
  stateMachineId: string;
  trigger: string;
  fromState: string;
  toState: string;
  riskLevel: 'low' | 'high';
  evidenceRequired: boolean;
  approvalRequired: boolean;
  guards: TransitionGuardRow[];
}

export interface AffiliationSeed {
  stateMachines: StateMachineRow[];
  transitions: SeededTransition[];
}

const STATE_MACHINE_ID = '00000000-0000-0000-0000-0000000000aa';
const POLICY_VERSION_ID = '00000000-0000-0000-0000-0000000000a1';

type Risk = 'low' | 'high';

interface TransitionSpec {
  trigger: string;
  fromState: string;
  toState: string;
  risk: Risk;
  evidence: boolean;
  approval: boolean;
  guards: string[];
}

const SPECS: TransitionSpec[] = [
  { trigger: 'submit', fromState: 'draft', toState: 'submitted', risk: 'low', evidence: false, approval: false, guards: ['AFFILIATION_REQUIRED_FIELDS_COMPLETE', 'AFFILIATION_REQUIRED_DOCS_PRESENT'] },
  { trigger: 'review_start', fromState: 'submitted', toState: 'under_review', risk: 'low', evidence: false, approval: false, guards: ['ACTOR_HAS_REVIEWER_SCOPE'] },
  { trigger: 'approve', fromState: 'under_review', toState: 'approved', risk: 'high', evidence: true, approval: true, guards: ['AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS', 'AFFILIATION_FEES_PAID', 'ACTOR_HAS_REVIEWER_SCOPE'] },
  { trigger: 'reject', fromState: 'under_review', toState: 'rejected', risk: 'high', evidence: true, approval: true, guards: ['ACTOR_HAS_REVIEWER_SCOPE'] },
  { trigger: 'activate', fromState: 'approved', toState: 'active', risk: 'low', evidence: false, approval: false, guards: ['SEASON_IS_CURRENT', 'AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE', 'AFFILIATION_FINANCIALLY_CLEARED'] },
  { trigger: 'suspend', fromState: 'active', toState: 'suspended', risk: 'high', evidence: true, approval: true, guards: ['ACTOR_HAS_REVIEWER_SCOPE'] },
  { trigger: 'reinstate', fromState: 'suspended', toState: 'active', risk: 'high', evidence: true, approval: true, guards: ['AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS', 'ACTOR_HAS_REVIEWER_SCOPE', 'AFFILIATION_UNIQUE_ACTIVE_FOR_SCOPE', 'AFFILIATION_FINANCIALLY_CLEARED'] },
  { trigger: 'revoke', fromState: 'active', toState: 'revoked', risk: 'high', evidence: true, approval: true, guards: ['ACTOR_HAS_REVIEWER_SCOPE'] },
  { trigger: 'revoke', fromState: 'suspended', toState: 'revoked', risk: 'high', evidence: true, approval: true, guards: ['ACTOR_HAS_REVIEWER_SCOPE'] },
  { trigger: 'close', fromState: 'revoked', toState: 'closed', risk: 'high', evidence: true, approval: false, guards: ['ACTOR_HAS_REVIEWER_SCOPE'] },
  { trigger: 'close', fromState: 'rejected', toState: 'closed', risk: 'high', evidence: true, approval: false, guards: ['ACTOR_HAS_REVIEWER_SCOPE'] },
  { trigger: 'archive', fromState: 'closed', toState: 'archived', risk: 'high', evidence: true, approval: false, guards: ['ACTOR_HAS_REVIEWER_SCOPE'] },
];

/** Build a fresh AffiliationApplication seed (new object graph each call). */
export function buildAffiliationSeed(): AffiliationSeed {
  const stateMachine: StateMachineRow = {
    id: STATE_MACHINE_ID,
    policyVersionId: POLICY_VERSION_ID,
    entityType: AFFILIATION_APPLICATION_ENTITY_TYPE,
    version: 1,
    initialState: 'draft',
  };

  const transitions: SeededTransition[] = SPECS.map((spec, index) => ({
    id: `00000000-0000-0000-0000-0000000001${index.toString(16).padStart(2, '0')}`,
    stateMachineId: STATE_MACHINE_ID,
    trigger: spec.trigger,
    fromState: spec.fromState,
    toState: spec.toState,
    riskLevel: spec.risk,
    evidenceRequired: spec.evidence,
    approvalRequired: spec.approval,
    guards: spec.guards.map((guardCode, sortOrder) => ({
      guardCode,
      parameters: {},
      sortOrder,
    })),
  }));

  return { stateMachines: [stateMachine], transitions };
}
