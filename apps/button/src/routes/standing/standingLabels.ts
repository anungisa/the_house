import type { TranslationKey } from '../../i18n/resources';

const KNOWN_STATES = ['unopened', 'pending', 'active', 'suspended', 'lapsed', 'terminated'];
const KNOWN_PATHWAYS = ['continuity', 'renewal_with_remediation', 'new_affiliation'];

/** Map a governed standing state to a controlled translation key (fail-safe to unknown). */
export function standingStateKey(state: string): TranslationKey {
  return (KNOWN_STATES.includes(state)
    ? `standing.state.${state}`
    : 'standing.state.unknown') as TranslationKey;
}

/** Map a standing pathway to a controlled translation key (fail-safe to unknown). */
export function standingPathwayKey(pathway: string): TranslationKey {
  return (KNOWN_PATHWAYS.includes(pathway)
    ? `standing.pathway.${pathway}`
    : 'standing.pathway.unknown') as TranslationKey;
}
