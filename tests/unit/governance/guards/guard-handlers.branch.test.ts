import { describe, expect, it } from 'vitest';

import {
  createAffiliationGuardHandlers,
  PayloadBackedAffiliationGuardRepository,
} from '../../../../src/governance/guards/handlers.js';
import { GuardRegistry } from '../../../../src/governance/guards/GuardRegistry.js';
import { AppError, ErrorCode } from '../../../../src/shared/errors/AppError.js';
import type {
  GuardEvaluationInput,
  TransitionActor,
} from '../../../../src/governance/types/TransitionTypes.js';

/**
 * Branch-coverage sweep for the AffiliationApplication guard handlers (the payload-backed FAKE
 * repository used by unit harnesses). It pins BOTH outcome branches of every named guard, the
 * explicit failure messages, fail-closed behavior for missing/malformed facts, and the
 * actor.roles `?? []` edge for the reviewer-scope guard. No DB, no network.
 */

const REVIEWER: TransitionActor = {
  actorId: 'reviewer-1',
  tenantId: 't',
  scopeType: 'national_organization',
  roles: ['reviewer'],
};

function input(over: {
  facts?: unknown;
  actor?: TransitionActor;
  noPayload?: boolean;
}): GuardEvaluationInput {
  return {
    guardCode: 'X',
    parameters: {},
    entityType: 'AffiliationApplication',
    entityId: 'app-1',
    trigger: 'submit',
    fromState: 'draft',
    toState: 'submitted',
    actor: over.actor ?? REVIEWER,
    context: { tenantId: 't', scopeType: 'national_organization' },
    ...(over.noPayload === true ? {} : { payload: { facts: over.facts } }),
  };
}

const handlers = createAffiliationGuardHandlers(new PayloadBackedAffiliationGuardRepository());

const ALL_PASS = {
  requiredFieldsComplete: true,
  requiredDocsPresent: true,
  openComplianceFlags: false,
  feesPaid: true,
  seasonIsCurrent: true,
};

describe('affiliation guard handlers — pass branches', () => {
  it('all fact-backed guards pass with complete, clean facts', async () => {
    const i = input({ facts: ALL_PASS });
    expect((await handlers.AFFILIATION_REQUIRED_FIELDS_COMPLETE(i)).passed).toBe(true);
    expect((await handlers.AFFILIATION_REQUIRED_DOCS_PRESENT(i)).passed).toBe(true);
    expect((await handlers.AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS(i)).passed).toBe(true);
    expect((await handlers.AFFILIATION_FEES_PAID(i)).passed).toBe(true);
    expect((await handlers.SEASON_IS_CURRENT(i)).passed).toBe(true);
  });

  it('ACTOR_HAS_REVIEWER_SCOPE passes for each reviewer-class role', async () => {
    for (const role of ['reviewer', 'approver', 'admin']) {
      const i = input({ facts: ALL_PASS, actor: { ...REVIEWER, roles: [role] } });
      expect((await handlers.ACTOR_HAS_REVIEWER_SCOPE(i)).passed).toBe(true);
    }
  });
});

