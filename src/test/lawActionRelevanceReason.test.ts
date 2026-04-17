import { describe, expect, it } from "vitest";
import { buildLawActionItems, type LawActionSeed } from "../../supabase/functions/_shared/law-actions.ts";

describe("law action relevance reason", () => {
  it("keeps explicit relevance reason from direct seed", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "안전난간을 설치하세요.",
        articleNumber: "제3조",
        clausePreview: "사업주는 추락 위험 구간에 안전난간을 설치해야 한다.",
        relevanceReason: "위험요인 40점, 장비/작업어 18점",
        source: "remedial",
        score: 94,
      },
    ];

    const built = buildLawActionItems(seeds, 5, 0.8);
    const direct = built.find((item) => item.generationType !== "derived");

    expect(direct).toBeTruthy();
    expect(direct?.relevanceReason).toContain("40점");
  });

  it("falls back to clause preview when explicit relevance reason is missing", () => {
    const seeds: LawActionSeed[] = [
      {
        rawText: "환기설비를 설치하세요.",
        articleNumber: "제5조",
        clausePreview: "가연성 분위기 작업 구간에는 환기설비를 설치해야 한다.",
        source: "remedial",
        score: 86,
      },
    ];

    const built = buildLawActionItems(seeds, 5, 0.8);
    const direct = built.find((item) => item.generationType !== "derived");

    expect(direct).toBeTruthy();
    expect(direct?.relevanceReason).toContain("환기설비");
  });
});

