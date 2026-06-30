/**
 * Centralized authorization policy — public barrel.
 *
 * Import from `../authz/index.js` to access the action catalog, the pure `authorize` decision
 * function, the `assertAuthorized` HTTP helper, and the `AuthorizationDeniedError` type.
 */

export {
  AuthorizationAction,
  KNOWN_ACTIONS,
  PLATFORM_ADMIN_ROLE,
  ROLE_ACTION_MAP,
  isKnownAction,
} from './AuthorizationActions.js';
export {
  authorize,
  assertAuthorized,
  type AuthorizationDecision,
  type AuthorizationReason,
} from './AuthorizationPolicy.js';
export { AuthorizationDeniedError } from './AuthorizationErrors.js';
