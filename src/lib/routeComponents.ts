import { lazy, type ComponentType } from "react";

type PageModule = { default: ComponentType };
type PageLoader = () => Promise<PageModule>;

const loadAssessmentInput: PageLoader = () => import("@/pages/AssessmentInput");
const loadProfileReview: PageLoader = () => import("@/pages/ProfileReview");
const loadAnalysisResult: PageLoader = () => import("@/pages/AnalysisResult");
const loadEvidenceBoard: PageLoader = () => import("@/pages/EvidenceBoard");
const loadMaterialsBoard: PageLoader = () => import("@/pages/MaterialsBoard");
const loadReportOutput: PageLoader = () => import("@/pages/ReportOutput");
const loadNotFound: PageLoader = () => import("@/pages/NotFound");
const loadFormCenter: PageLoader = () => import("@/pages/FormCenter");
const loadFormEditor: PageLoader = () => import("@/pages/FormEditor");
const loadSettings: PageLoader = () => import("@/pages/Settings");
const loadAccidentPrediction: PageLoader = () => import("@/pages/AccidentPrediction");
const loadScanUnderstand: PageLoader = () => import("@/pages/ScanUnderstand");
const loadSafetyQa: PageLoader = () => import("@/pages/SafetyQa");
const loadLogin: PageLoader = () => import("@/pages/Login");

export const AssessmentInputPage = lazy(loadAssessmentInput);
export const ProfileReviewPage = lazy(loadProfileReview);
export const AnalysisResultPage = lazy(loadAnalysisResult);
export const EvidenceBoardPage = lazy(loadEvidenceBoard);
export const MaterialsBoardPage = lazy(loadMaterialsBoard);
export const ReportOutputPage = lazy(loadReportOutput);
export const NotFoundPage = lazy(loadNotFound);
export const FormCenterPage = lazy(loadFormCenter);
export const FormEditorPage = lazy(loadFormEditor);
export const SettingsPage = lazy(loadSettings);
export const AccidentPredictionPage = lazy(loadAccidentPrediction);
export const ScanUnderstandPage = lazy(loadScanUnderstand);
export const SafetyQaPage = lazy(loadSafetyQa);
export const LoginPage = lazy(loadLogin);

const ROUTE_PRELOAD_RULES: Array<{ match: RegExp; preload: PageLoader }> = [
  { match: /^\/$/, preload: loadAssessmentInput },
  { match: /^\/assessments\/new$/, preload: loadAssessmentInput },
  { match: /^\/assessments\/[^/]+\/profile-review$/, preload: loadProfileReview },
  { match: /^\/assessments\/[^/]+\/analysis$/, preload: loadAnalysisResult },
  { match: /^\/assessments\/[^/]+\/evidence$/, preload: loadEvidenceBoard },
  { match: /^\/assessments\/[^/]+\/materials$/, preload: loadMaterialsBoard },
  { match: /^\/assessments\/[^/]+\/report$/, preload: loadReportOutput },
  { match: /^\/forms$/, preload: loadFormCenter },
  { match: /^\/forms\/[^/]+$/, preload: loadFormEditor },
  { match: /^\/prediction$/, preload: loadAccidentPrediction },
  { match: /^\/scan$/, preload: loadScanUnderstand },
  { match: /^\/safety-qa$/, preload: loadSafetyQa },
  { match: /^\/settings$/, preload: loadSettings },
  { match: /^\/login$/, preload: loadLogin },
];

export function preloadRouteComponent(pathname: string) {
  const normalizedPath = pathname.split("?")[0];
  const matched = ROUTE_PRELOAD_RULES.find((rule) => rule.match.test(normalizedPath));
  if (!matched) {
    return;
  }
  void matched.preload();
}
