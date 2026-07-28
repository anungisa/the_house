import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useI18n } from '../../i18n/I18nProvider';
import { usePageTitle } from '../../hooks/usePageTitle';
import { StatusPanel } from '../../components/StatusPanel';
import {
  useAffiliationApplication,
  useAssociateEvidence,
  useRemoveEvidence,
  useSaveDraft,
  toAffiliationCategory,
} from '../../hooks/useAffiliation';
import type { RequirementView } from '../../api/affiliationTypes';
import { requirementText } from './requirementText';

interface ContactState {
  name: string;
  role: string;
  email: string;
  phone: string;
}

/** Build the opaque structured response value the server persists, from the control state. */
function buildValue(
  requirement: RequirementView,
  fields: {
    acknowledged: boolean;
    confirmed: boolean;
    text: string;
    description: string;
    contact: ContactState;
  },
): Record<string, unknown> {
  switch (requirement.responseType) {
    case 'acknowledgement':
      return fields.acknowledged ? { acknowledged: true } : {};
    case 'confirmation':
      return fields.confirmed ? { confirmed: true } : {};
    case 'short_text':
    case 'long_text':
      return fields.text.trim() !== '' ? { text: fields.text.trim() } : {};
    case 'document_reference':
      return fields.description.trim() !== '' ? { description: fields.description.trim() } : {};
    case 'structured_contact': {
      const value: Record<string, string> = {};
      if (fields.contact.name.trim() !== '') value['name'] = fields.contact.name.trim();
      if (fields.contact.role.trim() !== '') value['role'] = fields.contact.role.trim();
      if (fields.contact.email.trim() !== '') value['email'] = fields.contact.email.trim();
      if (fields.contact.phone.trim() !== '') value['phone'] = fields.contact.phone.trim();
      return value;
    }
    default:
      return {};
  }
}

/**
 * Accessible response form for a single requirement. Every control is labelled and keyboard
 * operable; the form is seeded from the saved draft and re-seeds whenever the concurrency token
 * changes (after a save, or after recovering the latest version on a stale-write conflict). Saving
 * uses optimistic concurrency (If-Match): a 409 reloads the latest version and prompts the
 * representative to re-enter — never duplicating a mutation. Evidence attach/remove associates a
 * governed payload WITHOUT accepting it.
 */
