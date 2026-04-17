import { beforeEach, describe, expect, it, vi } from "vitest";
import { RiskLegalBasisFitService } from "@/services/riskLegalBasisFitService";
import { invokeBackend } from "@/services/edgeFunctionClient";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

describe("RiskLegalBasisFitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips review when there is no strict legal basis row", async () => {
    const reviewed = await RiskLegalBasisFitService.reviewRows({
      taskName: "설비 점검",
      contextText: "점검 상황",
      rows: [
        {
          workProcess: "설비 점검",
          category: "작업특성 요인",
          cause: "점검 미흡",
          hazardFactor: "비계 고정 불량",
          legalBasis: "",
        },
      ],
      candidateOptionsByRow: [[]],
    });

    expect(reviewed).toEqual([]);
    expect(invokeBackend).not.toHaveBeenCalled();
  });

  it("accepts valid AI recommendation in candidate set", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      results: [
        {
          rowIndex: 0,
          recommendedLegalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
          status: "verified",
          score: 83,
          reason: "행 위험요인과 조문이 정합합니다.",
        },
      ],
    });

    const reviewed = await RiskLegalBasisFitService.reviewRows({
      taskName: "설비 점검",
      contextText: "점검 상황",
      rows: [
        {
          workProcess: "설비 점검",
          category: "작업특성 요인",
          cause: "작업 전 이동식 비계 고정 점검 미흡",
          hazardFactor: "비계 고정 불량",
          legalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
        },
      ],
      candidateOptionsByRow: [[
        {
          legalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
          articleNumber: "제57조",
          articleTitle: "비계 등의 조립·해체 및 변경",
          score: 92,
          sourceType: "fallback",
        },
        {
          legalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
          articleNumber: "제42조",
          articleTitle: "추락의 방지",
          score: 90,
          sourceType: "fallback",
        },
      ]],
    });

    expect(invokeBackend).toHaveBeenCalledOnce();
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]?.recommendedLegalBasis).toBe("산업안전보건기준에 관한 규칙 제42조(추락의 방지)");
  });

  it("filters out recommendations outside candidate set", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      results: [
        {
          rowIndex: 0,
          recommendedLegalBasis: "산업안전보건기준에 관한 규칙 제999조(임의조문)",
          status: "verified",
          score: 91,
          reason: "적합합니다.",
        },
      ],
    });

    const reviewed = await RiskLegalBasisFitService.reviewRows({
      taskName: "설비 점검",
      contextText: "점검 상황",
      rows: [
        {
          workProcess: "설비 점검",
          category: "전기적 요인",
          cause: "충전부 노출 상태 점검",
          hazardFactor: "감전 위험",
          legalBasis: "산업안전보건기준에 관한 규칙 제301조(전기기계·기구 등의 충전부 방호)",
        },
      ],
      candidateOptionsByRow: [[
        {
          legalBasis: "산업안전보건기준에 관한 규칙 제301조(전기기계·기구 등의 충전부 방호)",
          articleNumber: "제301조",
          articleTitle: "전기기계·기구 등의 충전부 방호",
          score: 95,
          sourceType: "storage",
        },
      ]],
    });

    expect(reviewed).toEqual([]);
  });

  it("keeps row-level recommendations even when legal basis is duplicated across rows", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      results: [
        {
          rowIndex: 0,
          recommendedLegalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
          status: "verified",
          score: 72,
          reason: "부분 적합",
        },
        {
          rowIndex: 1,
          recommendedLegalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
          status: "verified",
          score: 88,
          reason: "더 높은 정합성",
        },
      ],
    });

    const reviewed = await RiskLegalBasisFitService.reviewRows({
      taskName: "설비 점검",
      contextText: "점검 상황",
      rows: [
        {
          workProcess: "설비 점검",
          category: "작업특성 요인",
          cause: "비계 고정 점검 미흡",
          hazardFactor: "추락 위험",
          legalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
        },
        {
          workProcess: "설비 점검",
          category: "작업특성 요인",
          cause: "비계 조립 상태 불량",
          hazardFactor: "비계 전도 위험",
          legalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
        },
      ],
      candidateOptionsByRow: [
        [
          {
            legalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
            articleNumber: "제57조",
            articleTitle: "비계 등의 조립·해체 및 변경",
            score: 90,
            sourceType: "fallback",
          },
          {
            legalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
            articleNumber: "제42조",
            articleTitle: "추락의 방지",
            score: 89,
            sourceType: "fallback",
          },
        ],
        [
          {
            legalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
            articleNumber: "제57조",
            articleTitle: "비계 등의 조립·해체 및 변경",
            score: 94,
            sourceType: "fallback",
          },
        ],
      ],
    });

    expect(reviewed).toHaveLength(2);
    expect(reviewed[0]?.rowIndex).toBe(0);
    expect(reviewed[1]?.rowIndex).toBe(1);
    expect(reviewed.every((item) => item.recommendedLegalBasis.includes("제57조"))).toBe(true);
  });
});
