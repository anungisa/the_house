import { useI18n } from '../i18n/I18nProvider';

/**
 * Keyboard skip link. Visually hidden until focused, then moves focus to the main landmark so
 * keyboard-only users can bypass the header/navigation.
 */
export function SkipLink(): JSX.Element {
  const { t } = useI18n();
  return (
    <a className="skip-link" href="#main-content">
      {t('app.skipToContent')}
    </a>
  );
}
