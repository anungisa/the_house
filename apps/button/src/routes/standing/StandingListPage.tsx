import { Link } from 'react-router-dom';

import { useI18n } from '../../i18n/I18nProvider';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toAffiliationCategory, useStanding } from '../../hooks/useAffiliation';
import type { StandingView } from '../../api/affiliationTypes';
import { standingPathwayKey, standingStateKey } from './standingLabels';

export function StandingListPage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('standing.title');
  const standing = useStanding();

  if (standing.isLoading) return <p role="status">{t('state.loading')}</p>;
  if (standing.isError) {
    return (
      <p role="alert" className="affiliation-note affiliation-note--error">
        {toAffiliationCategory(standing.error) === 'access-denied'
          ? t('state.denied.body')
          : t('standing.error.load')}
      </p>
    );
  }

  return (
    <section aria-labelledby="standing-heading">
      <h1 id="standing-heading">{t('standing.heading')}</h1>
      <p>{t('standing.intro')}</p>
      {standing.data?.length === 0 ? (
        <p role="status">{t('standing.empty')}</p>
      ) : (
        <ul className="affiliation-list" aria-label={t('standing.listLabel')}>
          {standing.data?.map((record) => (
            <StandingListItem key={record.standingId} record={record} />
          ))}
        </ul>
      )}
    </section>
  );
}

function StandingListItem({ record }: { readonly record: StandingView }): JSX.Element {
  const { t } = useI18n();
  return (
    <li className="affiliation-card">
      <h2>{t('standing.recordHeading', { season: record.season })}</h2>
      <dl>
        <dt>{t('standing.status')}</dt>
        <dd>{t(standingStateKey(record.status))}</dd>
        <dt>{t('standing.pathway')}</dt>
        <dd>{t(standingPathwayKey(record.pathway))}</dd>
        <dt>{t('standing.expiry')}</dt>
        <dd>
          {record.isExpired
            ? t('standing.expired')
            : record.daysUntilExpiry === null
              ? t('standing.noExpiry')
              : t('standing.expiresIn', { days: String(record.daysUntilExpiry) })}
        </dd>
      </dl>
      {record.status === 'lapsed' && (
        <p role="note" className="affiliation-note">
          {t('standing.renewalRequired')}
        </p>
      )}
      <Link to={`/button/standing/${encodeURIComponent(record.standingId)}`}>
        {t('standing.viewDetail')}
      </Link>
    </li>
  );
}
