import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeBackend } from "@/services/edgeFunctionClient";
import {
  RiskAssessmentStoreService,
  pickStoredRiskAssessmentMatch,
} from "@/services/riskAssessmentStoreService";
import type { RiskAssessmentSummary } from "@/services/riskAssessmentStoreService";
import type { RiskAssessmentRow } from "@/types/formTemplate";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

const sampleRow: RiskAssessmentRow = {
  workProcess: "외벽 도장",
  category: "추락",
  cause: "비계 발판 미고정",
  hazardFactor: "고소 작업 중 추락",
  legalBasis: "산업안전보건기준에 관한 규칙 제42조",
  currentMeasure: "안전대 착용",
  frequency: 3,
  severity: 4,
  riskLevel: "12(보통)",
  reductionMeasure: "작업발판 고정 및 안전난간 설치",
  acceptability: "not_acceptable",
  acceptabilityBasis: "위험성 보통. 감소대책 수립 필요",
  postFrequency: 2,
  postSeverity: 2,
  postRiskLevel: "4(낮음)",
  postAcceptability: "acceptable",
  responsiblePerson: "김안전",
  improvementDate: "2026-08-25",
  completionDate: "",
  improvementStatus: "in_progress",
  completionNote: "",
};

function detailResponse(overrides: Record<string, unknown> = {}) {
  return {
    item: {
      id: "11111111-2222-3333-4444-555555555555",
      taskName: "외벽 도장 작업",
      taskDescription: "설명",
      siteName: "한국건설 현장",
      workDate: "2026-08-19",
      industry: "건설업",
      workLocation: "외벽",
      evaluator: "김담당",
      referenceScore: 72,
      referenceLevel: "high",
      status: "draft",
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
      retainUntil: "2029-08-19T00:00:00.000Z",
      analysisSnapshot: {},
      riskRows: [sampleRow],
      participants: [],
      shareRecords: [],
      ...overrides,
    },
  };
}

describe("RiskAssessmentStoreService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upsert가 신규 생성 시 assessmentId 없이 risk-assessment-store로 전송한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(detailResponse());

    const detail = await RiskAssessmentStoreService.upsert({
      taskName: "외벽 도장 작업",
      siteName: "한국건설 현장",
      referenceScore: 72,
      referenceLevel: "high",
      riskRows: [sampleRow],
    });

    expect(detail.id).toBe("11111111-2222-3333-4444-555555555555");
    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "risk-assessment-store",
        payload: expect.objectContaining({
          action: "upsert",
          payload: expect.objectContaining({
            taskName: "외벽 도장 작업",
            riskRows: [sampleRow],
          }),
        }),
      }),
    );

    const call = vi.mocked(invokeBackend).mock.calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload).not.toHaveProperty("assessmentId");
  });

  it("upsert가 기존 id를 받으면 assessmentId를 함께 전송한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(detailResponse());

    await RiskAssessmentStoreService.upsert(
      { taskName: "외벽 도장 작업", riskRows: [sampleRow] },
      "11111111-2222-3333-4444-555555555555",
    );

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: "upsert",
          assessmentId: "11111111-2222-3333-4444-555555555555",
        }),
      }),
    );
  });

  it("허용 가능 여부와 개선 후 위험성을 응답에서 보존한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(detailResponse());

    const detail = await RiskAssessmentStoreService.upsert({
      taskName: "외벽 도장 작업",
      riskRows: [sampleRow],
    });

    const row = detail.riskRows[0];
    expect(row.acceptability).toBe("not_acceptable");
    expect(row.acceptabilityBasis).toBe("위험성 보통. 감소대책 수립 필요");
    expect(row.postFrequency).toBe(2);
    expect(row.postSeverity).toBe(2);
    expect(row.postRiskLevel).toBe("4(낮음)");
    expect(row.postAcceptability).toBe("acceptable");
  });

  it("이행 관리 필드를 응답에서 보존한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(detailResponse());

    const detail = await RiskAssessmentStoreService.upsert({
      taskName: "외벽 도장 작업",
      riskRows: [sampleRow],
    });

    const row = detail.riskRows[0];
    expect(row.responsiblePerson).toBe("김안전");
    expect(row.improvementDate).toBe("2026-08-25");
    expect(row.improvementStatus).toBe("in_progress");
  });

  it("patchRow가 행 단위 부분 갱신을 전송한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: { ...sampleRow, improvementStatus: "done", completionDate: "2026-08-24" },
    });

    const row = await RiskAssessmentStoreService.patchRow(
      "11111111-2222-3333-4444-555555555555",
      0,
      { improvementStatus: "done", completionDate: "2026-08-24" },
    );

    expect(row.improvementStatus).toBe("done");
    expect(row.completionDate).toBe("2026-08-24");
    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          action: "patchRow",
          rowIndex: 0,
          payload: { improvementStatus: "done", completionDate: "2026-08-24" },
        }),
      }),
    );
  });

  it("patchRow는 음수 rowIndex를 거부한다", async () => {
    await expect(
      RiskAssessmentStoreService.patchRow("11111111-2222-3333-4444-555555555555", -1, {}),
    ).rejects.toThrow("RISK_ASSESSMENT_STORE_INVALID_ROW_INDEX");

    expect(invokeBackend).not.toHaveBeenCalled();
  });

  it("참여자 추가 시 역할과 참여 방법을 전송한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name: "박근로",
        role: "worker_representative",
        affiliation: "1공구",
        method: "interview",
        participatedAt: "2026-08-19",
        note: "",
      },
    });

    const participant = await RiskAssessmentStoreService.addParticipant(
      "11111111-2222-3333-4444-555555555555",
      { name: "박근로", role: "worker_representative", method: "interview", participatedAt: "2026-08-19" },
    );

    expect(participant.role).toBe("worker_representative");
    expect(participant.method).toBe("interview");
    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ action: "addParticipant" }),
      }),
    );
  });

  it("공유 기록 추가 시 실시 전/후 구분을 전송한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        id: "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff",
        phase: "after",
        method: "posting",
        sharedAt: "2026-08-19T09:00:00.000Z",
        audienceNote: "1공구 12명",
        content: "위험성 수준 결정 결과 및 개선대책 게시",
        recordedBy: "김담당",
      },
    });

    const share = await RiskAssessmentStoreService.addShareRecord(
      "11111111-2222-3333-4444-555555555555",
      { phase: "after", method: "posting", content: "위험성 수준 결정 결과 및 개선대책 게시" },
    );

    expect(share.phase).toBe("after");
    expect(share.method).toBe("posting");
  });

  it("공유 내용이 비어 있으면 요청하지 않는다", async () => {
    await expect(
      RiskAssessmentStoreService.addShareRecord("11111111-2222-3333-4444-555555555555", {
        phase: "after",
        method: "posting",
        content: "   ",
      }),
    ).rejects.toThrow("RISK_ASSESSMENT_STORE_SHARE_CONTENT_REQUIRED");

    expect(invokeBackend).not.toHaveBeenCalled();
  });

  it("백엔드 미응답 시 저장 성공으로 처리하지 않는다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(null as never);

    await expect(
      RiskAssessmentStoreService.upsert({ taskName: "외벽 도장 작업", riskRows: [sampleRow] }),
    ).rejects.toThrow("RISK_ASSESSMENT_STORE_BACKEND_UNAVAILABLE");
  });

  it("로그인 사용자는 기기 scopeKey를 요청에 보내지 않는다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(detailResponse());

    await RiskAssessmentStoreService.upsert({ taskName: "작업", riskRows: [sampleRow] });

    const call = vi.mocked(invokeBackend).mock.calls[0][0] as { payload: Record<string, unknown> };
    expect(call.payload).not.toHaveProperty("scopeKey");
  });
});


