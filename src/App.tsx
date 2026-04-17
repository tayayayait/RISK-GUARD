import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AssessmentProvider } from "@/contexts/AssessmentContext";
import { StepRouteGuard } from "@/components/layout/StepRouteGuard";
import {
  AccidentPredictionPage,
  AnalysisResultPage,
  AssessmentInputPage,
  EvidenceBoardPage,
  FormCenterPage,
  FormEditorPage,
  MaterialsBoardPage,
  NotFoundPage,
  ProfileReviewPage,
  ReportOutputPage,
  SettingsPage,
} from "@/lib/routeComponents";

const queryClient = new QueryClient();

function AssessmentRouteScope() {
  return (
    <AssessmentProvider>
      <Outlet />
    </AssessmentProvider>
  );
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center rounded-radius-md border border-border bg-surface px-space-4 py-space-8 text-body-sm text-neutral-600">
      Loading page...
    </div>
  );
}

function withRouteBoundary(element: JSX.Element) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AssessmentRouteScope />}>
          <Route
            path="/"
            element={withRouteBoundary(
              <StepRouteGuard targetStep="input">
                <AssessmentInputPage />
              </StepRouteGuard>,
            )}
          />
          <Route
            path="/assessments/new"
            element={withRouteBoundary(
              <StepRouteGuard targetStep="input">
                <AssessmentInputPage />
              </StepRouteGuard>,
            )}
          />
          <Route
            path="/assessments/:id/profile-review"
            element={withRouteBoundary(
              <StepRouteGuard targetStep="profile_review">
                <ProfileReviewPage />
              </StepRouteGuard>,
            )}
          />
          <Route
            path="/assessments/:id/analysis"
            element={withRouteBoundary(
              <StepRouteGuard targetStep="analysis">
                <AnalysisResultPage />
              </StepRouteGuard>,
            )}
          />
          <Route
            path="/assessments/:id/evidence"
            element={withRouteBoundary(
              <StepRouteGuard targetStep="evidence">
                <EvidenceBoardPage />
              </StepRouteGuard>,
            )}
          />
          <Route
            path="/assessments/:id/materials"
            element={withRouteBoundary(
              <StepRouteGuard targetStep="materials">
                <MaterialsBoardPage />
              </StepRouteGuard>,
            )}
          />
          <Route
            path="/assessments/:id/report"
            element={withRouteBoundary(
              <StepRouteGuard targetStep="report">
                <ReportOutputPage />
              </StepRouteGuard>,
            )}
          />
        </Route>

        {/* Forms Routes */}
        <Route path="/forms" element={withRouteBoundary(<FormCenterPage />)} />
        <Route path="/forms/:formType" element={withRouteBoundary(<FormEditorPage />)} />
        <Route path="/prediction" element={withRouteBoundary(<AccidentPredictionPage />)} />
        <Route path="/settings" element={withRouteBoundary(<SettingsPage />)} />

        <Route path="*" element={withRouteBoundary(<NotFoundPage />)} />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppRouter />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
