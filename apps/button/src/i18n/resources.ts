/**
 * Controlled bilingual (English / French) resources for the Button.
 *
 * All representative-facing copy comes from these dictionaries — never from free text supplied by
 * another tenant or from the backend. Both locales share an identical key set (enforced by the
 * `Record<TranslationKey, string>` type), so a missing translation is a compile error.
 */

export type ButtonLocale = 'en' | 'fr';

export const SUPPORTED_LOCALES: readonly ButtonLocale[] = ['en', 'fr'];

const en = {
  'app.title': 'The Button',
  'app.subtitle': 'Curling Canada — Affiliation',
  'app.skipToContent': 'Skip to main content',
  'app.signOut': 'Sign out',
  'app.support': 'Support',
  'app.representative': 'Representative',
  'app.loading': 'Loading your context\u2026',

  'nav.home': 'Home',
  'nav.selectContext': 'Select context',
  'nav.affiliation': 'Affiliation',
  'nav.primary': 'Primary navigation',

  'lang.switch': 'Language',
  'lang.en': 'English',
  'lang.fr': 'Fran\u00e7ais',
  'lang.toFrench': 'Passer en fran\u00e7ais',
  'lang.toEnglish': 'Switch to English',

  'context.current': 'Current context',
  'context.organization': 'Organization',
  'context.jurisdiction': 'Jurisdiction',
  'context.season': 'Season',
  'context.none': 'No context selected',
  'context.choosePrompt': 'Choose the organization and season you are acting for.',
  'context.chooseOrganization': 'Organization',
  'context.chooseSeason': 'Season',
  'context.continue': 'Continue',
  'context.selected': 'Context selected',

  'jurisdiction.national': 'National',
  'jurisdiction.regional': 'Provincial / Territorial',
  'jurisdiction.member': 'Member association',

  'affiliation.title': 'Affiliation',
  'affiliation.heading': 'Affiliation overview',
  'affiliation.intro':
    'Manage your club\u2019s affiliation for the selected season. Detailed requirements arrive in the next release.',
  'affiliation.forOrganization': 'Affiliation for {organization}',

  'home.heading': 'Welcome',
  'home.intro': 'Select the context you are acting for to continue to affiliation.',
  'home.enter': 'Get started',

  'state.loading': 'Loading\u2026',
  'state.empty.heading': 'No organizations available',
  'state.empty.body':
    'You are signed in, but no organizations are available for you to represent yet.',
  'state.denied.heading': 'Access not available',
  'state.denied.body':
    'You do not currently have representative authority for this area.',
  'state.expired.heading': 'Representative authority expired',
  'state.expired.body':
    'Your authority to act for this organization is no longer active. Contact support to renew it.',
  'state.service.heading': 'Service temporarily unavailable',
  'state.service.body': 'We could not load your context. Please try again shortly.',
  'state.retry': 'Try again',
  'state.supportReference': 'Support reference: {reference}',

  'error.unauthenticated.heading': 'Sign-in required',
  'error.unauthenticated.body': 'Your session is not active. Please sign in again.',
} as const;

export type TranslationKey = keyof typeof en;

const fr: Record<TranslationKey, string> = {
  'app.title': 'Le Bouton',
  'app.subtitle': 'Curling Canada \u2014 Affiliation',
  'app.skipToContent': 'Passer au contenu principal',
  'app.signOut': 'Se d\u00e9connecter',
  'app.support': 'Soutien',
  'app.representative': 'Repr\u00e9sentant',
  'app.loading': 'Chargement de votre contexte\u2026',

  'nav.home': 'Accueil',
  'nav.selectContext': 'Choisir le contexte',
  'nav.affiliation': 'Affiliation',
  'nav.primary': 'Navigation principale',

  'lang.switch': 'Langue',
  'lang.en': 'English',
  'lang.fr': 'Fran\u00e7ais',
  'lang.toFrench': 'Passer en fran\u00e7ais',
  'lang.toEnglish': 'Switch to English',

  'context.current': 'Contexte actuel',
  'context.organization': 'Organisation',
  'context.jurisdiction': 'Comp\u00e9tence',
  'context.season': 'Saison',
  'context.none': 'Aucun contexte s\u00e9lectionn\u00e9',
  'context.choosePrompt': 'Choisissez l\u2019organisation et la saison pour lesquelles vous agissez.',
  'context.chooseOrganization': 'Organisation',
  'context.chooseSeason': 'Saison',
  'context.continue': 'Continuer',
  'context.selected': 'Contexte s\u00e9lectionn\u00e9',

  'jurisdiction.national': 'National',
  'jurisdiction.regional': 'Provincial / Territorial',
  'jurisdiction.member': 'Association membre',

  'affiliation.title': 'Affiliation',
  'affiliation.heading': 'Aper\u00e7u de l\u2019affiliation',
  'affiliation.intro':
    'G\u00e9rez l\u2019affiliation de votre club pour la saison s\u00e9lectionn\u00e9e. Les exigences d\u00e9taill\u00e9es arriveront dans la prochaine version.',
  'affiliation.forOrganization': 'Affiliation pour {organization}',

  'home.heading': 'Bienvenue',
  'home.intro': 'S\u00e9lectionnez le contexte pour lequel vous agissez afin de continuer vers l\u2019affiliation.',
  'home.enter': 'Commencer',

  'state.loading': 'Chargement\u2026',
  'state.empty.heading': 'Aucune organisation disponible',
  'state.empty.body':
    'Vous \u00eates connect\u00e9, mais aucune organisation n\u2019est encore disponible pour vous.',
  'state.denied.heading': 'Acc\u00e8s non disponible',
  'state.denied.body':
    'Vous n\u2019avez pas actuellement l\u2019autorit\u00e9 de repr\u00e9sentant pour cette zone.',
  'state.expired.heading': 'Autorit\u00e9 de repr\u00e9sentant expir\u00e9e',
  'state.expired.body':
    'Votre autorit\u00e9 pour cette organisation n\u2019est plus active. Contactez le soutien pour la renouveler.',
  'state.service.heading': 'Service temporairement indisponible',
  'state.service.body': 'Nous n\u2019avons pas pu charger votre contexte. Veuillez r\u00e9essayer sous peu.',
  'state.retry': 'R\u00e9essayer',
  'state.supportReference': 'R\u00e9f\u00e9rence de soutien : {reference}',

  'error.unauthenticated.heading': 'Connexion requise',
  'error.unauthenticated.body': 'Votre session n\u2019est pas active. Veuillez vous reconnecter.',
};

export const RESOURCES: Record<ButtonLocale, Record<TranslationKey, string>> = {
  en,
  fr,
};

/** Interpolate `{name}` placeholders from a params map. */
export function interpolate(
  template: string,
  params?: Readonly<Record<string, string>>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => params[key] ?? `{${key}}`);
}

export function isSupportedLocale(value: string | null | undefined): value is ButtonLocale {
  return value === 'en' || value === 'fr';
}
