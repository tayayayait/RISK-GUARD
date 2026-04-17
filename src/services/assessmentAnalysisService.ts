import { GeminiService, type AnalyzeTaskInput, type GeminiAnalyzeResult } from "@/services/geminiService";
import {
  calculateRiskScore,
  DEFAULT_API_STATUSES,
  DEFAULT_EXPORT_STATE,
  DEFAULT_SAVE_STATE,
  normalizeHazards,
  type AssessmentData,
} from "@/types/assessment";

export function buildBaseAssessment(input: AnalyzeTaskInput): AssessmentData {
  const now = new Date().toISOString();
  const id = `assess-${Date.now()}`;

  return {
    id,
    taskName: input.taskName.trim(),
    taskDescription: input.taskDescription.trim(),
    siteName: input.siteName?.trim() ?? "",
    workDate: input.workDate ?? "",
    photos: input.photos ?? [],
    photoUrls: [],
    profile: {
      industry: "",
      workLocation: "",
      equipment: [],
      hazards: [],
    },
    profileConfidence: {
      industry: "low",
      workLocation: "low",
      equipment: "low",
      hazards: "low",
    },
    analysis: {
      score: 0,
      level: "low",
      scenario: "",
      immediateActions: [],
      improvements: [],
      fatalityCases: [],
    },
    disasterCases: [],
    lawReferences: [],
    lawActionItems: [],
    lawGuideMeta: null,
    evidenceItems: [],
    materials: [],
    citations: [],
    selectedMaterials: [],
    reportSections: [],
    checklistItems: [],
    briefingText: "",
    apiStatuses: { ...DEFAULT_API_STATUSES },
    saveState: { ...DEFAULT_SAVE_STATE },
    reportExportState: { ...DEFAULT_EXPORT_STATE },
    status: "draft",
    currentStep: "input",
    createdAt: now,
    updatedAt: now,
  };
}

export function buildAnalyzingAssessment(input: AnalyzeTaskInput): AssessmentData {
  const base = buildBaseAssessment(input);
  return {
    ...base,
    status: "analyzing",
    apiStatuses: {
      ...base.apiStatuses,
      gemini: "loading",
    },
  };
}

export function applyGeminiAnalysis(initial: AssessmentData, result: GeminiAnalyzeResult): AssessmentData {
  const normalizedHazards = normalizeHazards(result.profile.hazards);
  const score = calculateRiskScore(normalizedHazards, result.profile.equipment, 0);

  return {
    ...initial,
    profile: {
      ...result.profile,
      hazards: normalizedHazards,
    },
    profileConfidence: result.profileConfidence,
    analysis: {
      score: score.score,
      level: score.level,
      scenario: result.scenario,
      immediateActions: result.immediateActions,
      improvements: result.improvements,
      fatalityCases: [],
    },
    checklistItems: result.immediateActions.map((action) => action.action),
    briefingText: result.briefingDraft,
    apiStatuses: {
      ...initial.apiStatuses,
      gemini: "success",
    },
    status: "review_required",
    currentStep: "profile_review",
    updatedAt: new Date().toISOString(),
  };
}

export function buildAnalysisFailedAssessment(initial: AssessmentData): AssessmentData {
  return {
    ...initial,
    apiStatuses: {
      ...initial.apiStatuses,
      gemini: "error",
    },
    status: "error",
    currentStep: "input",
    updatedAt: new Date().toISOString(),
  };
}

export async function analyzeTaskToAssessment(input: AnalyzeTaskInput): Promise<AssessmentData> {
  const initial = buildAnalyzingAssessment(input);
  const result = await GeminiService.analyzeTask(input);
  return applyGeminiAnalysis(initial, result);
}
