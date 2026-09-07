import type { AssessmentData } from "@/types/assessment";
import {
  DEFAULT_API_STATUSES,
  DEFAULT_EXPORT_STATE,
  STEP_ORDER,
  type AssessmentStep,
} from "@/types/assessment";
import type {
  RiskAssessmentDetail,
  RiskAssessmentUpsertPayload,
} from "@/services/riskAssessmentStoreService";
import { buildBaseAssessment } from "@/services/assessmentAnalysisService";

/**
 * 저장 페이로드 변환.
 *
 * 위험성평가표(`riskRows`)가 법정 산출물이고, 카드 UI가 쓰는 분석 결과는
 * `analysisSnapshot`으로 함께 보관해 화면 복원에 사용한다.
 * 0~100 종합 점수는 `referenceScore`로 남기되 참고지표일 뿐이다.
 */
export function toUpsertPayload(assessment: AssessmentData): RiskAssessmentUpsertPayload {
  const { photos: _photos, photoUrls: _photoUrls, ...serializableAssessment } = assessment;
  return {
    taskName: assessment.taskName,
    taskDescription: assessment.taskDescription,
    siteName: assessment.siteName,
    workDate: assessment.workDate || undefined,
    industry: assessment.profile.industry,
    workLocation: assessment.profile.workLocation,
    evaluator: assessment.evaluator ?? "",
    referenceScore: assessment.analysis.score,
    referenceLevel: assessment.analysis.level,
    status: assessment.status === "completed" ? "confirmed" : "draft",
    analysisSnapshot: {
      version: 2,
      assessment: {
        ...serializableAssessment,
        photoUrls: [],
      },
    },
    riskRows: assessment.riskRows,
  };
}

function isAssessmentStep(value: unknown): value is AssessmentStep {
  return typeof value === "string" && STEP_ORDER.includes(value as AssessmentStep);
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function restoreAssessmentFromDetail(detail: RiskAssessmentDetail): AssessmentData {
  const snapshot = readRecord(detail.analysisSnapshot);
  const versionedAssessment = snapshot.version === 2 ? readRecord(snapshot.assessment) : {};
  const hasVersionedSnapshot = Object.keys(versionedAssessment).length > 0;
  const base = buildBaseAssessment({
    taskName: detail.taskName,
    taskDescription: detail.taskDescription,
    siteName: detail.siteName,
    workDate: detail.workDate,
    photos: [],
  });
  const stored = hasVersionedSnapshot ? versionedAssessment as Partial<AssessmentData> : {};
  const legacyCurrentStep = isAssessmentStep(snapshot.currentStep) ? snapshot.currentStep : "analysis";
  const storedCurrentStep = isAssessmentStep(stored.currentStep) ? stored.currentStep : legacyCurrentStep;

  return {
    ...base,
    ...stored,
    id: detail.id,
    persistedId: detail.id,
    taskName: detail.taskName,
    taskDescription: detail.taskDescription,
    siteName: detail.siteName,
    workDate: detail.workDate,
    evaluator: detail.evaluator,
    photos: [],
    photoUrls: [],
    profile: hasVersionedSnapshot
      ? { ...base.profile, ...stored.profile }
      : { ...base.profile, ...readRecord(snapshot.profile), industry: detail.industry, workLocation: detail.workLocation },
    profileConfidence: hasVersionedSnapshot
      ? { ...base.profileConfidence, ...stored.profileConfidence }
      : { ...base.profileConfidence, ...readRecord(snapshot.profileConfidence) },
    analysis: hasVersionedSnapshot
      ? { ...base.analysis, ...stored.analysis }
      : {
          ...base.analysis,
          ...readRecord(snapshot.analysis),
          score: detail.referenceScore ?? 0,
          level: detail.referenceLevel ?? "low",
        },
    riskRows: detail.riskRows,
    participants: detail.participants,
    shareRecords: detail.shareRecords,
    checklistItems: hasVersionedSnapshot
      ? (Array.isArray(stored.checklistItems) ? stored.checklistItems : [])
      : (Array.isArray(snapshot.checklistItems) ? snapshot.checklistItems as string[] : []),
    briefingText: hasVersionedSnapshot
      ? (typeof stored.briefingText === "string" ? stored.briefingText : "")
      : (typeof snapshot.briefingText === "string" ? snapshot.briefingText : ""),
    apiStatuses: { ...DEFAULT_API_STATUSES, ...(stored.apiStatuses ?? {}) },
    saveState: {
      status: "saved",
      dirty: false,
      lastSavedAt: detail.updatedAt,
    },
    reportExportState: { ...DEFAULT_EXPORT_STATE, ...(stored.reportExportState ?? {}) },
    status: stored.status ?? (detail.status === "confirmed" ? "completed" : "analysis_ready"),
    currentStep: storedCurrentStep,
    createdAt: detail.createdAt || base.createdAt,
    updatedAt: detail.updatedAt || base.updatedAt,
  };
}

/** 저장할 가치가 있는 상태인지. 분석 전 빈 초안까지 서버에 쓰지 않는다. */
export function isPersistable(assessment: AssessmentData | null): assessment is AssessmentData {
  if (!assessment) {
    return false;
  }
  if (!assessment.taskName.trim()) {
    return false;
  }
  return assessment.status !== "analyzing" && assessment.status !== "draft";
}
