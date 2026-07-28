import { Link } from 'react-router-dom';

import { useI18n } from '../i18n/I18nProvider';
import { usePageTitle } from '../hooks/usePageTitle';
import { useButtonContext } from '../context/ButtonContextProvider';
import { StatusPanel } from '../components/StatusPanel';

export function AccessDeniedPage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('state.denied.heading');
  const { view } = useButtonContext();
  return (
    <StatusPanel
      kind="denied"
      heading={t('state.denied.heading')}
      body={t('state.denied.body')}
      statusLabel={t('state.denied.heading')}
    >
      {view?.supportReference ? (
        <p className="support-reference">
          {t('state.supportReference', { reference: view.supportReference })}
        </p>
      ) : null}
      <Link to="/button">{t('nav.home')}</Link>
    </StatusPanel>
  );
}
