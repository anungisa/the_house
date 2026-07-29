import { useState } from 'react';

import { useI18n } from '../../i18n/I18nProvider';
import { usePageTitle } from '../../hooks/usePageTitle';
import {
  toAffiliationCategory,
  useFinancialObligations,
  useReconcileFinancialObligation,
} from '../../hooks/useAffiliation';
import type { TranslationKey } from '../../i18n/resources';

function stateKey(state: string): TranslationKey {
  const known = [
    'assessed',
    'acknowledged',
    'confirmed',
    'reconciled',
    'mismatch',
    'waived',
    'exempt',
    'closed',
  ];
  return (known.includes(state) ? `finance.state.${state}` : 'finance.state.unknown') as TranslationKey;
}

export function FinancialObligationQueuePage(): JSX.Element {
  const { t, locale } = useI18n();
  usePageTitle('finance.title');
  const queue = useFinancialObligations();
  const reconcile = useReconcileFinancialObligation();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  if (queue.isLoading) return <p role="status">{t('state.loading')}</p>;
  if (queue.isError) {
    return (
      <p role="alert" className="affiliation-note affiliation-note--error">
        {toAffiliationCategory(queue.error) === 'access-denied'
          ? t('state.denied.body')
          : t('finance.error.load')}
      </p>
    );
  }

  const money = (amount: string, currency: string) =>
    new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
      style: 'currency',
      currency,
    }).format(Number(amount));

  return (
    <section aria-labelledby="finance-heading">
      <h1 id="finance-heading">{t('finance.heading')}</h1>
      <p>{t('finance.intro')}</p>
      {queue.data?.length === 0 ? (
        <p role="status">{t('finance.empty')}</p>
      ) : (
        <ul className="affiliation-list" aria-label={t('finance.queueLabel')}>
          {queue.data?.map((item) => {
            const reason = reasons[item.obligationId] ?? '';
            const canReconcile = item.canReconcile && item.lifecycleState === 'confirmed';
            const financiallyCleared = ['reconciled', 'waived', 'exempt'].includes(
              item.lifecycleState,
            );
            return (
              <li key={item.obligationId} className="affiliation-card">
                <h2>{t('finance.obligationHeading', { id: item.obligationId })}</h2>
                <dl>
                  <dt>{t('finance.application')}</dt>
                  <dd>{item.affiliationApplicationId}</dd>
                  <dt>{t('finance.season')}</dt>
                  <dd>{item.season}</dd>
                  <dt>{t('finance.type')}</dt>
                  <dd>{t(`finance.type.${item.obligationType}` as TranslationKey)}</dd>
                  <dt>{t('finance.assessed')}</dt>
                  <dd>{money(item.assessedAmount, item.currency)}</dd>
                  <dt>{t('finance.confirmed')}</dt>
                  <dd>
                    {item.confirmedAmount && item.confirmedCurrency
                      ? money(item.confirmedAmount, item.confirmedCurrency)
                      : t('finance.notConfirmed')}
                  </dd>
                  <dt>{t('finance.status')}</dt>
                  <dd>{t(stateKey(item.lifecycleState))}</dd>
                  <dt>{t('finance.activationImpact')}</dt>
                  <dd>
                    {item.blocking
                      ? financiallyCleared
                        ? t('finance.cleared')
                        : t('finance.blocking')
                      : t('finance.nonBlocking')}
                  </dd>
                </dl>
                {canReconcile && (
                  <form
                    aria-label={t('finance.reconcileForm', { id: item.obligationId })}
                    onSubmit={(event) => {
                      event.preventDefault();
                      reconcile.mutate({ obligationId: item.obligationId, reason });
                    }}
                  >
                    <label htmlFor={`reconcile-reason-${item.obligationId}`}>
                      {t('finance.reason')}
                    </label>
                    <textarea
                      id={`reconcile-reason-${item.obligationId}`}
                      value={reason}
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [item.obligationId]: event.target.value,
                        }))
                      }
                    />
                    <p>{t('finance.reconcileNotice')}</p>
                    <button type="submit" disabled={reason.trim() === '' || reconcile.isPending}>
                      {reconcile.isPending ? t('finance.reconciling') : t('finance.reconcile')}
                    </button>
                  </form>
                )}
                {reconcile.isError && reconcile.variables?.obligationId === item.obligationId && (
                  <p role="alert" className="affiliation-note affiliation-note--error">
                    {t('finance.error.reconcile')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
