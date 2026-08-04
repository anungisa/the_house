import { useI18n } from '../i18n/I18nProvider';
import { useButtonContext } from '../context/ButtonContextProvider';
import { LanguageSwitch } from './LanguageSwitch';
import { Nav } from './Nav';
import type { ButtonTelemetry } from '../observability/telemetry';

/**
 * Application header: product identity, current organization/jurisdiction/season context, the
 * representative identity, the primary navigation, the bilingual language switch, and a sign-out
 * entry point. It is a semantic `<header>` banner landmark — no startup dashboards or decorative
 * analytics.
 */
export function Header({ telemetry }: { readonly telemetry: ButtonTelemetry }): JSX.Element {
  const { t } = useI18n();
  const { view } = useButtonContext();
  const current = view?.currentContext ?? null;

  return (
    <header className="app-header" role="banner">
      <div className="app-header__identity">
        <p className="app-header__title">{t('app.title')}</p>
        <p className="app-header__subtitle">{t('app.subtitle')}</p>
      </div>

      <div className="app-header__context" aria-label={t('context.current')}>
        {current ? (
          <dl>
            <div>
              <dt>{t('context.organization')}</dt>
              <dd>{current.organizationDisplayName}</dd>
            </div>
            <div>
              <dt>{t('context.jurisdiction')}</dt>
              <dd>{current.jurisdiction ? current.jurisdiction.label : t('context.none')}</dd>
            </div>
            <div>
              <dt>{t('context.season')}</dt>
              <dd>{current.season.label}</dd>
            </div>
          </dl>
        ) : (
          <p className="app-header__no-context">{t('context.none')}</p>
        )}
      </div>

      <div className="app-header__actions">
        <p className="app-header__representative">
          {t('app.representative')}
        </p>
        <LanguageSwitch telemetry={telemetry} />
        <button type="button" className="app-header__signout">
          {t('app.signOut')}
        </button>
      </div>

      <Nav />
    </header>
  );
}
