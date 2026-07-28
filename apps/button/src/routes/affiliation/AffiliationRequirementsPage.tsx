import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/resources';
import { usePageTitle } from '../../hooks/usePageTitle';
import { StatusPanel } from '../../components/StatusPanel';
import {
  useAffiliationApplication,
  useSubmitAffiliation,
  toAffiliationCategory,
} from '../../hooks/useAffiliation';
import type { RequirementStatus, RequirementView } from '../../api/affiliationTypes';
import { requirementText } from './requirementText';

function statusLabelKey(status: RequirementStatus): TranslationKey {
  return `affiliation.status.${status}` as TranslationKey;
}

/**
 * Requirements checklist for one draft application. Every posture — blocked, not started, in
 * progress, document required, and complete — is server-derived and rendered with a distinct text
 * label (never colour-only). Submission is intentionally absent (Slice D); the draft is saved as
 * the representative works. Deep-linking to this URL re-fetches the projection, so a representative
 * can safely leave and resume later.
 */
export function AffiliationRequirementsPage(): JSX.Element {
  const { t, locale } = useI18n();
  usePageTitle('affiliation.requirements.title');
  const { applicationId } = useParams<{ applicationId: string }>();
  const query = useAffiliationApplication(applicationId);
  const submit = useSubmitAffiliation(applicationId ?? '');
  const [confirming, setConfirming] = useState(false);

  if (query.isLoading) {
    return (
      <StatusPanel
        kind="loading"
        heading={t('state.loading')}
        body={t('app.loading')}
        statusLabel={t('state.loading')}
      />
    );
  }

  const category = toAffiliationCategory(query.error);
  if (category === 'not-found' || category === 'access-denied') {
    return (
      <StatusPanel
        kind="denied"
        heading={t('affiliation.error.notFound.heading')}
        body={t('affiliation.error.notFound.body')}
        statusLabel={t('affiliation.error.notFound.heading')}
      />
    );
  }
  if (category !== undefined || query.data === undefined) {
    return (
      <StatusPanel
        kind="service-error"
        heading={t('state.service.heading')}
        body={t('state.service.body')}
        statusLabel={t('state.service.heading')}
      >
        <button type="button" onClick={() => void query.refetch()}>
          {t('state.retry')}
        </button>
      </StatusPanel>
    );
  }

  const application = query.data;
  const { completeness, requirements } = application;
  const submitted = application.lifecycleStatus !== 'draft';
  const onSubmit = (): void => {
    submit.mutate({
      expectedVersion: application.concurrencyToken,
      idempotencyKey: `button-submit-${application.applicationId}-${application.concurrencyToken}`,
    });
  };

  return (
    <section aria-labelledby="requirements-heading">
      <p>
        <Link to="/button/affiliation">{t('affiliation.requirements.back')}</Link>
      </p>
      <h1 id="requirements-heading">{t('affiliation.requirements.heading')}</h1>
      <p>{t('affiliation.requirements.intro')}</p>

      <p className="affiliation-progress" data-testid="requirements-progress" role="status">
        {t('affiliation.requirements.progress', {
          completed: String(completeness.completedCount),
          total: String(completeness.totalApplicable),
        })}
      </p>

      {requirements.length === 0 ? (
        <p>{t('affiliation.requirements.empty')}</p>
      ) : (
        <ul className="requirement-list">
          {requirements.map((requirement) => (
            <RequirementRow
              key={requirement.code}
              applicationId={application.applicationId}
              requirement={requirement}
              statusLabel={t(statusLabelKey(requirement.status))}
              title={requirementText(requirement, locale).title}
              openLabel={t('affiliation.requirements.open')}
              versionLabel={t('affiliation.requirement.version', {
                version: String(requirement.version),
              })}
              blockedLabel={
                requirement.blockedBy.length > 0
                  ? t('affiliation.requirements.blockedBy', {
                      codes: requirement.blockedBy.join(', '),
                    })
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      {completeness.eligibleForSubmission ? (
        submit.data ? (
          <section className="affiliation-card" aria-labelledby="submission-receipt-heading">
            <h2 id="submission-receipt-heading">{t('affiliation.submission.receiptHeading')}</h2>
            <p role="status">{t('affiliation.submission.receiptBody')}</p>
            <dl className="context-summary">
              <div>
                <dt>{t('affiliation.submission.receiptNumber')}</dt>
                <dd>{submit.data.receiptId}</dd>
              </div>
              <div>
                <dt>{t('affiliation.submission.sequence')}</dt>
                <dd>{String(submit.data.sequence)}</dd>
              </div>
            </dl>
          </section>
        ) : submitted ? (
          <p className="affiliation-note affiliation-note--complete" role="status">
            {t('affiliation.submission.submitted')}
          </p>
        ) : (
          <section className="affiliation-card" aria-labelledby="submission-heading">
            <h2 id="submission-heading">{t('affiliation.submission.readyHeading')}</h2>
            <p>{t('affiliation.submission.readyBody')}</p>
            {confirming ? (
              <div role="group" aria-label={t('affiliation.submission.confirmHeading')}>
                <p><strong>{t('affiliation.submission.confirmHeading')}</strong></p>
                <p>{t('affiliation.submission.confirmBody')}</p>
                <button type="button" onClick={onSubmit} disabled={submit.isPending}>
                  {submit.isPending
                    ? t('affiliation.submission.submitting')
                    : t('affiliation.submission.confirm')}
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={submit.isPending}>
                  {t('affiliation.submission.cancel')}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)}>
                {t('affiliation.submission.review')}
              </button>
            )}
            {toAffiliationCategory(submit.error) !== undefined ? (
              <p className="affiliation-note affiliation-note--error" role="alert">
                {t('affiliation.submission.error')}
              </p>
            ) : null}
          </section>
        )
      ) : (
        <p className="affiliation-note">{t('affiliation.requirements.noSubmit')}</p>
      )}
    </section>
  );
}

function RequirementRow({
  applicationId,
  requirement,
  statusLabel,
  title,
  openLabel,
  versionLabel,
  blockedLabel,
}: {
  readonly applicationId: string;
  readonly requirement: RequirementView;
  readonly statusLabel: string;
  readonly title: string;
  readonly openLabel: string;
  readonly versionLabel: string;
  readonly blockedLabel: string | undefined;
}): JSX.Element {
  return (
    <li className="requirement-row" data-status={requirement.status} data-complete={requirement.complete}>
      <div className="requirement-row__main">
        <span className="requirement-row__title">{title}</span>
        <span className="requirement-row__meta">{versionLabel}</span>
        {blockedLabel ? <span className="requirement-row__blocked">{blockedLabel}</span> : null}
      </div>
      <span className="requirement-row__status" data-testid={`status-${requirement.code}`}>
        {statusLabel}
      </span>
      <Link
        to={`/button/affiliation/${applicationId}/requirements/${requirement.code}`}
        aria-label={`${openLabel}: ${title}`}
      >
        {openLabel}
      </Link>
    </li>
  );
}
