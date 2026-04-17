import { beforeEach, describe, expect, it, vi } from "vitest";
import { EvidenceSummaryService } from "@/services/evidenceSummaryService";
import { invokeBackend } from "@/services/edgeFunctionClient";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

const request = {
  taskName: "저장탱크 용접",
  taskDescription: "인화성 증기 잔류 가능 구간 용접 작업",
  profile: {
    industry: "화학업",
    workLocation: "저장탱크 외벽",
    equipment: ["용접기"],
    hazards: [
      {
        id: "h1",
        name: "폭발 위험",
        type: "폭발/화재",
        weight: 35,
        confidence: "high" as const,
        reason: "테스트",
      },
    ],
  },
  evidence: {
    title: "산업안전보건법 제31조",
    sourceBadge: "법령" as const,
    fullContent: "작업 전 환기와 가스농도 측정을 수행해야 한다.",
    keywords: ["환기", "가스농도"],
  },
};

describe("EvidenceSummaryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("신규 응답 스키마를 우선 파싱한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      incidentRelevance: "현재 작업 사고 시나리오와 법령 조문 내용이 직접 연결됩니다.",
      applicabilityReason: "해당 조문은 환기와 측정을 명시해 이번 작업에 바로 적용됩니다.",
      practicalActions: ["작업 전 가스농도를 측정하세요."],
    });

    const result = await EvidenceSummaryService.summarizeEvidence(request);

    expect(result.incidentRelevance).toContain("사고 시나리오");
    expect(result.applicabilityReason).toContain("바로 적용");
    expect(result.practicalActions).toEqual(["작업 전 가스농도를 측정하세요."]);
  });

  it("구응답 스키마(summary/actions/cautions)를 하위호환으로 파싱한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      summary: "작업 조건과 법령 요구사항이 일치합니다.",
      actions: {
        immediate: ["작업 전 가스농도를 측정하세요."],
        same_day: ["당일 환기 상태를 재확인하세요."],
        pre_resume: ["재개 전 화기작업 허가를 확인하세요."],
      },
      cautions: ["측정 장비 교정 상태를 확인하세요."],
    });

    const result = await EvidenceSummaryService.summarizeEvidence(request);

    expect(result.incidentRelevance).toBe("작업 조건과 법령 요구사항이 일치합니다.");
    expect(result.applicabilityReason).toBe("측정 장비 교정 상태를 확인하세요.");
    expect(result.practicalActions).toEqual([
      "작업 전 가스농도를 측정하세요.",
      "당일 환기 상태를 재확인하세요.",
      "재개 전 화기작업 허가를 확인하세요.",
    ]);
  });
});
