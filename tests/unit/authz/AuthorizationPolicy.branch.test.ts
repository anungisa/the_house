import { describe, expect, it } from 'vitest';

import { authorize, AuthorizationAction } from '../../../src/authz/index.js';
import type { AuthActor } from '../../../src/http/auth/AuthContext.js';

/**
 * Branch-coverage sweep for the residual decision branches in `authorize` that the main
 * AuthorizationPolicy.test.ts does not reach:
 *  - the defensive `?? []` fallbacks when a (malformed) actor is missing its role/permission
 *    arrays entirely, and
 *  - the `roleGrants` loop skipping a non-mapping role before matching a later mapping role.
 *
 * The fail-closed telemetry-on-deny branch of `assertAuthorized` is covered in
 * tests/unit/observability/instrumentation.test.ts (test 15) and is not duplicated here.
 */

describe('authorize — defensive/iteration branches', () => {
  it('denies a malformed actor missing both role and permission arrays (fail closed)', () => {
    // A runtime-incomplete actor (type says these are required; defend anyway).
    const malformed = { userId: 'u-malformed' } as unknown as AuthActor;
    const decision = authorize(malformed, AuthorizationAction.WorkflowRead);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('missing_permission');
  });

  it('grants via a later mapped role after skipping an unmapped one', () => {
    const decision = authorize(
      { userId: 'u', roleKeys: ['some_unmapped_role', 'workflow_reader'], permissionKeys: [] },
      AuthorizationAction.WorkflowRead,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('role');
  });

  it('denies when every held role is unmapped (loop exhausts without a match)', () => {
    const decision = authorize(
      { userId: 'u', roleKeys: ['unmapped_a', 'unmapped_b'], permissionKeys: [] },
      AuthorizationAction.WorkflowExecute,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('missing_permission');
  });
});
