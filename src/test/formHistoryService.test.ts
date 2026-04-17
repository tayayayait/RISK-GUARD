import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeBackend } from "@/services/edgeFunctionClient";
import { FormHistoryService } from "@/services/formHistoryService";
import type { RiskAssessmentRow } from "@/types/formTemplate";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
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

describe("FormHistoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("create action payload를 form-history 함수로 전송한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "history-1",
        formType: "risk-assessment",
        taskName: "작업명",
        siteName: "현장명",
        workDate: "2026-04-12",
        createdAt: "2026-04-12T10:00:00.000Z",
        expiresAt: "2026-05-12T10:00:00.000Z",
        rowCount: 1,
      },
    });

    const result = await FormHistoryService.createRiskHistoryRecord({
      taskName: "작업명",
      siteName: "현장명",
      workDate: "2026-04-12",
      contextText: "상황 설명",
      riskRows: sampleRows,
    });

    expect(result.id).toBe("history-1");
    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "form-history",
        payload: expect.objectContaining({
          action: "create",
          payload: expect.objectContaining({
            formType: "risk-assessment",
            taskName: "작업명",
            riskRows: sampleRows,
          }),
          scopeKey: expect.any(String),
        }),
      }),
    );
  });

  it("위험성평가 create payload에 validation 메타를 optional로 포함한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "history-validation-1",
        formType: "risk-assessment",
        taskName: "작업명",
        siteName: "현장명",
        workDate: "2026-04-12",
        createdAt: "2026-04-12T10:00:00.000Z",
        expiresAt: "2026-05-12T10:00:00.000Z",
        rowCount: 1,
      },
    });

    const validationSummary = {
      totalRows: 1,
      reviewRequiredRows: 1,
      okRows: 0,
      hazardTypeCounts: {
        감전: 1,
      },
    };
    const validationEvents = [
      {
        timestamp: "2026-04-17T00:00:00.000Z",
        siteName: "현장명",
        formType: "risk-assessment",
        rowIndex: 0,
        expectedHazardType: "감전",
        detectedHazardType: "추락",
        field: "currentMeasure",
        reasonCode: "current_measure_mismatch",
        rewritten: true,
        finalStatus: "review_required",
      },
    ];

    await FormHistoryService.createRiskHistoryRecord({
      taskName: "작업명",
      siteName: "현장명",
      workDate: "2026-04-12",
      contextText: "상황 설명",
      riskRows: sampleRows,
      validationSummary,
      validationEvents: validationEvents as any,
    });

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: "create",
          payload: expect.objectContaining({
            validationSummary,
            validationEvents,
          }),
        }),
      }),
    );
  });

  it("동일 브라우저에서는 scopeKey를 재사용한다", async () => {
    vi.mocked(invokeBackend)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });

    await FormHistoryService.listRiskHistoryRecords();
    await FormHistoryService.listRiskHistoryRecords();

    const firstPayload = vi.mocked(invokeBackend).mock.calls[0][0]?.payload as { scopeKey: string };
    const secondPayload = vi.mocked(invokeBackend).mock.calls[1][0]?.payload as { scopeKey: string };

    expect(firstPayload.scopeKey).toBeTruthy();
    expect(secondPayload.scopeKey).toBe(firstPayload.scopeKey);
  });

  it("get action 응답을 상세 형식으로 파싱한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "history-2",
        formType: "risk-assessment",
        taskName: "리스크 점검",
        siteName: "A현장",
        workDate: "2026-04-10",
        createdAt: "2026-04-10T09:00:00.000Z",
        expiresAt: "2026-05-10T09:00:00.000Z",
        rowCount: 1,
        contextText: "작업 상황",
        riskRows: sampleRows,
        accidentData: null,
      },
    });

    const detail = await FormHistoryService.getRiskHistoryRecord("history-2");

    expect(detail.id).toBe("history-2");
    expect(detail.riskRows).toHaveLength(1);
    expect(detail.contextText).toBe("작업 상황");
  });

  it("get action 응답의 validation optional 필드를 파싱한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "history-3",
        formType: "risk-assessment",
        taskName: "리스크 점검",
        siteName: "A현장",
        workDate: "2026-04-10",
        createdAt: "2026-04-10T09:00:00.000Z",
        expiresAt: "2026-05-10T09:00:00.000Z",
        rowCount: 1,
        contextText: "작업 상황",
        riskRows: sampleRows,
        validationSummary: {
          totalRows: 1,
          reviewRequiredRows: 1,
          okRows: 0,
          hazardTypeCounts: { 감전: 1 },
        },
        validationEvents: [
          {
            timestamp: "2026-04-17T00:00:00.000Z",
            siteName: "A현장",
            formType: "risk-assessment",
            rowIndex: 0,
            expectedHazardType: "감전",
            detectedHazardType: "추락",
            field: "currentMeasure",
            reasonCode: "current_measure_mismatch",
            rewritten: true,
            finalStatus: "review_required",
          },
        ],
      },
    });

    const detail = await FormHistoryService.getRiskHistoryRecord("history-3");

    expect(detail.validationSummary?.reviewRequiredRows).toBe(1);
    expect(detail.validationEvents).toHaveLength(1);
    expect(detail.validationEvents?.[0]?.field).toBe("currentMeasure");
  });

  it("get action 응답에서 validation 필드가 없어도 역호환 파싱을 유지한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "history-4",
        formType: "risk-assessment",
        taskName: "리스크 점검",
        siteName: "A현장",
        workDate: "2026-04-10",
        createdAt: "2026-04-10T09:00:00.000Z",
        expiresAt: "2026-05-10T09:00:00.000Z",
        rowCount: 1,
        contextText: "작업 상황",
        riskRows: sampleRows,
      },
    });

    const detail = await FormHistoryService.getRiskHistoryRecord("history-4");

    expect(detail.validationSummary).toBeUndefined();
    expect(detail.validationEvents).toBeUndefined();
  });

  it("산업재해조사표 create payload를 전송한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "history-accident-1",
        formType: "accident-report",
        taskName: "지게차 충돌 사고",
        siteName: "B현장",
        workDate: "2026-04-13",
        createdAt: "2026-04-13T10:00:00.000Z",
        expiresAt: "2026-05-13T10:00:00.000Z",
        rowCount: 0,
      },
    });

    await FormHistoryService.createAccidentHistoryRecord({
      taskName: "지게차 충돌 사고",
      siteName: "B현장",
      workDate: "2026-04-13",
      contextText: "사고 발생 상황",
      accidentData: {
        administrativeInfo: {},
        businessInfo: {},
        victimInfo: {},
        accidentDetails: {},
        preventionPlan: {},
      } as any,
    });

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "form-history",
        payload: expect.objectContaining({
          action: "create",
          payload: expect.objectContaining({
            formType: "accident-report",
            taskName: "지게차 충돌 사고",
          }),
          scopeKey: expect.any(String),
        }),
      }),
    );
  });

  it("delete action 요청 시 scopeKey와 recordId를 전송한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({ ok: true });

    await FormHistoryService.deleteRiskHistoryRecord("history-delete");

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "form-history",
        payload: expect.objectContaining({
          action: "delete",
          recordId: "history-delete",
          scopeKey: expect.any(String),
        }),
      }),
    );
  });

  it("delete action에서 백엔드 응답이 없으면 전용 에러를 반환한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(null);

    await expect(FormHistoryService.deleteRiskHistoryRecord("history-delete")).rejects.toThrow(
      "FORM_HISTORY_DELETE_BACKEND_UNAVAILABLE",
    );
  });

  it("백엔드 응답이 없으면 에러를 반환한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(null);

    await expect(FormHistoryService.listRiskHistoryRecords()).rejects.toThrow("FORM_HISTORY_BACKEND_UNAVAILABLE");
  });
});
