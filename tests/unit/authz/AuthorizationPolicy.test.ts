import { describe, it, expect } from 'vitest';

import {
  authorize,
  assertAuthorized,
  AuthorizationAction,
  AuthorizationDeniedError,
  KNOWN_ACTIONS,
  PLATFORM_ADMIN_ROLE,
  ROLE_ACTION_MAP,
} from '../../../src/authz/index.js';
import type { AuthActor, AuthContext } from '../../../src/http/auth/AuthContext.js';

/**
 * Unit tests for the centralized authorization policy (src/authz/*).
 *
 * The policy is pure and deterministic: it decides whether an AUTHENTICATED actor may perform a
 * NAMED action using only roleKeys + permissionKeys. No database, no Azure, no Entra, no JWKS —
 * fully hermetic. These tests pin precedence, fail-closed behavior, and the NSO-generic catalog.
 */

function actor(over: Partial<AuthActor> = {}): AuthActor {
  return {
    userId: 'user-1',
    roleKeys: [],
    permissionKeys: [],
    ...over,
  };
}

function authContext(a: AuthActor): AuthContext {
  return { tenantId: 'tenant-a', actor: a, mode: 'trusted_headers' };
}

describe('centralized authorization policy', () => {
  // (1) An exact permission key allows the matching action.
  it('(1) allows when the actor holds the exact permission key', () => {
    const decision = authorize(
      actor({ permissionKeys: [AuthorizationAction.WorkflowDecide] }),
      AuthorizationAction.WorkflowDecide,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('permission');
  });

  // (2) A mapped role allows the action.
  it('(2) allows when a mapped role grants the action', () => {
    const decision = authorize(
      actor({ roleKeys: ['regional_reviewer'] }),
      AuthorizationAction.WorkflowDecide,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('role');
  });

  // (3) platform_admin allows every known action.
  it('(3) platform_admin allows all known actions', () => {
    const a = actor({ roleKeys: [PLATFORM_ADMIN_ROLE] });
    for (const action of KNOWN_ACTIONS) {
      const decision = authorize(a, action);
      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('platform_admin');
    }
  });

  // (4) An unknown action fails closed.
  it('(4) denies an unknown action (fail closed)', () => {
    const decision = authorize(
      actor({ roleKeys: [PLATFORM_ADMIN_ROLE], permissionKeys: ['anything'] }),
      'workflow.delete',
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('missing_permission');
  });

  // (5) Empty roles + permissions fail closed for a known action.
  it('(5) denies when role and permission lists are empty', () => {
    const decision = authorize(actor(), AuthorizationAction.WorkflowRead);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('missing_permission');
  });

  // (6) A missing actor fails closed.
  it('(6) denies when the actor is missing (null/undefined)', () => {
    expect(authorize(null, AuthorizationAction.WorkflowRead).allowed).toBe(false);
    expect(authorize(undefined, AuthorizationAction.WorkflowRead).allowed).toBe(false);
  });

  // (7) Permission precedence: an exact permission wins even when a role would also grant it.
  it('(7) reports permission precedence over role', () => {
    const decision = authorize(
      actor({
        roleKeys: ['regional_reviewer'],
        permissionKeys: [AuthorizationAction.WorkflowDecide],
      }),
      AuthorizationAction.WorkflowDecide,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('permission');
  });

  // (8) An unmapped role does not grant an unrelated action (fail closed).
  it('(8) denies when the actor only holds an unrelated/unmapped role', () => {
    const decision = authorize(
      actor({ roleKeys: ['member'] }),
      AuthorizationAction.WorkflowRead,
    );
    expect(decision.allowed).toBe(false);
    // A workflow reader role grants read; a security role does not.
    const securityDecision = authorize(
      actor({ roleKeys: ['security_reviewer'] }),
      AuthorizationAction.WorkflowRead,
    );
    expect(securityDecision.allowed).toBe(false);
  });

  // (9) The action catalog and role map are NSO-generic (no sport-specific terminology).
  it('(9) exposes only NSO-generic action and role names', () => {
    const SPORT_TERMS = /(ptso|club|curl|curler|bonspiel|rink|sheet|skip|hockey|soccer)/i;
    for (const action of KNOWN_ACTIONS) {
      expect(action).not.toMatch(SPORT_TERMS);
    }
    for (const role of Object.keys(ROLE_ACTION_MAP)) {
      expect(role).not.toMatch(SPORT_TERMS);
    }
    expect(PLATFORM_ADMIN_ROLE).not.toMatch(SPORT_TERMS);
  });

  // assertAuthorized: throws a 403 FORBIDDEN AuthorizationDeniedError when denied.
  it('assertAuthorized throws AuthorizationDeniedError (403/FORBIDDEN) when denied', () => {
    const auth = authContext(actor());
    let thrown: unknown;
    try {
      assertAuthorized(auth, AuthorizationAction.WorkflowRead);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AuthorizationDeniedError);
    const denied = thrown as AuthorizationDeniedError;
    expect(denied.code).toBe('FORBIDDEN');
    expect(denied.action).toBe(AuthorizationAction.WorkflowRead);
    // The message must NOT leak role/permission lists or tokens.
    expect(denied.message).not.toMatch(/roleKeys|permissionKeys|token|bearer/i);
  });

  // assertAuthorized: returns void (does not throw) when allowed.
  it('assertAuthorized does not throw when allowed', () => {
    const auth = authContext(actor({ roleKeys: ['workflow_admin'] }));
    expect(() => assertAuthorized(auth, AuthorizationAction.WorkflowExecute)).not.toThrow();
  });
});
