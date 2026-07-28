import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  useAffiliationReviewCase,
  useAffiliationDecisionState,
  useExecuteAffiliationDecision,
  useOpenAffiliationCorrection,
  useProposeAffiliationDecision,
  useRecordAffiliationTierDecision,
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
  const decisionState = useAffiliationDecisionState(applicationId);
  const proposeDecision = useProposeAffiliationDecision(applicationId ?? '');
  const recordTierDecision = useRecordAffiliationTierDecision(applicationId ?? '');
  const executeDecision = useExecuteAffiliationDecision(applicationId ?? '');
  const [requirementCode, setRequirementCode] = useState('');
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<'approve' | 'reject'>('approve');
  const [decisionReason, setDecisionReason] = useState('');
  const [executedState, setExecutedState] = useState<string>();

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

      <section aria-labelledby="decision-heading">
        <h2 id="decision-heading">{t('review.decision.heading')}</h2>
        <p>{t('review.decision.intro')}</p>
        {proposeDecision.error || recordTierDecision.error || executeDecision.error ? (
          <p role="alert">{t('review.decision.error')}</p>
        ) : null}
        {executedState !== undefined ? (
          <p role="status">
            {t('review.decision.executed', { state: executedState })}
          </p>
        ) : decisionState.data?.executed ? (
          <p role="status">
            {t('review.decision.executed', {
              state: decisionState.data.outcome === 'approve' ? 'approved' : 'rejected',
            })}
          </p>
        ) : decisionState.isLoading ? (
          <p role="status">{t('state.loading')}</p>
        ) : decisionState.error ? (
          <p role="alert">{t('review.decision.error')}</p>
        ) : decisionState.data === null || decisionState.data === undefined ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (decisionReason.trim() === '') return;
              proposeDecision.mutate({ outcome, reason: decisionReason.trim() });
            }}
          >
            <label htmlFor="decision-outcome">{t('review.decision.outcome')}</label>
            <select
              id="decision-outcome"
              value={outcome}
              onChange={(event) => setOutcome(event.target.value as 'approve' | 'reject')}
            >
              <option value="approve">{t('review.decision.approve')}</option>
              <option value="reject">{t('review.decision.reject')}</option>
            </select>
            <label htmlFor="decision-reason">{t('review.decision.reason')}</label>
            <textarea
              id="decision-reason"
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              required
            />
            <button
              type="submit"
              disabled={proposeDecision.isPending || decisionReason.trim() === ''}
            >
              {proposeDecision.isPending
                ? t('review.decision.proposing')
                : t('review.decision.propose')}
            </button>
          </form>
        ) : decisionState.data.status === 'pending' ? (
          <div>
            <p role="status">{t('review.decision.pending')}</p>
            <p>
              {t('review.decision.currentStep', {
                step: decisionState.data.currentStepCode ?? '',
              })}
            </p>
            <button
              type="button"
              disabled={recordTierDecision.isPending}
              onClick={() =>
                recordTierDecision.mutate({
                  state: decisionState.data!,
                  decision: 'approve',
                  reason: decisionReason,
                })
              }
            >
              {recordTierDecision.isPending
                ? t('review.decision.recording')
                : t('review.decision.support')}
            </button>
            <button
              type="button"
              disabled={recordTierDecision.isPending}
              onClick={() =>
                recordTierDecision.mutate({
                  state: decisionState.data!,
                  decision: 'reject',
                  reason: decisionReason,
                })
              }
            >
              {t('review.decision.oppose')}
            </button>
          </div>
        ) : decisionState.data.status === 'approved' ? (
          <div>
            <p role="status">{t('review.decision.approved')}</p>
            <button
              type="button"
              disabled={!decisionState.data.executable || executeDecision.isPending}
              onClick={() =>
                executeDecision.mutate(decisionState.data!, {
                  onSuccess: (result) => setExecutedState(result.lifecycleState),
                })
              }
            >
              {executeDecision.isPending
                ? t('review.decision.executing')
                : t('review.decision.execute')}
            </button>
          </div>
        ) : (
          <p role="status">{t('review.decision.rejected')}</p>
        )}
      </section>
    </section>
  );
}
