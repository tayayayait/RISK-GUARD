import { STANDARD_HAZARD_TYPES, normalizeHazardType } from "../../supabase/functions/_shared/hazard-taxonomy.ts";

export type AssessmentStep =
  | "input"
  | "profile_review"
  | "analysis"
  | "evidence"
  | "materials"
  | "report";

export type AssessmentStatus =
  | "draft"
  | "analyzing"
  | "review_required"
  | "analysis_ready"
  | "evidence_loading"
  | "ready_for_report"
  | "exporting"
  | "completed"
  | "error";

export type ApiStatus = "idle" | "loading" | "success" | "empty" | "error" | "partial";
export type RiskLevel = "critical" | "high" | "medium" | "low";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ExportFormat = "pdf" | "docx" | "clipboard";
export type ReportProfile = "submission" | "review";
export type EvidenceType = "case" | "fatality" | "law";
export type MaterialType = "책자" | "OPS" | "교안" | "영상" | "외국어 자료" | string;
export type MaterialPriorityMode = "즉시교육" | "작업전 브리핑" | "참고자료";
export type MaterialIndustryScope = "profile" | "selected" | "all";
export type MaterialHazardScope = "auto_top3" | "selected" | "all";
export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type LawActionStage = "immediate" | "same_day" | "pre_resume" | "improvement";
export type LawFitStatus = "verified" | "review_required" | "unknown";

export interface HazardItem {
  id: string;
  name: string;
  type: string;
  weight: number;
  confidence: ConfidenceLevel;
  reason: string;
}

export interface ImmediateAction {
  id: string;
  action: string;
  priority: number;
}

export interface Improvement {
  id: string;
  action: string;
  category: string;
}

export interface FatalityCase {
  id: string;
  date: string;
  location: string;
  summary: string;
  deaths: number;
  injuries: number;
  accidentType: string;
  similarity: number;
}

export interface DisasterCase {
  id: string;
  title: string;
  industry: string;
  summary: string;
  keywords: string[];
  matchedKeywords?: string[];
  ruleScore?: number;
  semanticScore?: number;
  matchReason?: string;
  relevance: number;
}

export interface LawReference {
  id: string;
  title: string;
  docType: string;
  applicationPoints: string[];
  riskIfMissing: string;
  relevance: number;
}

export interface ProfileConfidence {
  industry: ConfidenceLevel;
  workLocation: ConfidenceLevel;
  equipment: ConfidenceLevel;
  hazards: ConfidenceLevel;
}

export interface WorkProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: HazardItem[];
}

export interface RiskAnalysis {
  score: number;
  level: RiskLevel;
  scenario: string;
  immediateActions: ImmediateAction[];
  improvements: Improvement[];
  fatalityCases: FatalityCase[];
}

export interface EvidenceAiSummary {
  incidentRelevance: string;
  applicabilityReason: string;
  practicalActions: string[];
}

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  sourceBadge: "재해사례" | "사고사망" | "사망사고" | "치명사고" | "법령" | "Guide" | "미디어";
  title: string;
  relevanceScore: number;
  semanticScore?: number;
  summaryBullets: string[];
  keywords: string[];
  url?: string;
  incidentDate?: string;
  place?: string;
  casualtyScale?: string;
  standardAccidentType?: string;
  documentType?: string;
  applicationPoints?: string[];
  riskIfOmitted?: string;
  similarity?: number;
  excluded?: boolean;
  remedialActions?: string[];
  legalBasis?: string;
  complianceChecklist?: string[];
  sourceType?: "db" | "api" | "storage";
  lawCategory?: "1" | "2" | "3" | "4";
  articleNumber?: string;
  articleTitle?: string;
  clausePreview?: string;
  relevanceReason?: string;
  actionNeedReason?: string;
  applicabilityReason?: string;
  keyExcerpt?: string;
  summaryArticle?: string;
  fullContent?: string;
  mediaStyle?: string;
  aiSummary?: EvidenceAiSummary;
}

export interface LawActionItem {
  id: string;
  stage: LawActionStage;
  actionText: string;
  articleNumbers: string[];
  articleTitle?: string;
  legalBasis?: string;
  lawName?: string;
  lawCategory?: "1" | "2" | "3" | "4";
  clausePreview?: string;
  legalRequirement?: string;
  relevanceReason?: string;
  actionNeedReason?: string;
  applicabilityReason?: string;
  keyExcerpt?: string;
  summaryArticle?: string;
  selectionMode?: "direct" | "derived" | "reused";
  selectionReason?: string;
  generationType?: "direct" | "derived";
  lawFitStatus?: LawFitStatus;
  lawFitReason?: string;
  lawFitScore?: number;
  lawFitGateFailureCode?: "INCIDENT_ANCHOR_MISMATCH";
}

