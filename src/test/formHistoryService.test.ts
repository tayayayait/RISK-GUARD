import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormHistoryService } from "@/services/formHistoryService";
import { UserWorkHistoryService } from "@/services/userWorkHistoryService";
import type { RiskAssessmentRow } from "@/types/formTemplate";

vi.mock("@/services/userWorkHistoryService", () => ({
  UserWorkHistoryService: {
    create: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
  },
}));

const sampleRows: RiskAssessmentRow[] = [
  {
    workProcess: "공정",
    category: "추락",
    cause: "원인",
    hazardFactor: "요인",
    legalBasis: "산업안전보건기준에 관한 규칙 제42조",
    currentMeasure: "현재조치",
    frequency: 3,
    severity: 4,
    riskLevel: "12(보통)",
    reductionMeasure: "감소대책",
    postRiskLevel: "",
    improvementDate: "",
    completionDate: "",
    responsiblePerson: "",
  },
];

const storedRiskRecord = {
  id: "history-1",
  feature: "form-risk-assessment" as const,
  title: "작업명",
  subtitle: "현장명 · 2026-04-12",
  createdAt: "2026-04-12T10:00:00.000Z",
  updatedAt: "2026-04-12T10:00:00.000Z",
  input: {
    siteName: "현장명",
    workDate: "2026-04-12",
    contextText: "상황 설명",
  },
  result: {
    riskRows: sampleRows,
  },
};

describe("FormHistoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("위험성평가 서식을 로그인 사용자 작업 기록으로 저장한다", async () => {
    vi.mocked(UserWorkHistoryService.create).mockResolvedValue(storedRiskRecord);

    const result = await FormHistoryService.createRiskHistoryRecord({
      taskName: "작업명",
      siteName: "현장명",
      workDate: "2026-04-12",
      contextText: "상황 설명",
      riskRows: sampleRows,
    });

    expect(UserWorkHistoryService.create).toHaveBeenCalledWith({
      feature: "form-risk-assessment",
      title: "작업명",
      subtitle: "현장명 · 2026-04-12",
      input: {
        siteName: "현장명",
        workDate: "2026-04-12",
        contextText: "상황 설명",
      },
      result: {
        riskRows: sampleRows,
        validationSummary: undefined,
        validationEvents: undefined,
      },
    });
    expect(result).toMatchObject({ id: "history-1", formType: "risk-assessment", rowCount: 1 });
  });

  it("목록은 두 서식 기능만 계정 기록에서 조회한다", async () => {
    vi.mocked(UserWorkHistoryService.list).mockResolvedValue([storedRiskRecord]);

    const result = await FormHistoryService.listHistoryRecords();

    expect(UserWorkHistoryService.list).toHaveBeenCalledWith([
      "form-risk-assessment",
      "form-accident-report",
    ]);
    expect(result[0]).toMatchObject({ taskName: "작업명", siteName: "현장명", workDate: "2026-04-12" });
  });

  it("기록을 다시 열 때 입력과 결과를 서식 상세 데이터로 복원한다", async () => {
    vi.mocked(UserWorkHistoryService.get).mockResolvedValue(storedRiskRecord);

    const detail = await FormHistoryService.getRiskHistoryRecord("history-1");

    expect(UserWorkHistoryService.get).toHaveBeenCalledWith("history-1", "form-risk-assessment");
    expect(detail.contextText).toBe("상황 설명");
    expect(detail.riskRows).toEqual(sampleRows);
    expect(detail.accidentData).toBeNull();
  });

  it("검증 메타데이터를 결과와 함께 보존한다", async () => {
    const validationSummary = {
      totalRows: 1,
      reviewRequiredRows: 1,
      okRows: 0,
      hazardTypeCounts: { 감전: 1 },
    };
    vi.mocked(UserWorkHistoryService.create).mockResolvedValue({
      ...storedRiskRecord,
      result: { ...storedRiskRecord.result, validationSummary },
    });

    await FormHistoryService.createRiskHistoryRecord({
      taskName: "작업명",
      riskRows: sampleRows,
      validationSummary,
    });

    expect(UserWorkHistoryService.create).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.objectContaining({ validationSummary }) }),
    );
  });

  it("산업재해조사표도 별도 기능 유형으로 저장한다", async () => {
    const accidentData = {
      administrativeInfo: {},
      businessInfo: {},
      victimInfo: {},
      accidentDetails: {},
      preventionPlan: {},
    } as never;
    vi.mocked(UserWorkHistoryService.create).mockResolvedValue({
      ...storedRiskRecord,
      feature: "form-accident-report",
      title: "지게차 충돌 사고",
      result: { accidentData },
    });

    await FormHistoryService.createAccidentHistoryRecord({
      taskName: "지게차 충돌 사고",
      siteName: "B현장",
      workDate: "2026-04-13",
      accidentData,
    });

    expect(UserWorkHistoryService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "form-accident-report",
        title: "지게차 충돌 사고",
        result: { accidentData },
      }),
    );
  });

  it("삭제는 서식 기능 범위 안에서만 수행한다", async () => {
    vi.mocked(UserWorkHistoryService.remove).mockResolvedValue();

    await FormHistoryService.deleteHistoryRecord("history-1");

    expect(UserWorkHistoryService.remove).toHaveBeenCalledWith("history-1", [
      "form-risk-assessment",
      "form-accident-report",
    ]);
  });
});
