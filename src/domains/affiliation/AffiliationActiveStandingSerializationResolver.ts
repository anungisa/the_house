/**
 * Serialization-key resolver for the exactly-once affiliation activation invariant.
 *
 * The Governance Kernel is domain-agnostic: it does not know that only ONE application may
 * hold ACTIVE standing per tenant + affiliation subject + season. This resolver supplies the
 * kernel with a deterministic, transaction-scoped advisory-lock key for every transition that
 * GRANTS active standing (`activate`: approved→active, and `reinstate`: suspended→active), so
 * the kernel serializes concurrent activations for the same governed scope.
 *
 * Correctness relies on IMMUTABLE facts: the affiliation subject and season are fixed at
 * application creation. Two racing activations for different applications sharing the same
 * subject + season therefore compute an IDENTICAL key. The loser blocks on the kernel's
 * transaction-scoped lock until the winner commits, after which its uniqueness guard observes
 * the winner's committed ACTIVE standing and fails closed.
 *
 * Read-only: this resolver performs NO governed mutation. It reads only the subject + season
 * via the domain store. When no subject can be determined (no scope/organization recorded), it
 * returns no key — absent a subject there is no governed scope to serialize.
 */

import type {
  TransitionSerializationInput,
  TransitionSerializationKeyResolver,
} from '../../governance/kernel/ports.js';
import type { AffiliationApplicationStore } from './AffiliationApplicationStore.js';
import { AFFILIATION_APPLICATION_ENTITY_TYPE } from './index.js';

/** The governed target state that represents active affiliation standing. */
const ACTIVE_STATE = 'active';

/** Namespace prefix so affiliation keys never collide with other domains' advisory locks. */
const KEY_NAMESPACE = 'AffiliationApplication:active-standing';

export class AffiliationActiveStandingSerializationResolver
  implements TransitionSerializationKeyResolver
{
  constructor(
    private readonly store: Pick<AffiliationApplicationStore, 'getActiveStandingSubject'>,
  ) {}

  async resolveKeys(input: TransitionSerializationInput): Promise<readonly string[]> {
    // Serialize ONLY transitions that grant active standing for this entity type.
    if (input.entityType !== AFFILIATION_APPLICATION_ENTITY_TYPE) return [];
    if (input.toState !== ACTIVE_STATE) return [];

    const scope = await this.store.getActiveStandingSubject(input.tenantId, input.entityId);
    if (scope === undefined) return [];

    // Include the tenant id: advisory locks are cluster-global, so the key must not collide
    // across tenants. Subject + season identify the governed uniqueness scope.
    return [`${KEY_NAMESPACE}:${input.tenantId}:${scope.subject}:${scope.seasonId}`];
  }
}
