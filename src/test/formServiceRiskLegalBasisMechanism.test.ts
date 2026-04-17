import { describe, expect, it } from "vitest";
import { resolveRiskRowsLegalBasis } from "@/services/formService";

describe("FormService legal basis mechanism policy", () => {
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
