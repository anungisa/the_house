import { Link, useParams } from 'react-router-dom';

import { useI18n } from '../../i18n/I18nProvider';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toAffiliationCategory, useStandingDetail } from '../../hooks/useAffiliation';
import { standingPathwayKey, standingStateKey } from './standingLabels';

export function StandingDetailPage(): JSX.Element {
  const { standingId } = useParams<{ standingId: string }>();
  const { t, locale } = useI18n();
  usePageTitle('standing.detailTitle');
  const standing = useStandingDetail(standingId);

  const formatDate = (iso: string): string =>
    new Intl.DateTimeFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(iso));

  if (standing.isLoading) return <p role="status">{t('state.loading')}</p>;
  if (standing.isError) {
    const category = toAffiliationCategory(standing.error);
    return (
      <section aria-labelledby="standing-detail-heading">
        <h1 id="standing-detail-heading">{t('standing.detailHeading')}</h1>
        <p role="alert" className="affiliation-note affiliation-note--error">
          {category === 'not-found'
            ? t('standing.error.notFound')
            : category === 'access-denied'
              ? t('state.denied.body')
              : t('standing.error.load')}
        </p>
        <Link to="/button/standing">{t('standing.back')}</Link>
      </section>
    );
  }

  const record = standing.data;
  if (record === undefined) return <p role="status">{t('state.loading')}</p>;

  return (
    <section aria-labelledby="standing-detail-heading">
      <h1 id="standing-detail-heading">{t('standing.detailHeading')}</h1>
      <dl>
        <dt>{t('standing.season')}</dt>
        <dd>{record.season}</dd>
        <dt>{t('standing.status')}</dt>
        <dd>{t(standingStateKey(record.status))}</dd>
        <dt>{t('standing.pathway')}</dt>
        <dd>{t(standingPathwayKey(record.pathway))}</dd>
        <dt>{t('standing.application')}</dt>
        <dd>{record.affiliationApplicationId}</dd>
        <dt>{t('standing.version')}</dt>
        <dd>{record.standingVersion}</dd>
        <dt>{t('standing.effectiveFrom')}</dt>
        <dd>{formatDate(record.effectiveFrom)}</dd>
        <dt>{t('standing.effectiveUntil')}</dt>
        <dd>{formatDate(record.effectiveUntil)}</dd>
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
      <Link to="/button/standing">{t('standing.back')}</Link>
    </section>
  );
}
