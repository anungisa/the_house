import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/resources';
import { usePageTitle } from '../hooks/usePageTitle';
import { useButtonContext } from '../context/ButtonContextProvider';

/**
 * Affiliation landing for the selected context. This route is only reachable once the server has
 * confirmed an ACTIVE representative authority for the selected organization (see the affiliation
 * guard); it renders a representative-safe overview scoped to that organization + season.
 */
export function AffiliationPage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('affiliation.title');
  const { view } = useButtonContext();
  const current = view?.currentContext ?? null;

  return (
    <section aria-labelledby="affiliation-heading">
      <h1 id="affiliation-heading">{t('affiliation.heading')}</h1>
      {current ? (
        <>
          <p>
            {t('affiliation.forOrganization', { organization: current.organizationDisplayName })}
          </p>
          <dl className="context-summary">
            <div>
              <dt>{t('context.jurisdiction')}</dt>
              <dd>{t(current.jurisdiction.labelKey as TranslationKey)}</dd>
            </div>
            <div>
              <dt>{t('context.season')}</dt>
              <dd>{current.season.label}</dd>
            </div>
          </dl>
        </>
      ) : null}
      <p>{t('affiliation.intro')}</p>
    </section>
  );
}