describe("pickStoredRiskAssessmentMatch", () => {
  function summary(overrides: Partial<RiskAssessmentSummary>): RiskAssessmentSummary {
    return {
      id: "assessment-1",
      taskName: "외벽 도장",
      siteName: "1현장",
      workDate: "2026-04-08",
      industry: "건설업",
      workLocation: "외벽",
      evaluator: "유창제",
      referenceScore: 70,
      referenceLevel: "high",
      status: "confirmed",
      createdAt: "2026-04-08T00:00:00.000Z",
      updatedAt: "2026-04-08T00:00:00.000Z",
      retainUntil: "2029-04-08T00:00:00.000Z",
      ...overrides,
    };
  }

  it("작업명이 같으면 목록의 최신 항목을 고른다", () => {
    const match = pickStoredRiskAssessmentMatch(
      [
        summary({ id: "newest", updatedAt: "2026-04-09T00:00:00.000Z" }),
        summary({ id: "older", updatedAt: "2026-04-01T00:00:00.000Z" }),
      ],
      "외벽 도장",
    );

    expect(match?.id).toBe("newest");
  });

  it("공백과 대소문자 차이를 무시한다", () => {
    const match = pickStoredRiskAssessmentMatch([summary({ taskName: "Tower Crane" })], "  tower   crane ");

    expect(match?.id).toBe("assessment-1");
  });

  it("현장명이 있으면 같은 현장을 우선한다", () => {
    const match = pickStoredRiskAssessmentMatch(
      [
        summary({ id: "other-site", siteName: "2현장" }),
        summary({ id: "same-site", siteName: "3현장" }),
      ],
      "외벽 도장",
      "3현장",
    );

    expect(match?.id).toBe("same-site");
  });

  it("작업명이 다르거나 비어 있으면 매칭하지 않는다", () => {
    expect(pickStoredRiskAssessmentMatch([summary({})], "다른 작업")).toBeNull();
    expect(pickStoredRiskAssessmentMatch([summary({})], "   ")).toBeNull();
    expect(pickStoredRiskAssessmentMatch([], "외벽 도장")).toBeNull();
  });
});
