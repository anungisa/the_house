import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useI18n } from '../i18n/I18nProvider';
import { SkipLink } from './SkipLink';
import { Header } from './Header';
import type { ButtonTelemetry } from '../observability/telemetry';

/**
 * Application shell: skip link, banner header, a focusable `<main>` landmark, and a polite
 * route-announcer live region. On every route change focus is moved to the main region and the
 * new location is announced, so keyboard and screen-reader users are oriented after navigation.
 */
export function AppShell({ telemetry }: { readonly telemetry: ButtonTelemetry }): JSX.Element {
  const { t } = useI18n();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Move focus to the main landmark and announce the route change after navigation.
    mainRef.current?.focus();
    if (announcerRef.current) {
      announcerRef.current.textContent = document.title;
    }
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <SkipLink />
      <Header telemetry={telemetry} />
      <main id="main-content" ref={mainRef} tabIndex={-1} aria-label={t('nav.affiliation')}>
        <Outlet />
      </main>
      <div
        ref={announcerRef}
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />
      <footer className="app-footer" role="contentinfo">
        <a href="mailto:support@example.org">{t('app.support')}</a>
      </footer>
    </div>
  );
}
