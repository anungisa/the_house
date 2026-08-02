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
import { RequireAffiliationReview } from './guards';
import { RequireAffiliationFinance } from './guards';
import { RequireAffiliationStanding } from './guards';
import { AffiliationReviewQueuePage } from '../routes/review/AffiliationReviewQueuePage';
import { AffiliationReviewCasePage } from '../routes/review/AffiliationReviewCasePage';
import { FinancialObligationQueuePage } from '../routes/finance/FinancialObligationQueuePage';
import { StandingListPage } from '../routes/standing/StandingListPage';
import { StandingDetailPage } from '../routes/standing/StandingDetailPage';
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
        <Route
          path="review"
          element={
            <RequireAffiliationReview telemetry={telemetry}>
              <Outlet />
            </RequireAffiliationReview>
          }
        >
          <Route index element={<AffiliationReviewQueuePage />} />
          <Route path=":applicationId" element={<AffiliationReviewCasePage />} />
        </Route>
        <Route
          path="finance"
          element={
            <RequireAffiliationFinance telemetry={telemetry}>
              <Outlet />
            </RequireAffiliationFinance>
          }
        >
          <Route index element={<FinancialObligationQueuePage />} />
        </Route>
        <Route
          path="standing"
          element={
            <RequireAffiliationStanding telemetry={telemetry}>
              <Outlet />
            </RequireAffiliationStanding>
          }
        >
          <Route index element={<StandingListPage />} />
          <Route path=":standingId" element={<StandingDetailPage />} />
        </Route>
        <Route path="access-denied" element={<AccessDeniedPage />} />
        <Route path="authority-expired" element={<AuthorityExpiredPage />} />
        <Route path="service-unavailable" element={<ServiceUnavailablePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/button" replace />} />
    </Routes>
  );
}
