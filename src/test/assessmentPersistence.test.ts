import { describe, expect, it } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import {
  isPersistable,
  restoreAssessmentFromDetail,
  toUpsertPayload,
} from "@/lib/assessmentPersistence";
import type { AssessmentData } from "@/types/assessment";

function buildAssessment(overrides: Partial<AssessmentData> = {}): AssessmentData {
  return {
    ...createMockAssessment(),
    status: "analysis_ready",
    ...overrides,
  };
}

describe("toUpsertPayload", () => {
  it("위험성평가표를 최상위 riskRows로 보낸다", () => {
    const assessment = buildAssessment({
      riskRows: [
        {
          workProcess: "외벽 도장",
          category: "추락",
          cause: "발판 미고정",
          hazardFactor: "추락",
          legalBasis: "",
          currentMeasure: "안전대 착용",
          frequency: 3,
          severity: 4,
          riskLevel: "12(보통)",
          reductionMeasure: "안전난간 설치",
          acceptability: "not_acceptable",
          postFrequency: 2,
          postSeverity: 4,
          postRiskLevel: "8(보통)",
          improvementStatus: "planned",
        },
      ],
    });

    const payload = toUpsertPayload(assessment);

    expect(payload.riskRows).toHaveLength(1);
    expect(payload.riskRows[0].acceptability).toBe("not_acceptable");
    expect(payload.riskRows[0].postRiskLevel).toBe("8(보통)");
  });

  it("0~100 종합 점수는 참고지표 필드로만 보낸다", () => {
    const assessment = buildAssessment();
    const payload = toUpsertPayload(assessment);

    expect(payload.referenceScore).toBe(assessment.analysis.score);
    expect(payload.referenceLevel).toBe(assessment.analysis.level);
  });

  it("카드 UI 복원용 분석 결과를 스냅샷으로 보관한다", () => {
    const assessment = buildAssessment({
      currentStep: "evidence",
      evidenceItems: [{ id: "evidence-1" } as never],
      citations: [{ id: "citation-1" } as never],
    });
    const payload = toUpsertPayload(assessment);

    expect(payload.analysisSnapshot).toMatchObject({
      version: 2,
      assessment: expect.objectContaining({
        currentStep: "evidence",
        evidenceItems: [{ id: "evidence-1" }],
        citations: [{ id: "citation-1" }],
      }),
    });
    expect((payload.analysisSnapshot.assessment as Record<string, unknown>)).not.toHaveProperty("photos");
  });

  it("완료 상태만 confirmed로 저장한다", () => {
    expect(toUpsertPayload(buildAssessment({ status: "analysis_ready" })).status).toBe("draft");
    expect(toUpsertPayload(buildAssessment({ status: "completed" })).status).toBe("confirmed");
  });
});

describe("restoreAssessmentFromDetail", () => {
  it("전체 스냅샷과 정규화 행을 다시 열 수 있는 AssessmentData로 복원한다", () => {
    const original = buildAssessment({
      id: "local-assessment",
      currentStep: "materials",
      evidenceItems: [{ id: "evidence-1" } as never],
      materials: [{ id: "material-1" } as never],
      photos: [new File(["photo"], "site.jpg", { type: "image/jpeg" })],
    });
    const payload = toUpsertPayload(original);

    const restored = restoreAssessmentFromDetail({
      id: "11111111-2222-3333-4444-555555555555",
      taskName: original.taskName,
      taskDescription: original.taskDescription,
      siteName: original.siteName,
      workDate: original.workDate,
      industry: original.profile.industry,
      workLocation: original.profile.workLocation,
      evaluator: original.evaluator ?? "",
      referenceScore: original.analysis.score,
      referenceLevel: original.analysis.level,
      status: "draft",
      createdAt: original.createdAt,
      updatedAt: "2026-08-20T02:00:00.000Z",
      retainUntil: "2029-08-20T02:00:00.000Z",
      analysisSnapshot: payload.analysisSnapshot,
      riskRows: original.riskRows,
      participants: original.participants,
      shareRecords: original.shareRecords,
    });

    expect(restored.id).toBe("11111111-2222-3333-4444-555555555555");
    expect(restored.persistedId).toBe("11111111-2222-3333-4444-555555555555");
    expect(restored.currentStep).toBe("materials");
    expect(restored.evidenceItems).toEqual([{ id: "evidence-1" }]);
    expect(restored.materials).toEqual([{ id: "material-1" }]);
    expect(restored.photos).toEqual([]);
    expect(restored.saveState).toMatchObject({ status: "saved", dirty: false });
  });
});

describe("isPersistable", () => {
  it("분석 전 초안은 저장하지 않는다", () => {
    expect(isPersistable(null)).toBe(false);
    expect(isPersistable(buildAssessment({ status: "draft" }))).toBe(false);
    expect(isPersistable(buildAssessment({ status: "analyzing" }))).toBe(false);
  });

  it("작업명이 없으면 저장하지 않는다", () => {
    expect(isPersistable(buildAssessment({ taskName: "   " }))).toBe(false);
  });

  it("분석이 끝난 평가는 저장 대상이다", () => {
    expect(isPersistable(buildAssessment({ status: "analysis_ready" }))).toBe(true);
    expect(isPersistable(buildAssessment({ status: "completed" }))).toBe(true);
  });
});
