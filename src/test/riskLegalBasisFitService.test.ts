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

  it("asks Gemini to analyze each row before legal candidate search", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      analyses: [
        {
          rowIndex: 0,
          hazardType: "끼임/말림",
          accidentMechanism: "지게차와 벽체 사이 협착",
          unsafeCondition: "보행자와 지게차 동선 미분리",
          controlIntent: "access_control",
          equipment: ["지게차"],
          searchTerms: ["지게차 접촉 방지", "보행자 동선 분리", "차량계 하역운반기계"],
        },
      ],
    });

    const analyzed = await (RiskLegalBasisFitService as unknown as {
      analyzeRows: (input: unknown) => Promise<unknown[]>;
    }).analyzeRows({
      taskName: "지게차 자재 운반",
      contextText: "지게차 후진 동선에 작업자가 접근하는 상황",
      rows: [
        {
          workProcess: "자재 운반",
          category: "기계적 요인",
          cause: "후진 중 작업자 접근",
          hazardFactor: "지게차와 벽체 사이 협착 위험",
          legalBasis: "",
        },
      ],
    });

    expect(invokeBackend).toHaveBeenCalledWith(expect.objectContaining({
      supabaseFunction: "risk-legal-basis-fit",
      payload: expect.objectContaining({
        mode: "analyze_context",
        rows: [expect.objectContaining({ rowIndex: 0 })],
      }),
    }));
    expect(analyzed).toEqual([
      expect.objectContaining({
        rowIndex: 0,
        hazardType: "끼임/말림",
        controlIntent: "access_control",
        equipment: ["지게차"],
      }),
    ]);
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

  it("lets Gemini select from verified candidates when deterministic first pass is empty", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      results: [
        {
          rowIndex: 0,
          recommendedLegalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
          status: "verified",
          score: 91,
          reason: "지게차와 보행자 접촉 위험에 직접 적용됩니다.",
        },
      ],
    });

    const reviewed = await RiskLegalBasisFitService.reviewRows({
      taskName: "지게차 자재 운반",
      contextText: "지게차 후진 동선에 작업자가 접근함",
      rows: [
        {
          workProcess: "자재 운반",
          category: "기계적 요인",
          cause: "후진 중 작업자 접근",
          hazardFactor: "지게차와 벽체 사이 협착 위험",
          legalBasis: "",
        },
      ],
      candidateOptionsByRow: [[
        {
          legalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
          articleNumber: "제172조",
          articleTitle: "접촉의 방지",
          score: 88,
          sourceType: "api",
        },
      ]],
    });

    expect(invokeBackend).toHaveBeenCalledOnce();
    expect(reviewed[0]?.recommendedLegalBasis).toContain("제172조");
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

  it("sends verified candidate provenance and ranking score to the fallback reviewer", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({ results: [] });

    await RiskLegalBasisFitService.reviewRows({
      taskName: "지게차 자재 운반",
      contextText: "후진 구간 유도자 미배치로 작업자 충돌 위험이 있음",
      rows: [
        {
          workProcess: "자재 운반",
          category: "기계적 요인",
          cause: "지게차 후진 중 작업자 접근 통제 미흡",
          hazardFactor: "이동장비 충돌 위험",
          legalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
        },
      ],
      candidateOptionsByRow: [[
        {
          legalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
          articleNumber: "제172조",
          articleTitle: "접촉의 방지",
          score: 148,
          sourceType: "storage",
          clausePreview: "차량계 하역운반기계와 접촉될 위험이 있는 장소에는 근로자를 출입시켜서는 아니 된다.",
          originalText: "사업주는 차량계 하역운반기계등에 접촉되어 근로자가 위험해질 우려가 있는 장소에는 근로자를 출입시켜서는 아니 된다.",
        },
      ]],
    });

    expect(invokeBackend).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        rows: [expect.objectContaining({
          candidateOptions: [
            {
              legalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
              articleNumber: "제172조",
              rankingScore: 148,
              sourceType: "storage",
              articleTitle: "접촉의 방지",
              clausePreview: "차량계 하역운반기계와 접촉될 위험이 있는 장소에는 근로자를 출입시켜서는 아니 된다.",
              originalText: "사업주는 차량계 하역운반기계등에 접촉되어 근로자가 위험해질 우려가 있는 장소에는 근로자를 출입시켜서는 아니 된다.",
            },
          ],
        })],
      }),
    }));
  });

  it("preserves deterministic fallback source and timeout reason in normalized results", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      results: [
        {
          rowIndex: 0,
          recommendedLegalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
          status: "verified",
          score: 90,
          reason: "검증된 후보입니다.",
          reviewSource: "deterministic_fallback",
          fallbackReason: "timeout",
        },
      ],
    });

    const reviewed = await RiskLegalBasisFitService.reviewRows({
      taskName: "지게차 자재 운반",
      rows: [
        {
          workProcess: "자재 운반",
          category: "기계적 요인",
          cause: "지게차 후진 중 작업자 접근",
          hazardFactor: "이동장비 충돌 위험",
          legalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
        },
      ],
      candidateOptionsByRow: [[
        {
          legalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
          articleNumber: "제172조",
          articleTitle: "접촉의 방지",
          score: 148,
          sourceType: "storage",
        },
      ]],
    });

    expect(reviewed[0]).toEqual(expect.objectContaining({
      reviewSource: "deterministic_fallback",
      fallbackReason: "timeout",
    }));
  });
});
