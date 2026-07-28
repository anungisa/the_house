import { useI18n } from '../i18n/I18nProvider';
import type { ButtonLocale } from '../api/types';
import type { ButtonTelemetry } from '../observability/telemetry';

/**
 * Bilingual language switch. Toggling the locale preserves the current route + selected context
 * (both live in the router/context state, not in the locale), so switching never navigates away.
 */
export function LanguageSwitch({ telemetry }: { readonly telemetry: ButtonTelemetry }): JSX.Element {
  const { locale, setLocale, t } = useI18n();

  const choose = (next: ButtonLocale): void => {
    try {
      setLocale(next);
      telemetry.record('locale.switch', { locale: next });
    } catch {
      telemetry.record('locale.switch.failure', { locale });
    }
  };

  return (
    <div className="language-switch" role="group" aria-label={t('lang.switch')}>
      <button
        type="button"
        onClick={() => choose('en')}
        aria-pressed={locale === 'en'}
        lang="en"
      >
        {t('lang.en')}
      </button>
      <button
        type="button"
        onClick={() => choose('fr')}
        aria-pressed={locale === 'fr'}
        lang="fr"
      >
        {t('lang.fr')}
      </button>
    </div>
  );
}
