import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAccess } from "./features/auth/RequireAccess";
import { getDemoSession } from "./features/auth/session";
import { AppLayout } from "./layout/AppLayout";
import { PageSkeleton } from "./shared/components/PageSkeleton";


const AlertsPage = lazy(() => import("./pages/AlertsPage").then((module) => ({ default: module.AlertsPage })));
const BusinessPage = lazy(() => import("./pages/BusinessPage").then((module) => ({ default: module.BusinessPage })));
const LegacyEmployeeBatchPage = lazy(() => import("./pages/LegacyEmployeeBatchPage").then((module) => ({ default: module.LegacyEmployeeBatchPage })));
const CrowdsourcePage = lazy(() => import("./pages/CrowdsourcePage").then((module) => ({ default: module.CrowdsourcePage })));
const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({ default: module.HomePage })));
const PlannerPage = lazy(() => import("./pages/PlannerPage").then((module) => ({ default: module.PlannerPage })));
const ModelPage = lazy(() => import("./pages/ModelPage").then((module) => ({ default: module.ModelPage })));
const MobileHomePage = lazy(() => import("./pages/MobileHomePage").then((module) => ({ default: module.MobileHomePage })));
const MobilePlannerPage = lazy(() => import("./mobile/MobilePlannerPage").then((module) => ({ default: module.MobilePlannerPage })));
const MobileScenarioPage = lazy(() => import("./mobile/MobileScenarioPage").then((module) => ({ default: module.MobileScenarioPage })));
const MobileFeedbackPage = lazy(() => import("./mobile/MobileFeedbackPage").then((module) => ({ default: module.MobileFeedbackPage })));
const MobileMePage = lazy(() => import("./mobile/MobileMePage").then((module) => ({ default: module.MobileMePage })));
const ScenarioPage = lazy(() => import("./pages/ScenarioPage").then((module) => ({ default: module.ScenarioPage })));
const OperationsPage = lazy(() => import("./pages/OperationsPage").then((module) => ({ default: module.OperationsPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const PricingPage = lazy(() => import("./pages/PricingPage").then((module) => ({ default: module.PricingPage })));
const MobileLayout = lazy(() => import("./mobile/MobileLayout").then((module) => ({ default: module.MobileLayout })));
const MobileLoginPage = lazy(() => import("./mobile/MobileLoginPage").then((module) => ({ default: module.MobileLoginPage })));


function BusinessEntryPage() {
  return getDemoSession()?.role === "business_admin"
    ? <Navigate to="/business/employees" replace />
    : <BusinessPage />;
}


export function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<Suspense fallback={<PageSkeleton cards={2} />}><LoginPage /></Suspense>} />
      <Route element={<AppLayout />}>
        <Route index element={<Suspense fallback={<PageSkeleton />}><HomePage /></Suspense>} />
        <Route path="pricing" element={<Suspense fallback={<PageSkeleton cards={3} />}><PricingPage /></Suspense>} />
        <Route element={<RequireAccess allowedRoles={["operator", "commuter", "business_admin", "transport_dispatcher", "port_official"]} />}>
          <Route path="planner" element={<Suspense fallback={<PageSkeleton cards={2} />}><PlannerPage /></Suspense>} />
          <Route path="model" element={<Suspense fallback={<PageSkeleton cards={3} />}><ModelPage /></Suspense>} />
        </Route>
        <Route element={<RequireAccess allowedRoles={["operator", "commuter"]} />}>
          <Route path="crowdsource" element={<Suspense fallback={<PageSkeleton cards={2} />}><CrowdsourcePage /></Suspense>} />
          <Route path="alerts" element={<Suspense fallback={<PageSkeleton cards={2} />}><AlertsPage /></Suspense>} />
        </Route>
        <Route element={<RequireAccess allowedRoles={["operator", "business_admin", "transport_dispatcher", "port_official"]} />}>
          <Route path="business" element={<Suspense fallback={<PageSkeleton cards={3} />}><BusinessEntryPage /></Suspense>} />
        </Route>
        <Route element={<RequireAccess allowedRoles={["operator", "business_admin"]} />}>
          <Route path="business/employees" element={<Suspense fallback={<PageSkeleton cards={3} />}><LegacyEmployeeBatchPage /></Suspense>} />
        </Route>
        <Route element={<RequireAccess allowedRoles={["operator"]} />}>
          <Route path="scenarios" element={<Suspense fallback={<PageSkeleton cards={3} />}><ScenarioPage /></Suspense>} />
          <Route path="operations" element={<Suspense fallback={<PageSkeleton cards={4} />}><OperationsPage /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="mobile/login" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobileLoginPage /></Suspense>} />
      <Route element={<RequireAccess allowedRoles={["commuter"]} mobile />}>
        <Route path="mobile" element={<Suspense fallback={<PageSkeleton cards={3} />}><MobileLayout /></Suspense>}>
          <Route index element={<Suspense fallback={<PageSkeleton cards={3} />}><MobileHomePage /></Suspense>} />
          <Route path="planner" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobilePlannerPage /></Suspense>} />
          <Route path="scenarios" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobileScenarioPage /></Suspense>} />
          <Route path="feedback" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobileFeedbackPage /></Suspense>} />
          <Route path="me" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobileMePage /></Suspense>} />
          <Route path="*" element={<Navigate to="/mobile" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}


function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}

export default App;
