/**
 * Centralized authorization policy — the single, testable place that decides whether an
 * AUTHENTICATED actor may perform a NAMED operation.
 *
 * Layering (do not conflate):
 *  - Authentication (src/http/auth/*) resolves WHO the actor is (tenant + actor identity).
 *  - THIS policy decides WHETHER that actor may perform a named {@link AuthorizationAction},
 *    using only the actor's `roleKeys` + `permissionKeys`. It is pure, deterministic, and
 *    performs NO I/O.
 *  - The Governance Kernel remains authoritative for governed lifecycle TRANSITION permission
 *    and guard enforcement. This policy never mutates state and never replaces kernel checks.
 *
 * Precedence (fail CLOSED):
 *  1. Exact permission key present  → allowed (reason 'permission'). Authoritative.
 *  2. Platform-admin role present   → allowed (reason 'platform_admin').
 *  3. A role maps to the action     → allowed (reason 'role').
 *  4. Otherwise                     → denied  (reason 'missing_permission').
 *
 * Missing actor, missing/unknown action, and empty role+permission lists ALL deny.
 */

import type { AuthActor, AuthContext } from '../http/auth/AuthContext.js';
import {
  isKnownAction,
  PLATFORM_ADMIN_ROLE,
  ROLE_ACTION_MAP,
  type AuthorizationAction,
} from './AuthorizationActions.js';
import { AuthorizationDeniedError } from './AuthorizationErrors.js';
import {
  TelemetryAttributeKeys,
  TelemetryCounters,
  TelemetryEvents,
  type Telemetry,
} from '../observability/index.js';

/** Why a decision was reached. Stable, NSO-generic; safe for INTERNAL logs/tests (no secrets). */
export type AuthorizationReason =
  | 'permission'
  | 'platform_admin'
  | 'role'
  | 'missing_permission';

/** The result of an authorization check. `authorize` never throws — it returns this. */
export interface AuthorizationDecision {
  readonly allowed: boolean;
  /** The action that was evaluated (echoed back, even when unknown). */
  readonly action: string;
  readonly reason: AuthorizationReason;
}

/** Does any role the actor holds map to `action` in the static role map? */
function roleGrants(roleKeys: readonly string[], action: AuthorizationAction): boolean {
  for (const role of roleKeys) {
    const actions = ROLE_ACTION_MAP[role];
    if (actions !== undefined && actions.includes(action)) {
      return true;
    }
  }
  return false;
}

/**
 * Decide whether `actor` may perform `action`. Pure + total: returns a decision for every input
 * and NEVER throws. Fails CLOSED for a missing actor, an unknown action, or empty role/permission
 * lists.
 */
export function authorize(
  actor: AuthActor | null | undefined,
  action: string,
): AuthorizationDecision {
  // Fail closed: unknown action (covers empty/garbage) can never be granted.
  if (!isKnownAction(action)) {
    return { allowed: false, action, reason: 'missing_permission' };
  }
  // Fail closed: no actor → no authority.
  if (actor === null || actor === undefined) {
    return { allowed: false, action, reason: 'missing_permission' };
  }

  const permissionKeys = actor.permissionKeys ?? [];
  const roleKeys = actor.roleKeys ?? [];

  // (1) Exact permission key is authoritative — checked before any role mapping.
  if (permissionKeys.includes(action)) {
    return { allowed: true, action, reason: 'permission' };
  }
  // (2) Platform-admin role is the only wildcard.
  if (roleKeys.includes(PLATFORM_ADMIN_ROLE)) {
    return { allowed: true, action, reason: 'platform_admin' };
  }
  // (3) A mapped role grants the action.
  if (roleGrants(roleKeys, action)) {
    return { allowed: true, action, reason: 'role' };
  }
  // (4) Fail closed.
  return { allowed: false, action, reason: 'missing_permission' };
}

/**
 * Assert that the authenticated actor in `auth` may perform `action`. Throws
 * {@link AuthorizationDeniedError} (HTTP 403 / FORBIDDEN) when denied; returns void when allowed.
 *
 * This is the helper HTTP adapters call after authentication has established identity. It does
 * NOT log secrets/tokens and does NOT leak role/permission lists in the thrown message.
 *
 * Optional telemetry: when supplied, a DENIED decision emits an `authz.denied` counter + event
 * carrying only the action and the (NSO-generic, secret-free) reason. The pure {@link authorize}
 * decision is unchanged and never depends on telemetry; emission is best-effort and cannot
 * affect the authorization outcome.
 */
export function assertAuthorized(
  auth: AuthContext,
  action: AuthorizationAction,
  telemetry?: Telemetry,
): void {
  const decision = authorize(auth.actor, action);
  if (!decision.allowed) {
    if (telemetry !== undefined) {
      const attributes = {
        [TelemetryAttributeKeys.action]: decision.action,
        [TelemetryAttributeKeys.reason]: decision.reason,
      };
      telemetry.incrementCounter(TelemetryCounters.authzDenied, 1, attributes);
      telemetry.recordEvent(TelemetryEvents.authzDenied, attributes);
    }
    throw new AuthorizationDeniedError(action);
  }
}
