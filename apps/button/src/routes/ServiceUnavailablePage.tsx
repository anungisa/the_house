import { useI18n } from '../i18n/I18nProvider';
import { usePageTitle } from '../hooks/usePageTitle';
import { useButtonContext } from '../context/ButtonContextProvider';
import { StatusPanel } from '../components/StatusPanel';

export function ServiceUnavailablePage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('state.service.heading');
  const { refresh, isFetching } = useButtonContext();
  return (
    <StatusPanel
      kind="service-error"
      heading={t('state.service.heading')}
      body={t('state.service.body')}
      statusLabel={t('state.service.heading')}
    >
      <button type="button" onClick={() => void refresh()} disabled={isFetching}>
        {t('state.retry')}
      </button>
    </StatusPanel>
  );
}
