/**
 * Serialization-key resolver for concurrent reconciliation/correction on ONE financial obligation.
 *
 * Reconciliation-class transitions (`reconcile`, `record_mismatch`, `resolve_mismatch`) each read
 * the obligation's persisted amounts and append a reconciliation row. Two of them racing on the
 * SAME obligation could otherwise interleave and post contradictory outcomes. This resolver hands
 * the kernel a deterministic, transaction-scoped advisory-lock key per tenant + obligation for
 * exactly those triggers, so the kernel serializes them: the loser blocks until the winner commits
 * and then re-evaluates its guards against committed state (fail closed).
 *
 * Read-only: this resolver performs NO governed mutation. Non-reconciliation triggers and other
 * entity types get no key (no added serialization).
 */

import type {
  TransitionSerializationInput,
  TransitionSerializationKeyResolver,
} from '../../governance/kernel/ports.js';
import { AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE } from './index.js';

/** Triggers whose concurrent execution on one obligation must be serialized. */
const RECONCILIATION_TRIGGERS: ReadonlySet<string> = new Set([
  'reconcile',
  'record_mismatch',
  'resolve_mismatch',
]);

/** Namespace prefix so financial keys never collide with other domains' advisory locks. */
const KEY_NAMESPACE = 'AffiliationFinancialObligation:reconciliation';

export class FinancialObligationSerializationResolver
  implements TransitionSerializationKeyResolver
{
  resolveKeys(input: TransitionSerializationInput): Promise<readonly string[]> {
    if (input.entityType !== AFFILIATION_FINANCIAL_OBLIGATION_ENTITY_TYPE) {
      return Promise.resolve([]);
    }
    if (!RECONCILIATION_TRIGGERS.has(input.trigger)) return Promise.resolve([]);
    // Tenant + obligation id identifies the governed reconciliation scope. Advisory locks are
    // cluster-global, so the tenant id must be part of the key.
    return Promise.resolve([`${KEY_NAMESPACE}:${input.tenantId}:${input.entityId}`]);
  }
}