export interface LawGuideMeta {
  sourceCounts: {
    api: number;
    db: number;
    storage: number;
  };
  trackCounts: {
    law: number;
    guide: number;
    media: number;
  };
  trackStatus?: {
    law: "success" | "empty" | "error";
    guide: "success" | "empty" | "error";
    media: "success" | "empty" | "error";
  };
  trackErrors?: {
    law?: string[];
    guide?: string[];
    media?: string[];
  };
  trackEmptyReason?: {
    law?: "NO_CANDIDATE" | "FILTERED_OUT";
    guide?: "NO_CANDIDATE" | "FILTERED_OUT";
    media?: "NO_CANDIDATE" | "FILTERED_OUT";
  };
  lawDiagnostics?: {
    api: {
      law: {
        attempted: number;
        succeeded: number;
        failed: number;
        candidateCount: number;
        errors?: string[];
      };
      guide: {
        attempted: number;
        succeeded: number;
        failed: number;
        candidateCount: number;
        errors?: string[];
      };
      media: {
        attempted: number;
        succeeded: number;
        failed: number;
        candidateCount: number;
        errors?: string[];
      };
    };
    db: {
      fetchedRowCount: number;
      candidateCount: number;
      error?: string;
    };
    storage: {
      listedPathCount: number;
      attemptedPathCount: number;
      downloadedPathCount: number;
      parsedArticleCount: number;
      extractedArticleNumberCount: number;
      articleNumberExtractRate: number;
      candidateCount: number;
      skippedByRulesFilterCount: number;
      errors?: string[];
    };
    selection: {
      rawCandidateCount: number;
      strictCandidateCount: number;
      rankingPoolCount: number;
      rankedCandidateCount: number;
      selectedLawItemCount: number;
      droppedByStrictAxisCount: number;
      droppedByRankingThresholdCount: number;
    };
  };
  guideEmptyReason?: string;
}

export interface CitationItem {
  id: string;
  evidenceId: string;
  title: string;
  sourceBadge: EvidenceItem["sourceBadge"];
  summary: string;
  order: number;
  addedAt: string;
  aiSummary?: EvidenceAiSummary;
}

export interface MaterialItem {
  id: string;
  type: MaterialType;
  title: string;
  url: string;
  language: "한국어" | "외국어" | "국문" | "영문" | "중국어" | "베트남어";
  relevance: number;
  recommendReason: string;
  excluded?: boolean;
  selected?: boolean;
}

export interface MaterialSearchFilters {
  keyword?: string;
  materialTypeCode?: string;
  industryCodeOverride?: string;
  hazardCodesOverride?: string[];
  priorityMode?: MaterialPriorityMode;
  industryScope?: MaterialIndustryScope;
  hazardScope?: MaterialHazardScope;
}

export type EvidenceFetchStatus = "success" | "partial" | "empty" | "error";

export interface EvidenceFetchResult {
  items: EvidenceItem[];
  lawItems?: EvidenceItem[];
  guideItems?: EvidenceItem[];
  mediaItems?: EvidenceItem[];
  lawActionItems?: LawActionItem[];
  lawGuideMeta?: LawGuideMeta;
  status: EvidenceFetchStatus;
  errorCode?: string;
}

export interface MaterialFetchResult {
  items: MaterialItem[];
  status: EvidenceFetchStatus;
  errorCode?: string;
}

export interface ApiStatuses {
  gemini: ApiStatus;
  disasterCase: ApiStatus;
  fatalityCase: ApiStatus;
  lawGuide: ApiStatus;
  materials: ApiStatus;
}

export interface SaveState {
  status: SaveStatus;
  dirty: boolean;
  lastSavedAt?: string;
}

export interface ReportExportState {
  pdf: ApiStatus;
  docx: ApiStatus;
  clipboard: ApiStatus;
  lastError?: string;
  lastExportAt?: string;
}

export interface AssessmentData {
  id: string;
  taskName: string;
  taskDescription: string;
  siteName: string;
  workDate: string;
  photos: File[];
  photoUrls: string[];
  profile: WorkProfile;
  profileConfidence: ProfileConfidence;
  analysis: RiskAnalysis;
  disasterCases: DisasterCase[];
  lawReferences: LawReference[];
  lawActionItems: LawActionItem[];
  lawGuideMeta: LawGuideMeta | null;
  evidenceItems: EvidenceItem[];
  materials: MaterialItem[];
  citations: CitationItem[];
  selectedMaterials: string[];
  reportSections: ReportSection[];
  checklistItems: string[];
  briefingText: string;
  apiStatuses: ApiStatuses;
  saveState: SaveState;
  reportExportState: ReportExportState;
  status: AssessmentStatus;
  currentStep: AssessmentStep;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  editable: boolean;
  order: number;
}

export const STEP_ORDER: AssessmentStep[] = [
  "input",
  "profile_review",
  "analysis",
  "evidence",
  "materials",
  "report",
];