export function AffiliationRequirementPage(): JSX.Element {
  const { t, locale } = useI18n();
  usePageTitle('affiliation.requirement.title');
  const { applicationId, requirementCode } = useParams<{
    applicationId: string;
    requirementCode: string;
  }>();
  const query = useAffiliationApplication(applicationId);
  const application = query.data;
  const requirement = useMemo(
    () => application?.requirements.find((r) => r.code === requirementCode),
    [application, requirementCode],
  );

  const save = useSaveDraft(applicationId ?? '');
  const associate = useAssociateEvidence(applicationId ?? '');
  const remove = useRemoveEvidence(applicationId ?? '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState<ContactState>({ name: '', role: '', email: '', phone: '' });
  const [saved, setSaved] = useState(false);

  const token = application?.concurrencyToken;
  // Re-seed the controls from the saved draft whenever the concurrency token changes: on first
  // load, after a successful save, and after a conflict reload (so the representative always edits
  // the latest server state).
  useEffect(() => {
    if (!requirement) return;
    const r = requirement.response;
    setAcknowledged(r['acknowledged'] === true);
    setConfirmed(r['confirmed'] === true);
    setText(typeof r['text'] === 'string' ? r['text'] : '');
    setDescription(typeof r['description'] === 'string' ? r['description'] : '');
    setContact({
      name: typeof r['name'] === 'string' ? r['name'] : '',
      role: typeof r['role'] === 'string' ? r['role'] : '',
      email: typeof r['email'] === 'string' ? r['email'] : '',
      phone: typeof r['phone'] === 'string' ? r['phone'] : '',
    });
    // Do not reset the "saved" confirmation here: a successful save bumps the concurrency token,
    // which re-runs this re-seed. Clearing `saved` would make the confirmation flash and vanish.
    // The confirmation is instead reset when the representative next edits a control.
    // Depend on the token so a re-seed happens exactly when the server state changes.
  }, [token, requirement]);

  const saveConflict = toAffiliationCategory(save.error) === 'version-conflict';
  // On a stale-write conflict, reload the latest version so the form re-seeds and the token updates.
  useEffect(() => {
    if (saveConflict) void query.refetch();
  }, [saveConflict, query]);

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
  if (category === 'not-found' || category === 'access-denied' || (application !== undefined && requirement === undefined)) {
    return (
      <StatusPanel
        kind="denied"
        heading={t('affiliation.error.notFound.heading')}
        body={t('affiliation.error.notFound.body')}
        statusLabel={t('affiliation.error.notFound.heading')}
      />
    );
  }
  if (application === undefined || requirement === undefined) {
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

  const { title, guidance } = requirementText(requirement, locale);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = buildValue(requirement, { acknowledged, confirmed, text, description, contact });
    save.mutate(
      { expectedVersion: application.concurrencyToken, responses: [{ requirementCode: requirement.code, value }] },
      { onSuccess: () => setSaved(true) },
    );
  };

  const onAttach = (event: FormEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    associate.mutate(
      { requirementCode: requirement.code, file },
      {
        onSettled: () => {
          if (fileInputRef.current) fileInputRef.current.value = '';
        },
      },
    );
  };

  return (
    <section aria-labelledby="requirement-heading">
      <p>
        <Link to={`/button/affiliation/${application.applicationId}`}>
          {t('affiliation.requirement.back')}
        </Link>
      </p>
      <h1 id="requirement-heading">{title}</h1>
      <p className="requirement-meta">
        {t('affiliation.requirement.version', { version: String(requirement.version) })}
      </p>

      <section aria-labelledby="requirement-guidance-heading" className="requirement-guidance">
        <h2 id="requirement-guidance-heading">{t('affiliation.requirement.guidance')}</h2>
        <p>{guidance}</p>
        <p className="requirement-applies">
          <strong>{t('affiliation.requirement.appliesBecause')}: </strong>
          {requirement.appliesBecause}
        </p>
      </section>

      {requirement.status === 'blocked' && requirement.blockedBy.length > 0 ? (
        <p className="affiliation-note affiliation-note--blocked" role="status">
          {t('affiliation.requirement.blockedNote', { codes: requirement.blockedBy.join(', ') })}
        </p>
      ) : null}

      {saveConflict ? (
        <p className="affiliation-note affiliation-note--conflict" role="alert">
          {t('affiliation.requirement.conflict')}
        </p>
      ) : null}
      {toAffiliationCategory(save.error) !== undefined && !saveConflict ? (
        <p className="affiliation-note affiliation-note--error" role="alert">
          {t('affiliation.requirement.saveError')}
        </p>
      ) : null}
      {saved && !save.isPending ? (
        <p className="affiliation-note affiliation-note--saved" role="status">
          {t('affiliation.requirement.saved')}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="requirement-form">
        {requirement.responseType === 'acknowledgement' ? (
          <div className="field field--check">
            <label>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              {t('affiliation.control.acknowledge')}
            </label>
          </div>
        ) : null}

        {requirement.responseType === 'confirmation' ? (
          <div className="field field--check">
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {t('affiliation.control.confirm')}
            </label>
          </div>
        ) : null}

        {requirement.responseType === 'short_text' ? (
          <div className="field">
            <label htmlFor="response-text">{t('affiliation.control.text')}</label>
            <input id="response-text" type="text" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
        ) : null}

        {requirement.responseType === 'long_text' ? (
          <div className="field">
            <label htmlFor="response-text">{t('affiliation.control.text')}</label>
            <textarea
              id="response-text"
              value={text}
              rows={5}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        ) : null}

        {requirement.responseType === 'document_reference' ? (
          <div className="field">
            <label htmlFor="response-description">{t('affiliation.control.document')}</label>
            <input
              id="response-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        ) : null}

        {requirement.responseType === 'structured_contact' ? (
          <fieldset className="field field--contact">
            <legend>{title}</legend>
            <div className="field">
              <label htmlFor="contact-name">{t('affiliation.control.contact.name')}</label>
              <input
                id="contact-name"
                type="text"
                value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="contact-role">{t('affiliation.control.contact.role')}</label>
              <input
                id="contact-role"
                type="text"
                value={contact.role}
                onChange={(e) => setContact((c) => ({ ...c, role: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="contact-email">{t('affiliation.control.contact.email')}</label>
              <input
                id="contact-email"
                type="email"
                value={contact.email}
                onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="contact-phone">{t('affiliation.control.contact.phone')}</label>
              <input
                id="contact-phone"
                type="tel"
                value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
              />
            </div>
          </fieldset>
        ) : null}

        <button type="submit" disabled={save.isPending}>
          {save.isPending ? t('affiliation.requirement.saving') : t('affiliation.requirement.save')}
        </button>
      </form>

      {requirement.evidenceRequired ? (
        <section aria-labelledby="requirement-evidence-heading" className="requirement-evidence">
          <h2 id="requirement-evidence-heading">{t('affiliation.requirement.evidence')}</h2>
          <p>{t('affiliation.requirement.evidenceRequiredNote')}</p>
          <p className="requirement-evidence__note">{t('affiliation.requirement.evidenceNote')}</p>

          {requirement.evidence.length === 0 ? (
            <p>{t('affiliation.requirement.noEvidence')}</p>
          ) : (
            <ul className="evidence-list">
              {requirement.evidence.map((link) => (
                <li key={link.linkId} className="evidence-row">
                  <span className="evidence-row__name">
                    {link.displayName ?? link.evidenceObjectId}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove.mutate({ linkId: link.linkId })}
                    disabled={remove.isPending}
                  >
                    {t('affiliation.requirement.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="field">
            <label htmlFor="evidence-file">{t('affiliation.requirement.attach')}</label>
            <input
              id="evidence-file"
              ref={fileInputRef}
              type="file"
              onChange={onAttach}
              disabled={associate.isPending}
            />
          </div>
          {toAffiliationCategory(associate.error) !== undefined ? (
            <p className="affiliation-note affiliation-note--error" role="alert">
              {t('affiliation.requirement.evidenceError')}
            </p>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
