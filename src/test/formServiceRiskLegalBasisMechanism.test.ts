import { describe, expect, it } from "vitest";
import { resolveRiskRowsLegalBasis } from "@/services/formService";
import * as formService from "@/services/formService";

describe("FormService legal basis mechanism policy", () => {
  it("matches different vehicle articles by row control intent", () => {
    const commonRow = {
      workProcess: "지게차 자재 운반",
      category: "기계적 요인",
      cause: "지게차 운반 중 작업자와 충돌 사고가 발생할 수 있음",
      hazardFactor: "지게차와 작업자 충돌 위험 증가",
    };
    const rows = [
      { ...commonRow, controlIntent: "access_control" as const },
      { ...commonRow, controlIntent: "supervision" as const },
      { ...commonRow, controlIntent: "traffic_operation" as const },
    ];
    const makeLaw = (
      articleNumber: string,
      title: string,
      relevanceScore: number,
      keywords: string[],
    ) => ({
      id: `law-${articleNumber}`,
      type: "law" as const,
      sourceBadge: "법령",
      title: `${articleNumber}(${title})`,
      relevanceScore,
      summaryBullets: [`지게차 운반 중 작업자 충돌 방지를 위한 ${keywords.join(" ")}`],
      keywords: ["지게차", "차량", "충돌", ...keywords],
      sourceType: "storage" as const,
      legalBasis: `산업안전보건기준에 관한 규칙 ${articleNumber}(${title})`,
      articleNumber,
    });

    const legalBases = resolveRiskRowsLegalBasis(rows, {
      workTokens: ["지게차", "자재", "운반"],
      equipmentTokens: ["지게차", "차량"],
      taskHazardTypes: ["차량/이동장비 충돌"],
      lawItems: [
        makeLaw("제179조", "전조등 등의 설치", 99, ["제한속도", "후진 경보"]),
        makeLaw("제172조", "접촉의 방지", 98, ["출입 통제", "동선 분리"]),
        makeLaw("제39조", "신호", 97, ["유도자 배치", "신호수 배치"]),
      ],
      lawActionItems: [],
    });

    expect(legalBases[0]).toContain("제172조");
    expect(legalBases[1]).toContain("제39조");
    expect(legalBases[2]).toContain("제179조");
  });

  it("globally assigns unique alternatives when preferred articles are duplicated", () => {
    expect(formService).toHaveProperty("assignUniqueLegalBasisOptions");
    const assign = (formService as unknown as {
      assignUniqueLegalBasisOptions: (
        options: Array<Array<{ legalBasis: string; articleNumber: string; articleTitle: string; score: number; sourceType: "storage" }>>,
        preferred: string[],
      ) => string[];
    }).assignUniqueLegalBasisOptions;
    const option = (article: string, score: number) => ({
      legalBasis: `산업안전보건기준에 관한 규칙 ${article}(테스트 조문)`,
      articleNumber: article,
      articleTitle: "테스트 조문",
      score,
      sourceType: "storage" as const,
    });
    const duplicated = "산업안전보건기준에 관한 규칙 제172조(테스트 조문)";

    const assigned = assign([
      [option("제172조", 99), option("제179조", 95)],
      [option("제172조", 98), option("제39조", 96)],
      [option("제172조", 97), option("제184조", 94)],
    ], [duplicated, duplicated, duplicated]);

    expect(assigned).toEqual([
      duplicated,
      "산업안전보건기준에 관한 규칙 제39조(테스트 조문)",
      "산업안전보건기준에 관한 규칙 제184조(테스트 조문)",
    ]);
  });

  it("does not reuse the same legal basis even when rows share the same mechanism", () => {
    const rows = [
      {
        workProcess: "설비 점검",
        category: "작업특성 요인",
        cause: "비계 고정 상태 점검 미흡으로 추락 사고가 발생할 수 있음",
        hazardFactor: "비계 고정 불량 상태로 인한 추락 위험 증가",
      },
      {
        workProcess: "설비 점검",
        category: "작업특성 요인",
        cause: "비계 고정 상태 점검 미흡으로 추락 사고가 발생할 수 있음",
        hazardFactor: "비계 고정 불량 상태로 인한 추락 위험 증가",
      },
    ];

    const legalBases = resolveRiskRowsLegalBasis(rows, {
      workTokens: ["설비", "점검", "비계"],
      equipmentTokens: ["비계", "작업발판"],
      lawItems: [
        {
          id: "law-storage-57",
          type: "law",
          sourceBadge: "법령",
          title: "제57조(비계 등의 조립·해체 및 변경)",
          relevanceScore: 96,
          summaryBullets: ["비계 조립·해체 시 준수사항"],
          keywords: ["비계", "추락", "고정"],
          sourceType: "storage",
          legalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
          articleNumber: "제57조",
        },
      ],
      lawActionItems: [],
    });

    expect(legalBases).toHaveLength(2);
    expect(legalBases[0]).toContain("제57조");
    expect(legalBases[1]).not.toContain("제57조");
  });

  it("rejects mismatched storage candidate and does not select it", () => {
    const legalBases = resolveRiskRowsLegalBasis(
      [
        {
          workProcess: "전기 설비 점검",
          category: "전기적 요인",
          cause: "충전부 노출 상태에서 전원 차단 없이 점검해 감전 사고가 발생할 수 있음",
          hazardFactor: "충전부 접촉으로 인한 감전 위험 증가",
        },
      ],
      {
        workTokens: ["전기", "설비", "점검"],
        equipmentTokens: ["충전부", "배전반"],
        lawItems: [
          {
            id: "law-storage-93",
            type: "law",
            sourceBadge: "법령",
            title: "제93조(방호장치의 해체 금지)",
            relevanceScore: 95,
            summaryBullets: ["회전부 방호장치 관련 기준"],
            keywords: ["회전부", "끼임", "말림"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제93조(방호장치의 해체 금지)",
            articleNumber: "제93조",
          },
        ],
        lawActionItems: [],
      },
    );

    expect(legalBases).toHaveLength(1);
    expect(legalBases[0]).toMatch(/^산업안전보건기준에 관한 규칙 제\d+조\(.+\)$/);
    expect(legalBases[0]).not.toContain("제93조");
  });
});
