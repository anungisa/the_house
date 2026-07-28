import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  useAffiliationReviewCase,
  useOpenAffiliationCorrection,
} from '../../hooks/useAffiliation';
import { useI18n } from '../../i18n/I18nProvider';
import { usePageTitle } from '../../hooks/usePageTitle';
import { StatusPanel } from '../../components/StatusPanel';

function displayValue(value: unknown, yes: string, no: string): string {
  if (typeof value === 'boolean') return value ? yes : no;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

export function AffiliationReviewCasePage(): JSX.Element {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { locale, t } = useI18n();
  usePageTitle('review.case.title');
  const reviewCase = useAffiliationReviewCase(applicationId);
  const correction = useOpenAffiliationCorrection(applicationId ?? '');
  const [requirementCode, setRequirementCode] = useState('');
  const [reason, setReason] = useState('');

  if (reviewCase.isLoading) {
    return (
      <StatusPanel
        kind="loading"
        heading={t('state.loading')}
        body={t('review.case.loading')}
        statusLabel={t('state.loading')}
      />
    );
  }
  if (reviewCase.error || reviewCase.data === undefined) {
    return (
      <StatusPanel
        kind="service-error"
        heading={t('state.service.heading')}
        body={t('state.service.body')}
        statusLabel={t('state.service.heading')}
      >
        <button type="button" onClick={() => void reviewCase.refetch()}>
          {t('state.retry')}
        </button>
      </StatusPanel>
    );
  }

  const data = reviewCase.data;
  const selectedCode = requirementCode || data.requirements[0]?.code || '';
  const fieldLabels: Readonly<Record<string, string>> = {
    acknowledged: t('review.case.field.acknowledged'),
    confirmed: t('review.case.field.confirmed'),
    attached: t('review.case.field.attached'),
    name: t('review.case.field.name'),
    role: t('review.case.field.role'),
    email: t('review.case.field.email'),
    phone: t('review.case.field.phone'),
    description: t('review.case.field.description'),
  };
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (selectedCode === '' || reason.trim() === '') return;
    correction.mutate([{ requirementCode: selectedCode, reason: reason.trim() }]);
  };

  return (
    <section aria-labelledby="review-case-heading">
      <Link to="/button/review">{t('review.case.back')}</Link>
      <h1 id="review-case-heading">{t('review.case.heading')}</h1>
      <p className="affiliation-note">{t('review.case.snapshotNotice')}</p>
      <dl className="context-summary">
        <div>
          <dt>{t('context.season')}</dt>
          <dd>{data.seasonId}</dd>
        </div>
        <div>
          <dt>{t('affiliation.submission.sequence')}</dt>
          <dd>{String(data.submissionSequence)}</dd>
        </div>
      </dl>

      <h2>{t('review.case.requirements')}</h2>
      <ol className="requirement-list">
        {data.requirements.map((requirement) => (
          <li key={requirement.code} className="requirement-card">
            <h3>{locale === 'fr' ? requirement.titleFr : requirement.titleEn}</h3>
            <p>{locale === 'fr' ? requirement.guidanceFr : requirement.guidanceEn}</p>
            <h4>{t('review.case.response')}</h4>
            <dl className="context-summary">
              {Object.entries(requirement.response).map(([key, value]) => (
                <div key={key}>
                  <dt>{fieldLabels[key] ?? key}</dt>
                  <dd>{displayValue(value, t('review.case.yes'), t('review.case.no'))}</dd>
                </div>
              ))}
            </dl>
            <h4>{t('review.case.evidence')}</h4>
            {requirement.evidence.length === 0 ? (
              <p>{t('review.case.noEvidence')}</p>
            ) : (
              <ul>
                {requirement.evidence.map((item) => (
                  <li key={item.evidenceObjectId}>
                    {item.displayName ?? item.contentType}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <form onSubmit={submit} aria-labelledby="correction-heading">
        <h2 id="correction-heading">{t('review.case.correctionHeading')}</h2>
        <label htmlFor="correction-requirement">{t('review.case.correctionRequirement')}</label>
        <select
          id="correction-requirement"
          value={selectedCode}
          onChange={(event) => setRequirementCode(event.target.value)}
          disabled={correction.isPending || correction.isSuccess}
        >
          {data.requirements.map((requirement) => (
            <option key={requirement.code} value={requirement.code}>
              {locale === 'fr' ? requirement.titleFr : requirement.titleEn}
            </option>
          ))}
        </select>
        <label htmlFor="correction-reason">{t('review.case.correctionReason')}</label>
        <textarea
          id="correction-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-describedby="correction-reason-hint"
          disabled={correction.isPending || correction.isSuccess}
          required
        />
        <p id="correction-reason-hint">{t('review.case.correctionReasonHint')}</p>
        {correction.error ? <p role="alert">{t('review.case.correctionError')}</p> : null}
        {correction.isSuccess ? (
          <p role="status">{t('review.case.correctionSent')}</p>
        ) : (
          <button type="submit" disabled={correction.isPending || reason.trim() === ''}>
            {correction.isPending
              ? t('review.case.correctionSending')
              : t('review.case.correctionSubmit')}
          </button>
        )}
      </form>
    </section>
  );
}
