import { NavLink } from 'react-router-dom';

import { useI18n } from '../i18n/I18nProvider';
import { ButtonCapability } from '../api/types';
import { useButtonContext } from '../context/ButtonContextProvider';

/**
 * Primary navigation, rendered from controlled bilingual resources. Items are gated by the
 * server-derived capabilities: "Select context" appears when the representative may select a
 * context, and "Affiliation" appears only when they hold the active affiliation-view capability.
 * The navigation never exposes areas the server has not authorized.
 */
export function Nav(): JSX.Element {
  const { t } = useI18n();
  const { view } = useButtonContext();
  const capabilities = view?.capabilities ?? [];
  const canSelect = capabilities.includes(ButtonCapability.SelectContext);
  const canAffiliation = capabilities.includes(ButtonCapability.ViewAffiliation);
  const canReview = capabilities.includes(ButtonCapability.ReviewAffiliation);
  const canReviewFinance = capabilities.includes(ButtonCapability.ReviewAffiliationFinance);

  return (
    <nav aria-label={t('nav.primary')} className="primary-nav">
      <ul>
        <li>
          <NavLink to="/button" end>
            {t('nav.home')}
          </NavLink>
        </li>
        {canSelect && (
          <li>
            <NavLink to="/button/select-context">{t('nav.selectContext')}</NavLink>
          </li>
        )}
        {canAffiliation && (
          <li>
            <NavLink to="/button/affiliation">{t('nav.affiliation')}</NavLink>
          </li>
        )}
        {canReview && (
          <li>
            <NavLink to="/button/review">{t('nav.review')}</NavLink>
          </li>
        )}
        {canReviewFinance && (
          <li>
            <NavLink to="/button/finance">{t('nav.finance')}</NavLink>
          </li>
        )}
      </ul>
    </nav>
  );
}
