import { Link } from 'react-router-dom';

import { useI18n } from '../i18n/I18nProvider';
import { usePageTitle } from '../hooks/usePageTitle';

export function EntryPage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('nav.home');
  return (
    <section aria-labelledby="home-heading">
      <h1 id="home-heading">{t('home.heading')}</h1>
      <p>{t('home.intro')}</p>
      <Link className="button-link" to="/button/select-context">
        {t('home.enter')}
      </Link>
    </section>
  );
}
