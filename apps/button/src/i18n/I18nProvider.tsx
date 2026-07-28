import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  RESOURCES,
  interpolate,
  isSupportedLocale,
  type ButtonLocale,
  type TranslationKey,
} from './resources';

const LOCALE_STORAGE_KEY = 'button.locale';

export interface I18nContextValue {
  readonly locale: ButtonLocale;
  readonly setLocale: (locale: ButtonLocale) => void;
  readonly t: (key: TranslationKey, params?: Readonly<Record<string, string>>) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function readInitialLocale(initial: ButtonLocale | undefined): ButtonLocale {
  if (initial !== undefined) return initial;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) return stored;
    const navigatorLocale = window.navigator.language?.slice(0, 2);
    if (isSupportedLocale(navigatorLocale)) return navigatorLocale;
  } catch {
    // Storage/navigator may be unavailable — fall back to English.
  }
  return 'en';
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  readonly children: ReactNode;
  readonly initialLocale?: ButtonLocale;
}): JSX.Element {
  const [locale, setLocaleState] = useState<ButtonLocale>(() => readInitialLocale(initialLocale));

  const setLocale = useCallback((next: ButtonLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
      document.documentElement.setAttribute('lang', next);
    } catch {
      // Non-fatal: persistence is best-effort.
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Readonly<Record<string, string>>) =>
      interpolate(RESOURCES[locale][key], params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx === undefined) {
    throw new Error('useI18n must be used within an I18nProvider.');
  }
  return ctx;
}
