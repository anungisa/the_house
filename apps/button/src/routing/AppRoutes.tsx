import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { AppShell } from '../components/AppShell';
import { EntryPage } from '../routes/EntryPage';
import { SelectContextPage } from '../routes/SelectContextPage';
import { AffiliationOverviewPage } from '../routes/affiliation/AffiliationOverviewPage';
import { AffiliationRequirementsPage } from '../routes/affiliation/AffiliationRequirementsPage';
import { AffiliationRequirementPage } from '../routes/affiliation/AffiliationRequirementPage';
import { AccessDeniedPage } from '../routes/AccessDeniedPage';
import { AuthorityExpiredPage } from '../routes/AuthorityExpiredPage';
import { ServiceUnavailablePage } from '../routes/ServiceUnavailablePage';
import { RequireAffiliation } from './guards';
import type { ButtonTelemetry } from '../observability/telemetry';

/**
 * Application routes. The affiliation subtree is wrapped by a server-backed guard; the denied /
 * expired / service-error routes are always reachable so the guard can redirect to them. The
 * affiliation subtree deep-links by application id + requirement code so a representative can leave
 * and safely resume later.
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
              <Outlet />
            </RequireAffiliation>
          }
        >
          <Route index element={<AffiliationOverviewPage />} />
          <Route path=":applicationId" element={<AffiliationRequirementsPage />} />
          <Route
            path=":applicationId/requirements/:requirementCode"
            element={<AffiliationRequirementPage />}
          />
        </Route>
        <Route path="access-denied" element={<AccessDeniedPage />} />
        <Route path="authority-expired" element={<AuthorityExpiredPage />} />
        <Route path="service-unavailable" element={<ServiceUnavailablePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/button" replace />} />
    </Routes>
  );
}
