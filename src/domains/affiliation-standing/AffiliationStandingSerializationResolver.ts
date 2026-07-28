/**
 * Serialization-key resolver for concurrent effective-period changes on ONE standing.
 *
 * Period-class transitions (`renew`, `renew_active`, `expire`) each read the standing's persisted
 * effective period and append a period/event row (renewals also bump the head version). Two of them
 * racing on the SAME standing could otherwise interleave and post contradictory periods or a
 * duplicated version. This resolver hands the kernel a deterministic, transaction-scoped
 * advisory-lock key per tenant + standing for exactly those triggers, so the kernel serializes
 * them: the loser blocks until the winner commits and then re-evaluates its guards against
 * committed state (fail closed).
 *
 * Read-only: this resolver performs NO governed mutation. Non-period triggers and other entity
 * types get no key (no added serialization).
 */

import type {
  TransitionSerializationInput,
  TransitionSerializationKeyResolver,
} from '../../governance/kernel/ports.js';
import { AFFILIATION_STANDING_ENTITY_TYPE } from './index.js';

/** Triggers whose concurrent execution on one standing must be serialized. */
const PERIOD_TRIGGERS: ReadonlySet<string> = new Set(['renew', 'renew_active', 'expire']);

/** Namespace prefix so standing keys never collide with other domains' advisory locks. */
const KEY_NAMESPACE = 'AffiliationStanding:period';

export class AffiliationStandingSerializationResolver
  implements TransitionSerializationKeyResolver
{
  resolveKeys(input: TransitionSerializationInput): Promise<readonly string[]> {
    if (input.entityType !== AFFILIATION_STANDING_ENTITY_TYPE) {
      return Promise.resolve([]);
    }
    if (!PERIOD_TRIGGERS.has(input.trigger)) return Promise.resolve([]);
    // Tenant + standing id identifies the governed effective-period scope. Advisory locks are
    // cluster-global, so the tenant id must be part of the key.
    return Promise.resolve([`${KEY_NAMESPACE}:${input.tenantId}:${input.entityId}`]);
  }
}
