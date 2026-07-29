import { useAffiliationReviewQueue, useStartAffiliationReview } from '../../hooks/useAffiliation';
import { useI18n } from '../../i18n/I18nProvider';
import { usePageTitle } from '../../hooks/usePageTitle';
import { StatusPanel } from '../../components/StatusPanel';
import { Link } from 'react-router-dom';

export function AffiliationReviewQueuePage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('review.queue.title');
  const queue = useAffiliationReviewQueue();
  const start = useStartAffiliationReview();
  const statusLabel = (state: 'submitted' | 'under_review' | 'approved' | 'active'): string => {
    if (state === 'submitted') return t('review.queue.submitted');
    if (state === 'under_review') return t('review.queue.underReview');
    if (state === 'approved') return t('review.queue.approved');
    return t('review.queue.active');
  };

  if (queue.isLoading) {
    return (
      <StatusPanel
        kind="loading"
        heading={t('state.loading')}
        body={t('review.queue.loading')}
        statusLabel={t('state.loading')}
      />
    );
  }
  if (queue.error || queue.data === undefined) {
    return (
      <StatusPanel
        kind="service-error"
        heading={t('state.service.heading')}
        body={t('state.service.body')}
        statusLabel={t('state.service.heading')}
      >
        <button type="button" onClick={() => void queue.refetch()}>
          {t('state.retry')}
        </button>
      </StatusPanel>
    );
  }

  return (
    <section aria-labelledby="review-queue-heading">
      <h1 id="review-queue-heading">{t('review.queue.heading')}</h1>
      <p>{t('review.queue.intro')}</p>
      {start.error ? (
        <p role="alert" className="affiliation-note affiliation-note--error">
          {t('review.queue.startError')}
        </p>
      ) : null}
      {queue.data.length === 0 ? (
        <p role="status">{t('review.queue.empty')}</p>
      ) : (
        <ul className="requirement-list" aria-label={t('review.queue.listLabel')}>
          {queue.data.map((item) => (
            <li key={item.applicationId} className="requirement-card">
              <h2>{t('review.queue.case', { id: item.applicationId })}</h2>
              <dl className="context-summary">
                <div>
                  <dt>{t('context.season')}</dt>
                  <dd>{item.seasonId}</dd>
                </div>
                <div>
                  <dt>{t('review.queue.status')}</dt>
                  <dd>
                    {statusLabel(item.lifecycleState)}
                  </dd>
                </div>
                <div>
                  <dt>{t('affiliation.submission.sequence')}</dt>
                  <dd>{String(item.submissionSequence)}</dd>
                </div>
              </dl>
              {item.lifecycleState === 'submitted' ? (
                <button
                  type="button"
                  disabled={start.isPending}
                  onClick={() => start.mutate(item.applicationId)}
                >
                  {start.isPending ? t('review.queue.starting') : t('review.queue.start')}
                </button>
              ) : (
                <>
                  <p role="status">{t('review.queue.assignedToYou')}</p>
                  <Link to={`/button/review/${encodeURIComponent(item.applicationId)}`}>
                    {t('review.queue.open')}
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
