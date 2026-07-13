import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { PageSkeleton } from "./shared/components/PageSkeleton";


const AlertsPage = lazy(() => import("./pages/AlertsPage").then((module) => ({ default: module.AlertsPage })));
const BusinessPage = lazy(() => import("./pages/BusinessPage").then((module) => ({ default: module.BusinessPage })));
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
const MobileLayout = lazy(() => import("./mobile/MobileLayout").then((module) => ({ default: module.MobileLayout })));


export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Suspense fallback={<PageSkeleton />}><HomePage /></Suspense>} />
        <Route path="planner" element={<Suspense fallback={<PageSkeleton cards={2} />}><PlannerPage /></Suspense>} />
        <Route path="crowdsource" element={<Suspense fallback={<PageSkeleton cards={2} />}><CrowdsourcePage /></Suspense>} />
        <Route path="alerts" element={<Suspense fallback={<PageSkeleton cards={2} />}><AlertsPage /></Suspense>} />
        <Route path="business" element={<Suspense fallback={<PageSkeleton cards={3} />}><BusinessPage /></Suspense>} />
        <Route path="model" element={<Suspense fallback={<PageSkeleton cards={3} />}><ModelPage /></Suspense>} />
        <Route path="scenarios" element={<Suspense fallback={<PageSkeleton cards={3} />}><ScenarioPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="mobile" element={<Suspense fallback={<PageSkeleton cards={3} />}><MobileLayout /></Suspense>}>
        <Route index element={<Suspense fallback={<PageSkeleton cards={3} />}><MobileHomePage /></Suspense>} />
        <Route path="planner" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobilePlannerPage /></Suspense>} />
        <Route path="scenarios" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobileScenarioPage /></Suspense>} />
        <Route path="feedback" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobileFeedbackPage /></Suspense>} />
        <Route path="me" element={<Suspense fallback={<PageSkeleton cards={2} />}><MobileMePage /></Suspense>} />
        <Route path="*" element={<Navigate to="/mobile" replace />} />
      </Route>
    </Routes>
  );
}


function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}

export default App;
