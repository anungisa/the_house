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

  'affiliation.overview.beginTitle': 'Start your affiliation',
  'affiliation.overview.beginBody':
    'Begin a new affiliation application for the selected organization and season. You can save your progress and return at any time.',
  'affiliation.overview.begin': 'Start affiliation',
  'affiliation.overview.resumeTitle': 'Resume your draft',
  'affiliation.overview.resumeBody':
    'You have a saved affiliation draft. Continue where you left off — nothing is submitted until you choose to.',
  'affiliation.overview.resume': 'Continue draft',
  'affiliation.overview.lastSaved': 'Last saved: {when}',
  'affiliation.overview.notSaved': 'Not yet saved',
  'affiliation.overview.progress': '{completed} of {total} requirements complete',

  'affiliation.requirements.title': 'Requirements',
  'affiliation.requirements.heading': 'Affiliation requirements',
  'affiliation.requirements.intro':
    'Complete each applicable requirement below. Requirements and their versions are set by policy; your responses are saved as a draft and are not submitted here.',
  'affiliation.requirements.progress': '{completed} of {total} complete',
  'affiliation.requirements.back': 'Back to overview',
  'affiliation.requirements.open': 'Open',
  'affiliation.requirements.blockedBy': 'Complete {codes} first',
  'affiliation.requirements.nextActionsHeading': 'What to do next',
  'affiliation.requirements.noSubmit':
    'Submission is not available in this release. Your draft is saved as you go.',
  'affiliation.requirements.allComplete':
    'All applicable requirements are complete. Submission will be available in a later release.',
  'affiliation.requirements.empty': 'No requirements apply to this application yet.',
  'affiliation.submission.readyHeading': 'Ready to submit',
  'affiliation.submission.readyBody':
    'Review your responses before submitting. Submission creates a receipt; it does not approve the application.',
  'affiliation.submission.review': 'Review and submit',
  'affiliation.submission.confirmHeading': 'Confirm submission',
  'affiliation.submission.confirmBody':
    'After submission, the application is read-only unless an authorized reviewer requests a correction.',
  'affiliation.submission.confirm': 'Submit application',
  'affiliation.submission.submitting': 'Submitting\u2026',
  'affiliation.submission.cancel': 'Cancel',
  'affiliation.submission.error':
    'We could not submit the application. Reload the latest version and try again.',
  'affiliation.submission.receiptHeading': 'Submission receipt',
  'affiliation.submission.receiptBody':
    'Your application was submitted. This receipt confirms submission, not approval.',
  'affiliation.submission.receiptNumber': 'Receipt number',
  'affiliation.submission.sequence': 'Submission sequence',
  'affiliation.submission.submitted':
    'This application has been submitted and is read-only while it is reviewed.',

  'affiliation.status.blocked': 'Blocked',
  'affiliation.status.not_started': 'Not started',
  'affiliation.status.in_progress': 'In progress',
  'affiliation.status.evidence_required': 'Document required',
  'affiliation.status.answered': 'Complete',
  'affiliation.status.evidence_associated': 'Complete',

  'affiliation.requirement.title': 'Requirement',
  'affiliation.requirement.appliesBecause': 'Why this applies',
  'affiliation.requirement.version': 'Version {version}',
  'affiliation.requirement.guidance': 'Guidance',
  'affiliation.requirement.save': 'Save response',
  'affiliation.requirement.saving': 'Saving\u2026',
  'affiliation.requirement.saved': 'Response saved',
  'affiliation.requirement.back': 'Back to requirements',
  'affiliation.requirement.evidence': 'Supporting document',
  'affiliation.requirement.evidenceRequiredNote': 'A supporting document is required for this requirement.',
  'affiliation.requirement.attach': 'Attach document',
  'affiliation.requirement.attaching': 'Attaching\u2026',
  'affiliation.requirement.remove': 'Remove',
  'affiliation.requirement.evidenceNote':
    'Attaching a document associates it with this requirement. Association is not acceptance \u2014 it will be reviewed separately.',
  'affiliation.requirement.noEvidence': 'No document attached yet.',
  'affiliation.requirement.associatedAt': 'Attached {when}',
  'affiliation.requirement.conflict':
    'This draft was changed elsewhere. We reloaded the latest version \u2014 please re-enter and save your changes.',
  'affiliation.requirement.saveError': 'We could not save your response. Please try again.',
  'affiliation.requirement.evidenceError': 'We could not attach the document. Please try again.',
  'affiliation.requirement.blockedNote': 'Complete {codes} before this requirement can be started.',

  'affiliation.control.acknowledge': 'I confirm the information on file is current and accurate.',
  'affiliation.control.confirm': 'I confirm this requirement is met.',
  'affiliation.control.text': 'Your response',
  'affiliation.control.document': 'Document description or reference',
  'affiliation.control.contact.name': 'Contact name',
  'affiliation.control.contact.role': 'Role',
  'affiliation.control.contact.email': 'Email',
  'affiliation.control.contact.phone': 'Phone',

  'affiliation.error.notFound.heading': 'Application not found',
  'affiliation.error.notFound.body':
    'This affiliation application is not available for your current context.',
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

  'affiliation.overview.beginTitle': 'Commencer votre affiliation',
  'affiliation.overview.beginBody':
    'Commencez une nouvelle demande d\u2019affiliation pour l\u2019organisation et la saison s\u00e9lectionn\u00e9es. Vous pouvez enregistrer votre progression et revenir \u00e0 tout moment.',
  'affiliation.overview.begin': 'Commencer l\u2019affiliation',
  'affiliation.overview.resumeTitle': 'Reprendre votre brouillon',
  'affiliation.overview.resumeBody':
    'Vous avez un brouillon d\u2019affiliation enregistr\u00e9. Reprenez l\u00e0 o\u00f9 vous \u00eatiez \u2014 rien n\u2019est soumis tant que vous ne le choisissez pas.',
  'affiliation.overview.resume': 'Continuer le brouillon',
  'affiliation.overview.lastSaved': 'Derni\u00e8re sauvegarde : {when}',
  'affiliation.overview.notSaved': 'Pas encore enregistr\u00e9',
  'affiliation.overview.progress': '{completed} des {total} exigences compl\u00e9t\u00e9es',

  'affiliation.requirements.title': 'Exigences',
  'affiliation.requirements.heading': 'Exigences d\u2019affiliation',
  'affiliation.requirements.intro':
    'Compl\u00e9tez chaque exigence applicable ci-dessous. Les exigences et leurs versions sont d\u00e9finies par la politique; vos r\u00e9ponses sont enregistr\u00e9es comme brouillon et ne sont pas soumises ici.',
  'affiliation.requirements.progress': '{completed} sur {total} compl\u00e9t\u00e9es',
  'affiliation.requirements.back': 'Retour \u00e0 l\u2019aper\u00e7u',
  'affiliation.requirements.open': 'Ouvrir',
  'affiliation.requirements.blockedBy': 'Compl\u00e9tez d\u2019abord {codes}',
  'affiliation.requirements.nextActionsHeading': 'Prochaines \u00e9tapes',
  'affiliation.requirements.noSubmit':
    'La soumission n\u2019est pas disponible dans cette version. Votre brouillon est enregistr\u00e9 au fur et \u00e0 mesure.',
  'affiliation.requirements.allComplete':
    'Toutes les exigences applicables sont compl\u00e9t\u00e9es. La soumission sera disponible dans une version ult\u00e9rieure.',
  'affiliation.requirements.empty': 'Aucune exigence ne s\u2019applique encore \u00e0 cette demande.',
  'affiliation.submission.readyHeading': 'Pr\u00eate \u00e0 soumettre',
  'affiliation.submission.readyBody':
    'V\u00e9rifiez vos r\u00e9ponses avant de soumettre. La soumission cr\u00e9e un re\u00e7u; elle n\u2019approuve pas la demande.',
  'affiliation.submission.review': 'V\u00e9rifier et soumettre',
  'affiliation.submission.confirmHeading': 'Confirmer la soumission',
  'affiliation.submission.confirmBody':
    'Apr\u00e8s la soumission, la demande est en lecture seule, sauf si une personne autoris\u00e9e demande une correction.',
  'affiliation.submission.confirm': 'Soumettre la demande',
  'affiliation.submission.submitting': 'Soumission en cours\u2026',
  'affiliation.submission.cancel': 'Annuler',
  'affiliation.submission.error':
    'Nous n\u2019avons pas pu soumettre la demande. Rechargez la derni\u00e8re version et r\u00e9essayez.',
  'affiliation.submission.receiptHeading': 'Re\u00e7u de soumission',
  'affiliation.submission.receiptBody':
    'Votre demande a \u00e9t\u00e9 soumise. Ce re\u00e7u confirme la soumission, et non l\u2019approbation.',
  'affiliation.submission.receiptNumber': 'Num\u00e9ro du re\u00e7u',
  'affiliation.submission.sequence': 'S\u00e9quence de soumission',
  'affiliation.submission.submitted':
    'Cette demande a \u00e9t\u00e9 soumise et est en lecture seule pendant son examen.',

  'affiliation.status.blocked': 'Bloqu\u00e9',
  'affiliation.status.not_started': 'Non commenc\u00e9',
  'affiliation.status.in_progress': 'En cours',
  'affiliation.status.evidence_required': 'Document requis',
  'affiliation.status.answered': 'Compl\u00e9t\u00e9',
  'affiliation.status.evidence_associated': 'Compl\u00e9t\u00e9',

  'affiliation.requirement.title': 'Exigence',
  'affiliation.requirement.appliesBecause': 'Pourquoi cela s\u2019applique',
  'affiliation.requirement.version': 'Version {version}',
  'affiliation.requirement.guidance': 'Directives',
  'affiliation.requirement.save': 'Enregistrer la r\u00e9ponse',
  'affiliation.requirement.saving': 'Enregistrement\u2026',
  'affiliation.requirement.saved': 'R\u00e9ponse enregistr\u00e9e',
  'affiliation.requirement.back': 'Retour aux exigences',
  'affiliation.requirement.evidence': 'Document justificatif',
  'affiliation.requirement.evidenceRequiredNote': 'Un document justificatif est requis pour cette exigence.',
  'affiliation.requirement.attach': 'Joindre un document',
  'affiliation.requirement.attaching': 'Ajout en cours\u2026',
  'affiliation.requirement.remove': 'Retirer',
  'affiliation.requirement.evidenceNote':
    'Joindre un document l\u2019associe \u00e0 cette exigence. L\u2019association n\u2019est pas une acceptation \u2014 il sera examin\u00e9 s\u00e9par\u00e9ment.',
  'affiliation.requirement.noEvidence': 'Aucun document joint pour l\u2019instant.',
  'affiliation.requirement.associatedAt': 'Joint le {when}',
  'affiliation.requirement.conflict':
    'Ce brouillon a \u00e9t\u00e9 modifi\u00e9 ailleurs. Nous avons recharg\u00e9 la derni\u00e8re version \u2014 veuillez r\u00e9inscrire et enregistrer vos modifications.',
  'affiliation.requirement.saveError': 'Nous n\u2019avons pas pu enregistrer votre r\u00e9ponse. Veuillez r\u00e9essayer.',
  'affiliation.requirement.evidenceError': 'Nous n\u2019avons pas pu joindre le document. Veuillez r\u00e9essayer.',
  'affiliation.requirement.blockedNote': 'Compl\u00e9tez {codes} avant de commencer cette exigence.',

  'affiliation.control.acknowledge': 'Je confirme que les renseignements au dossier sont \u00e0 jour et exacts.',
  'affiliation.control.confirm': 'Je confirme que cette exigence est satisfaite.',
  'affiliation.control.text': 'Votre r\u00e9ponse',
  'affiliation.control.document': 'Description ou r\u00e9f\u00e9rence du document',
  'affiliation.control.contact.name': 'Nom de la personne-ressource',
  'affiliation.control.contact.role': 'R\u00f4le',
  'affiliation.control.contact.email': 'Courriel',
  'affiliation.control.contact.phone': 'T\u00e9l\u00e9phone',

  'affiliation.error.notFound.heading': 'Demande introuvable',
  'affiliation.error.notFound.body':
    'Cette demande d\u2019affiliation n\u2019est pas disponible pour votre contexte actuel.',
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
