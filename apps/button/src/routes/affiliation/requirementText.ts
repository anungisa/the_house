import type { ButtonLocale } from '../../api/types';
import type { RequirementView } from '../../api/affiliationTypes';

/** Pick the locale-appropriate title + guidance from a requirement's controlled bilingual copy. */
export function requirementText(
  requirement: RequirementView,
  locale: ButtonLocale,
): { readonly title: string; readonly guidance: string } {
  return locale === 'fr'
    ? { title: requirement.titleFr, guidance: requirement.guidanceFr }
    : { title: requirement.titleEn, guidance: requirement.guidanceEn };
}
