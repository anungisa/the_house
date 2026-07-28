import { Link } from 'react-router-dom';

import { useI18n } from '../i18n/I18nProvider';
import { usePageTitle } from '../hooks/usePageTitle';
import { StatusPanel } from '../components/StatusPanel';

export function AuthorityExpiredPage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('state.expired.heading');
  return (
    <StatusPanel
      kind="expired"
      heading={t('state.expired.heading')}
      body={t('state.expired.body')}
      statusLabel={t('state.expired.heading')}
    >
      <Link to="/button">{t('nav.home')}</Link>
    </StatusPanel>
  );
}
