import { useEffect, type ReactElement } from 'react';
import { Navigate } from 'react-router-dom';

import { useI18n } from '../i18n/I18nProvider';
import { usePageTitle } from '../hooks/usePageTitle';
import { useButtonContext } from '../context/ButtonContextProvider';
import { ButtonCapability } from '../api/types';
import { StatusPanel } from '../components/StatusPanel';
import type {
  ButtonTelemetry,
  ButtonTelemetryEvent,
} from '../observability/telemetry';

/** Fire a safe telemetry event once, then redirect. Keeps render pure (effect-driven emit). */
function RedirectWithTelemetry({
  to,
  event,
  telemetry,
  errorCategory,
}: {
  readonly to: string;
  readonly event: ButtonTelemetryEvent;
  readonly telemetry: ButtonTelemetry;
  readonly errorCategory?: string;
}): ReactElement {
  const { locale } = useI18n();
  useEffect(() => {
    telemetry.record(event, { locale, ...(errorCategory ? { errorCategory } : {}) });
  }, [event, telemetry, locale, errorCategory]);
  return <Navigate to={to} replace />;
}

function LoadingPanel(): ReactElement {
  const { t } = useI18n();
  return (
    <StatusPanel
      kind="loading"
      heading={t('state.loading')}
      body={t('app.loading')}
      statusLabel={t('state.loading')}
    />
  );
}

function UnauthenticatedPanel(): ReactElement {
  const { t } = useI18n();
  usePageTitle('error.unauthenticated.heading');
  return (
    <StatusPanel
      kind="denied"
      heading={t('error.unauthenticated.heading')}
      body={t('error.unauthenticated.body')}
      statusLabel={t('error.unauthenticated.heading')}
    />
  );
}

/**
 * Server-backed guard for the affiliation route. It NEVER trusts the browser: every decision is
 * derived from the server-resolved context (`GET /v1/button/context`). Direct navigation to the
 * protected URL still forces this evaluation because the context is fetched from the server.
 *
 * Decision order (fail closed):
 *  - still loading → loading panel;
 *  - unauthenticated → sign-in panel;
 *  - service error → service-unavailable route;
 *  - access denied (unauthorized/cross-tenant selection) → access-denied route;
 *  - no selected context yet → select-context route;
 *  - authority expired/revoked → authority-expired route (covers mid-session revocation);
 *  - missing the affiliation capability → access-denied route;
 *  - otherwise → render the protected content.
 */
export function RequireAffiliation({
  telemetry,
  children,
}: {
  readonly telemetry: ButtonTelemetry;
  readonly children: ReactElement;
}): ReactElement {
  const { view, isLoading, errorCategory } = useButtonContext();

  if (isLoading) return <LoadingPanel />;
  if (errorCategory === 'unauthenticated') return <UnauthenticatedPanel />;
  if (errorCategory === 'service-unavailable') {
    return (
      <RedirectWithTelemetry
        to="/button/service-unavailable"
        event="route.load.failure"
        telemetry={telemetry}
        errorCategory="service-unavailable"
      />
    );
  }
  if (errorCategory === 'access-denied') {
    return (
      <RedirectWithTelemetry
        to="/button/access-denied"
        event="route.denied"
        telemetry={telemetry}
        errorCategory="access-denied"
      />
    );
  }
  if (!view) return <LoadingPanel />;

  const current = view.currentContext;
  if (!current) {
    return <Navigate to="/button/select-context" replace />;
  }
  if (current.authorityStatus === 'expired' || current.authorityStatus === 'revoked') {
    return (
      <RedirectWithTelemetry
        to="/button/authority-expired"
        event="authority.expired"
        telemetry={telemetry}
        errorCategory={current.authorityStatus}
      />
    );
  }
  if (!view.capabilities.includes(ButtonCapability.ViewAffiliation)) {
    return (
      <RedirectWithTelemetry
        to="/button/access-denied"
        event="route.denied"
        telemetry={telemetry}
        errorCategory="access-denied"
      />
    );
  }
  return children;
}

export function RequireAffiliationReview({
  telemetry,
  children,
}: {
  readonly telemetry: ButtonTelemetry;
  readonly children: ReactElement;
}): ReactElement {
  const { view, isLoading, errorCategory } = useButtonContext();
  if (isLoading) return <LoadingPanel />;
  if (errorCategory === 'unauthenticated') return <UnauthenticatedPanel />;
  if (errorCategory !== undefined || view === undefined) {
    return (
      <RedirectWithTelemetry
        to={errorCategory === 'service-unavailable' ? '/button/service-unavailable' : '/button/access-denied'}
        event="route.denied"
        telemetry={telemetry}
        errorCategory={errorCategory ?? 'access-denied'}
      />
    );
  }
  if (!view.capabilities.includes(ButtonCapability.ReviewAffiliation)) {
    return (
      <RedirectWithTelemetry
        to="/button/access-denied"
        event="route.denied"
        telemetry={telemetry}
        errorCategory="access-denied"
      />
    );
  }
  return children;
}