export const STEP_CONFIG: { step: AssessmentStep; label: string; route: string }[] = [
  { step: "input", label: "작업 입력", route: "/assessments/new" },
  { step: "profile_review", label: "AI 분석 확인", route: "/assessments/:id/profile-review" },
  { step: "analysis", label: "분석 결과", route: "/assessments/:id/analysis" },
  { step: "evidence", label: "근거 확인", route: "/assessments/:id/evidence" },
  { step: "materials", label: "교육 자료", route: "/assessments/:id/materials" },
  { step: "report", label: "문서 출력", route: "/assessments/:id/report" },
];

export function resolveStepRoute(step: AssessmentStep, assessmentId: string) {
  const route = STEP_CONFIG.find((config) => config.step === step)?.route ?? "/assessments/new";
  return route.replace(":id", assessmentId);
}

export const RISK_WEIGHTS: Record<string, number> = {
  [STANDARD_HAZARD_TYPES[0]]: 30,
  [STANDARD_HAZARD_TYPES[1]]: 35,
  [STANDARD_HAZARD_TYPES[2]]: 35,
  [STANDARD_HAZARD_TYPES[3]]: 35,
  [STANDARD_HAZARD_TYPES[4]]: 35,
  [STANDARD_HAZARD_TYPES[5]]: 25,
  [STANDARD_HAZARD_TYPES[6]]: 25,
  [STANDARD_HAZARD_TYPES[7]]: 20,
  [STANDARD_HAZARD_TYPES[8]]: 25,
  [STANDARD_HAZARD_TYPES[9]]: 25,
  [STANDARD_HAZARD_TYPES[10]]: 10,
};

export const HAZARD_TYPE_OPTIONS = [...STANDARD_HAZARD_TYPES];

export const RISK_WEIGHT_RULES: Array<{ typeGroup: string; weight: number }> = [
  { typeGroup: "붕괴/질식/감전/폭발/화재", weight: 35 },
  { typeGroup: "추락", weight: 30 },
  { typeGroup: "끼임/말림/절단/차량/이동장비 충돌/화학노출", weight: 25 },
  { typeGroup: "낙하물/비래", weight: 20 },
  { typeGroup: "소음/분진/반복작업", weight: 10 },
];

function clampHazardWeight(rawWeight: number) {
  if (!Number.isFinite(rawWeight)) {
    return 1;
  }

  return Math.max(1, Math.min(40, Math.round(rawWeight)));
}

export function normalizeHazardWeight(type: string, rawWeight: number) {
  const normalizedType = normalizeHazardType(type, type) || type.trim();
  const matchedWeight = RISK_WEIGHTS[normalizedType];
  if (typeof matchedWeight === "number") {
    return matchedWeight;
  }

  return clampHazardWeight(rawWeight);
}

export function normalizeHazards(hazards: HazardItem[]) {
  return hazards.map((hazard) => {
    const normalizedType = normalizeHazardType(hazard.type, hazard.name) || "추락";
    return {
      ...hazard,
      type: normalizedType,
      weight: normalizeHazardWeight(normalizedType, hazard.weight),
      reason: (hazard.reason ?? "").trim() || "근거 없음",
    };
  });
}

export const HIGH_RISK_EQUIPMENT = ["지게차", "크레인", "고소작업대", "절단기", "배전반", "비계"];

export const INDUSTRY_OPTIONS = ["건설업", "제조업", "물류업", "화학업", "서비스업", "기타"];

export const DEFAULT_API_STATUSES: ApiStatuses = {
  gemini: "idle",
  disasterCase: "idle",
  fatalityCase: "idle",
  lawGuide: "idle",
  materials: "idle",
};

export const DEFAULT_SAVE_STATE: SaveState = {
  status: "idle",
  dirty: false,
};

export const DEFAULT_EXPORT_STATE: ReportExportState = {
  pdf: "idle",
  docx: "idle",
  clipboard: "idle",
};

export function getStepIndex(step: AssessmentStep) {
  return STEP_ORDER.indexOf(step);
}

export function calculateRiskScore(hazards: HazardItem[], equipment: string[], fatalitySimilarity: number): { score: number; level: RiskLevel } {
  const topHazards = [...hazards].sort((a, b) => b.weight - a.weight).slice(0, 3);
  let score = topHazards.reduce((sum, hazard) => sum + hazard.weight, 0);

  if (equipment.some((item) => HIGH_RISK_EQUIPMENT.includes(item))) {
    score += 15;
  }

  if (fatalitySimilarity >= 0.8) {
    score += 20;
  } else if (fatalitySimilarity >= 0.6) {
    score += 10;
  }

  score = Math.min(score, 100);
  const level: RiskLevel = score >= 90 ? "critical" : score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { score, level };
}

