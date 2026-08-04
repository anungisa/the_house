import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18n } from '../../i18n/I18nProvider';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useButtonContext } from '../../context/ButtonContextProvider';
import { StatusPanel } from '../../components/StatusPanel';
import {
  useAffiliationOverview,
  useInitiateAffiliation,
  toAffiliationCategory,
} from '../../hooks/useAffiliation';

/**
 * Affiliation overview: the entry point for the selected organization + season. It distinguishes
 * BEGIN (no draft yet — the representative may initiate one) from RESUME (a saved draft exists —
 * continue where they left off). Both routes lead into the requirements checklist. Nothing is
 * submitted here; a draft is saved as the representative works.
 */
export function AffiliationOverviewPage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('affiliation.title');
  const navigate = useNavigate();
  const { view } = useButtonContext();
  const current = view?.currentContext ?? null;

  const organizationId = current?.organizationId;
  const season = current?.season.id;
  const overview = useAffiliationOverview(organizationId, season);
  const initiate = useInitiateAffiliation();

  const existingApplicationId = overview.data?.application?.applicationId;

  // Once an initiate succeeds, move into the requirements checklist for the new/resumed draft.
  useEffect(() => {
    if (initiate.data) {
      navigate(`/button/affiliation/${initiate.data.applicationId}`);
    }
  }, [initiate.data, navigate]);

  const onBegin = (): void => {
    if (organizationId === undefined || season === undefined) return;
    initiate.mutate({ organizationId, seasonId: season });
  };

  const onResume = (): void => {
    if (existingApplicationId) navigate(`/button/affiliation/${existingApplicationId}`);
  };

  return (
    <section aria-labelledby="affiliation-heading">
      <h1 id="affiliation-heading">{t('affiliation.heading')}</h1>
      {current ? (
        <>
          <p>{t('affiliation.forOrganization', { organization: current.organizationDisplayName })}</p>
          <dl className="context-summary">
            <div>
              <dt>{t('context.jurisdiction')}</dt>
              <dd>{current.jurisdiction ? current.jurisdiction.label : t('context.none')}</dd>
            </div>
            <div>
              <dt>{t('context.season')}</dt>
              <dd>{current.season.label}</dd>
            </div>
          </dl>
        </>
      ) : null}

      {overview.isLoading ? (
        <StatusPanel
          kind="loading"
          heading={t('state.loading')}
          body={t('app.loading')}
          statusLabel={t('state.loading')}
        />
      ) : toAffiliationCategory(overview.error) === 'service-unavailable' ? (
        <StatusPanel
          kind="service-error"
          heading={t('state.service.heading')}
          body={t('state.service.body')}
          statusLabel={t('state.service.heading')}
        >
          <button type="button" onClick={() => void overview.refetch()}>
            {t('state.retry')}
          </button>
        </StatusPanel>
      ) : overview.data?.application ? (
        <section className="affiliation-card" aria-labelledby="affiliation-resume-heading">
          <h2 id="affiliation-resume-heading">
            {overview.data.application.lifecycleStatus === 'draft'
              ? t('affiliation.overview.resumeTitle')
              : t('affiliation.overview.trackTitle')}
          </h2>
          <p>
            {overview.data.application.lifecycleStatus === 'draft'
              ? t('affiliation.overview.resumeBody')
              : t('affiliation.overview.trackBody')}
          </p>
          <p className="affiliation-progress" data-testid="overview-progress">
            {t('affiliation.overview.progress', {
              completed: String(overview.data.application.completeness.completedCount),
              total: String(overview.data.application.completeness.totalApplicable),
            })}
          </p>
          <button type="button" onClick={onResume}>
            {overview.data.application.lifecycleStatus === 'draft'
              ? t('affiliation.overview.resume')
              : t('affiliation.overview.viewOutcome')}
          </button>
        </section>
      ) : (
        <section className="affiliation-card" aria-labelledby="affiliation-begin-heading">
          <h2 id="affiliation-begin-heading">{t('affiliation.overview.beginTitle')}</h2>
          <p>{t('affiliation.overview.beginBody')}</p>
          <button type="button" onClick={onBegin} disabled={initiate.isPending}>
            {t('affiliation.overview.begin')}
          </button>
        </section>
      )}
    </section>
  );
}