describe('affiliation guard handlers — fail branches (explicit messages)', () => {
  it('AFFILIATION_REQUIRED_FIELDS_COMPLETE fails closed when the fact is false', async () => {
    const r = await handlers.AFFILIATION_REQUIRED_FIELDS_COMPLETE(
      input({ facts: { ...ALL_PASS, requiredFieldsComplete: false } }),
    );
    expect(r.passed).toBe(false);
    expect(r.message).toBe('Required application fields are incomplete.');
  });

  it('AFFILIATION_REQUIRED_DOCS_PRESENT fails closed when the fact is false', async () => {
    const r = await handlers.AFFILIATION_REQUIRED_DOCS_PRESENT(
      input({ facts: { ...ALL_PASS, requiredDocsPresent: false } }),
    );
    expect(r.passed).toBe(false);
    expect(r.message).toBe('Required supporting documents are missing.');
  });

  it('AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS fails when a flag is explicitly open', async () => {
    const r = await handlers.AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS(
      input({ facts: { ...ALL_PASS, openComplianceFlags: true } }),
    );
    expect(r.passed).toBe(false);
    expect(r.message).toBe('There are unresolved compliance obligations.');
  });

  it('AFFILIATION_FEES_PAID fails closed when fees are unpaid', async () => {
    const r = await handlers.AFFILIATION_FEES_PAID(input({ facts: { ...ALL_PASS, feesPaid: false } }));
    expect(r.passed).toBe(false);
    expect(r.message).toBe('Outstanding payment obligations remain.');
  });

  it('SEASON_IS_CURRENT fails closed when the season is not current', async () => {
    const r = await handlers.SEASON_IS_CURRENT(input({ facts: { ...ALL_PASS, seasonIsCurrent: false } }));
    expect(r.passed).toBe(false);
    expect(r.message).toBe('The application does not target the current season.');
  });

  it('ACTOR_HAS_REVIEWER_SCOPE fails for a non-reviewer role', async () => {
    const r = await handlers.ACTOR_HAS_REVIEWER_SCOPE(
      input({ facts: ALL_PASS, actor: { ...REVIEWER, roles: ['member'] } }),
    );
    expect(r.passed).toBe(false);
    expect(r.message).toBe('Actor does not hold reviewer scope.');
  });

  it('ACTOR_HAS_REVIEWER_SCOPE fails closed when the actor has no roles at all', async () => {
    const { roles: _drop, ...noRoles } = REVIEWER;
    const r = await handlers.ACTOR_HAS_REVIEWER_SCOPE(
      input({ facts: ALL_PASS, actor: noRoles as TransitionActor }),
    );
    expect(r.passed).toBe(false);
  });
});

describe('affiliation guard handlers — missing/malformed facts fail closed', () => {
  it('required-fact guards fail closed when no payload facts are present', async () => {
    const i = input({ noPayload: true });
    expect((await handlers.AFFILIATION_REQUIRED_FIELDS_COMPLETE(i)).passed).toBe(false);
    expect((await handlers.AFFILIATION_REQUIRED_DOCS_PRESENT(i)).passed).toBe(false);
    expect((await handlers.AFFILIATION_FEES_PAID(i)).passed).toBe(false);
    expect((await handlers.SEASON_IS_CURRENT(i)).passed).toBe(false);
    // Absence of an explicit open flag is treated as "no open flags" (safe default).
    expect((await handlers.AFFILIATION_NO_OPEN_COMPLIANCE_FLAGS(i)).passed).toBe(true);
  });

  it('required-fact guards fail closed when facts are malformed (non-object)', async () => {
    const i = input({ facts: 'not-an-object' });
    expect((await handlers.AFFILIATION_REQUIRED_FIELDS_COMPLETE(i)).passed).toBe(false);
    expect((await handlers.AFFILIATION_FEES_PAID(i)).passed).toBe(false);
  });
});

describe('affiliation guard handlers — registry fails closed on an unsupported guard name', () => {
  it('GuardRegistry.evaluate (async) throws UNKNOWN_GUARD for an unregistered code', async () => {
    const registry = new GuardRegistry();
    registry.registerGuard('AFFILIATION_FEES_PAID', handlers.AFFILIATION_FEES_PAID);
    expect(registry.hasGuard('NOPE')).toBe(false);

    let thrown: unknown;
    try {
      await registry.evaluate({
        guardCode: 'NOPE',
        parameters: {},
        entityType: 'AffiliationApplication',
        entityId: 'app-1',
        trigger: 'submit',
        fromState: 'draft',
        toState: 'submitted',
        actor: REVIEWER,
        context: { tenantId: 't', scopeType: 'national_organization' },
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe(ErrorCode.UNKNOWN_GUARD);
  });
});
