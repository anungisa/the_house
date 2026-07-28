import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useI18n } from '../i18n/I18nProvider';
import { usePageTitle } from '../hooks/usePageTitle';
import { useButtonContext } from '../context/ButtonContextProvider';
import { StatusPanel } from '../components/StatusPanel';

/**
 * Context selection: the representative chooses the organization + season they are acting for.
 * The submitted selection is re-authorized server-side by `GET /v1/button/context`; this page
 * never asserts authority, and only shows organizations the server has already made accessible.
 */
export function SelectContextPage(): JSX.Element {
  const { t } = useI18n();
  usePageTitle('nav.selectContext');
  const navigate = useNavigate();
  const { view, isLoading, selectContext } = useButtonContext();

  const seasons = useMemo(() => view?.availableSeasons ?? [], [view]);
  const organizations = useMemo(() => view?.accessibleOrganizations ?? [], [view]);
  const defaultSeason = seasons.find((s) => s.current)?.id ?? seasons[0]?.id ?? '';

  const [organizationId, setOrganizationId] = useState('');
  const [season, setSeason] = useState('');

  // Server-accessible options arrive asynchronously; seed the controls from them once available
  // without overriding a choice the representative has already made.
  useEffect(() => {
    if (organizationId === '' && organizations[0]) {
      setOrganizationId(organizations[0].organizationId);
    }
  }, [organizationId, organizations]);
  useEffect(() => {
    if (season === '' && defaultSeason !== '') {
      setSeason(defaultSeason);
    }
  }, [season, defaultSeason]);


  if (isLoading) {
    return (
      <StatusPanel
        kind="loading"
        heading={t('state.loading')}
        body={t('app.loading')}
        statusLabel={t('state.loading')}
      />
    );
  }

  if (organizations.length === 0) {
    return (
      <StatusPanel
        kind="empty"
        heading={t('state.empty.heading')}
        body={t('state.empty.body')}
        statusLabel={t('state.empty.heading')}
      >
        {view?.supportReference ? (
          <p className="support-reference">
            {t('state.supportReference', { reference: view.supportReference })}
          </p>
        ) : null}
      </StatusPanel>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    selectContext(organizationId, season);
    navigate('/button/affiliation');
  };

  return (
    <section aria-labelledby="select-context-heading">
      <h1 id="select-context-heading">{t('nav.selectContext')}</h1>
      <p>{t('context.choosePrompt')}</p>
      <form onSubmit={onSubmit} className="context-form">
        <div className="field">
          <label htmlFor="organization-select">{t('context.chooseOrganization')}</label>
          <select
            id="organization-select"
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
          >
            {organizations.map((org) => (
              <option key={org.organizationId} value={org.organizationId}>
                {org.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="season-select">{t('context.chooseSeason')}</label>
          <select id="season-select" value={season} onChange={(e) => setSeason(e.target.value)}>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">{t('context.continue')}</button>
      </form>
    </section>
  );
}
