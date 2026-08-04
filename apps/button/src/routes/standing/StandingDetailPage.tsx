import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/resources';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  toAffiliationCategory,
  useInitiateStandingRenewal,
  useStandingDetail,
} from '../../hooks/useAffiliation';
import type { StandingRenewal } from '../../api/affiliationTypes';
import { standingPathwayKey, standingStateKey } from './standingLabels';

function renewalPathwayKey(pathway: StandingRenewal['pathway']): TranslationKey {
  return pathway === 'continuity'
    ? 'standing.renewal.pathway.continuity'
    : 'standing.renewal.pathway.renewal_with_remediation';
}

function RenewalSection({
  standingId,
  renewal,
}: {
  standingId: string;
  renewal: StandingRenewal;
}): JSX.Element {
  const { t } = useI18n();
  const navigate = useNavigate();
  const initiate = useInitiateStandingRenewal(standingId);
  const firstSeason = renewal.targetSeasons[0]?.id ?? '';
  const [targetSeasonId, setTargetSeasonId] = useState(firstSeason);

  if (renewal.posture === 'in_progress') {
    const applicationId = renewal.renewalApplicationId;
    return (
      <section aria-labelledby="standing-renewal-heading" className="affiliation-note">
        <h2 id="standing-renewal-heading">{t('standing.renewal.heading')}</h2>
        <p>{t('standing.renewal.inProgress')}</p>
        {applicationId !== undefined && (
          <Link to={`/button/affiliation/${applicationId}`}>
            {t('standing.renewal.continue')}
          </Link>
        )}
      </section>
    );
  }

  if (renewal.posture === 'reconciliation_required') {
    return (
      <section aria-labelledby="standing-renewal-heading" className="affiliation-note">
        <h2 id="standing-renewal-heading">{t('standing.renewal.heading')}</h2>
        <p role="note">{t('standing.renewal.reconciliation')}</p>
      </section>
    );
  }

  if (renewal.posture !== 'eligible' || renewal.targetSeasons.length === 0) {
    return (
      <section aria-labelledby="standing-renewal-heading" className="affiliation-note">
        <h2 id="standing-renewal-heading">{t('standing.renewal.heading')}</h2>
        <p role="note">
          {renewal.targetSeasons.length === 0 && renewal.posture === 'eligible'
            ? t('standing.renewal.noSeasons')
            : t('standing.renewal.notEligible')}
        </p>
      </section>
    );
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (targetSeasonId === '' || initiate.isPending) return;
    initiate.mutate(
      { targetSeasonId },
      {
        onSuccess: (result) => {
          navigate(`/button/affiliation/${result.renewalApplicationId}`);
        },
      },
    );
  };

  return (
    <section aria-labelledby="standing-renewal-heading" className="affiliation-note">
      <h2 id="standing-renewal-heading">{t('standing.renewal.heading')}</h2>
      <p>{t('standing.renewal.eligible')}</p>
      {renewal.pathway !== undefined && <p>{t(renewalPathwayKey(renewal.pathway))}</p>}
      <form onSubmit={onSubmit}>
        <label htmlFor="renewal-target-season">{t('standing.renewal.selectSeason')}</label>
        <select
          id="renewal-target-season"
          value={targetSeasonId}
          onChange={(event) => setTargetSeasonId(event.target.value)}
          disabled={initiate.isPending}
        >
          {renewal.targetSeasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={targetSeasonId === '' || initiate.isPending}>
          {initiate.isPending ? t('standing.renewal.starting') : t('standing.renewal.start')}
        </button>
      </form>
      {initiate.isError && (
        <p role="alert" className="affiliation-note affiliation-note--error">
          {t('standing.renewal.error')}
        </p>
      )}
    </section>
  );
}

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

  const detail = standing.data;
  if (detail === undefined) return <p role="status">{t('state.loading')}</p>;
  const record = detail.standing;

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
      {detail.renewal !== undefined && standingId !== undefined && (
        <RenewalSection standingId={standingId} renewal={detail.renewal} />
      )}
      <Link to="/button/standing">{t('standing.back')}</Link>
    </section>
  );
}
