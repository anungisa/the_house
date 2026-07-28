/**
 * In-memory AffiliationStanding v1 state machine seed.
 *
 * Mirrors db/migrations/0014_affiliation_standing.sql (PART A) so unit tests exercise the identical
 * FSM the database serves. Kept in sync by hand (single small slice). ALL standing transitions are
 * approval_required = false in v1; high-risk transitions require evidence.
 *
 * `unopened` is a bootstrap initial state (the standing head does not exist yet); `open` creates it.
 * This keeps the required distinction (V12-15) explicit: `open` (establish) ≠ `activate` (in force)
 * ≠ `renew` (maintain), and `expire` (term ended) ≠ `renew` (restored).
 */

import { AFFILIATION_STANDING_ENTITY_TYPE } from '../../domains/affiliation-standing/index.js';
import type { StateMachineRow, TransitionGuardRow } from '../kernel/ports.js';
import type { SeededTransition } from './affiliationSeed.js';

const STATE_MACHINE_ID = '00000000-0000-0000-0000-0000000000fb';
const POLICY_VERSION_ID = '00000000-0000-0000-0000-0000000000f2';

/** Renewal grace window (days) bound to STANDING_RENEWAL_WINDOW_OPEN for early renewal. */
const RENEWAL_GRACE_DAYS = 30;

type Risk = 'low' | 'high';

interface SeedGuard {
  code: string;
  parameters?: Readonly<Record<string, unknown>>;
}

interface TransitionSpec {
  trigger: string;
  fromState: string;
  toState: string;
  risk: Risk;
  guards: SeedGuard[];
}

/** high-risk ⇒ evidence required (mirrors the migration). approval_required is always false. */
const SPECS: TransitionSpec[] = [
  { trigger: 'open', fromState: 'unopened', toState: 'pending', risk: 'low', guards: [] },
  {
    trigger: 'activate',
    fromState: 'pending',
    toState: 'active',
    risk: 'low',
    guards: [{ code: 'STANDING_WITHIN_EFFECTIVE_PERIOD' }],
  },
  {
    trigger: 'expire',
    fromState: 'active',
    toState: 'lapsed',
    risk: 'high',
    guards: [{ code: 'STANDING_TERM_HAS_ENDED' }],
  },
  { trigger: 'renew', fromState: 'lapsed', toState: 'active', risk: 'high', guards: [] },
  {
    trigger: 'renew_active',
    fromState: 'active',
    toState: 'active',
    risk: 'high',
    guards: [{ code: 'STANDING_RENEWAL_WINDOW_OPEN', parameters: { graceDays: RENEWAL_GRACE_DAYS } }],
  },
  { trigger: 'suspend', fromState: 'active', toState: 'suspended', risk: 'high', guards: [] },
  {
    trigger: 'reinstate',
    fromState: 'suspended',
    toState: 'active',
    risk: 'high',
    guards: [{ code: 'STANDING_WITHIN_EFFECTIVE_PERIOD' }],
  },
  { trigger: 'terminate', fromState: 'active', toState: 'terminated', risk: 'high', guards: [] },
  { trigger: 'terminate', fromState: 'suspended', toState: 'terminated', risk: 'high', guards: [] },
  { trigger: 'terminate', fromState: 'lapsed', toState: 'terminated', risk: 'high', guards: [] },
];

export interface StandingSeed {
  stateMachines: StateMachineRow[];
  transitions: SeededTransition[];
}

/** Build a fresh AffiliationStanding seed (new object graph each call). */
export function buildAffiliationStandingSeed(): StandingSeed {
  const stateMachine: StateMachineRow = {
    id: STATE_MACHINE_ID,
    policyVersionId: POLICY_VERSION_ID,
    entityType: AFFILIATION_STANDING_ENTITY_TYPE,
    version: 1,
    initialState: 'unopened',
  };

  const transitions: SeededTransition[] = SPECS.map((spec, index) => ({
    id: `00000000-0000-0000-0000-0000000003${index.toString(16).padStart(2, '0')}`,
    stateMachineId: STATE_MACHINE_ID,
    trigger: spec.trigger,
    fromState: spec.fromState,
    toState: spec.toState,
    riskLevel: spec.risk,
    // high-risk ⇒ evidence required.
    evidenceRequired: spec.risk === 'high',
    approvalRequired: false,
    guards: spec.guards.map(
      (guard, sortOrder): TransitionGuardRow => ({
        guardCode: guard.code,
        parameters: guard.parameters ?? {},
        sortOrder,
      }),
    ),
  }));

  return { stateMachines: [stateMachine], transitions };
}
