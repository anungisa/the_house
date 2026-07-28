import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { EntryPage } from '../routes/EntryPage';
import { SelectContextPage } from '../routes/SelectContextPage';
import { AffiliationPage } from '../routes/AffiliationPage';
import { AccessDeniedPage } from '../routes/AccessDeniedPage';
import { AuthorityExpiredPage } from '../routes/AuthorityExpiredPage';
import { ServiceUnavailablePage } from '../routes/ServiceUnavailablePage';
import { RequireAffiliation } from './guards';
import type { ButtonTelemetry } from '../observability/telemetry';

/**
 * Application routes. The affiliation route is wrapped by a server-backed guard; the denied /
 * expired / service-error routes are always reachable so the guard can redirect to them.
 */
export function AppRoutes({ telemetry }: { readonly telemetry: ButtonTelemetry }): JSX.Element {
  return (
    <Routes>
      <Route path="/button" element={<AppShell telemetry={telemetry} />}>
        <Route index element={<EntryPage />} />
        <Route path="select-context" element={<SelectContextPage />} />
        <Route
          path="affiliation"
          element={
            <RequireAffiliation telemetry={telemetry}>
              <AffiliationPage />
            </RequireAffiliation>
          }
        />
        <Route path="access-denied" element={<AccessDeniedPage />} />
        <Route path="authority-expired" element={<AuthorityExpiredPage />} />
        <Route path="service-unavailable" element={<ServiceUnavailablePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/button" replace />} />
    </Routes>
  );
}
