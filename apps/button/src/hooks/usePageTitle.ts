import { useEffect } from 'react';

import { useI18n } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/resources';

/**
 * Set an accessible, localized document title for the current page. The title updates when the
 * locale changes, and the {@link AppShell} announces it after each route transition.
 */
export function usePageTitle(titleKey: TranslationKey): void {
  const { t } = useI18n();
  useEffect(() => {
    document.title = `${t(titleKey)} \u2014 ${t('app.title')}`;
  }, [t, titleKey]);
}
