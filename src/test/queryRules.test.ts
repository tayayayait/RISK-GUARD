import { describe, expect, it } from "vitest";
import { buildKoshaQueries, deduplicateByTitleDateOrUrl, sortByRelevanceAndLatest } from "@/lib/queryRules";
import type { WorkProfile } from "@/types/assessment";

const profile: WorkProfile = {
  industry: "건설업",
  workLocation: "건축물 외벽",
  equipment: ["고소작업대", "절단기"],
  hazards: [
    { id: "h1", name: "추락", type: "추락", weight: 30, confidence: "high", reason: "고소작업대 사용" },
    { id: "h2", name: "화학노출", type: "화학노출", weight: 25, confidence: "medium", reason: "도료 사용" },
  ],
};

describe("queryRules", () => {
  it("XML 규칙 개수에 맞게 질의를 생성한다", () => {
    const result = buildKoshaQueries("외벽 도장 작업", profile);
    expect(result.domesticCase.length).toBeLessThanOrEqual(4);
    expect(result.fatalityCase.length).toBeLessThanOrEqual(2);
    expect(result.lawGuide.length).toBeLessThanOrEqual(3);
    expect(result.materials.industry).toBe("건설업");
  });

  it("제목+날짜 또는 제목+URL 기준 중복을 제거한다", () => {
    const deduped = deduplicateByTitleDateOrUrl([
      { title: "A", date: "2026-01-01" },
      { title: "A", date: "2026-01-01" },
      { title: "A", url: "https://x.y" },
      { title: "A", url: "https://x.y" },
      { title: "B", date: "2026-01-01" },
    ]);
    expect(deduped).toHaveLength(3);
  });

  it("관련도 우선, 동률이면 최신순으로 정렬한다", () => {
    const sorted = sortByRelevanceAndLatest([
      { relevance: 80, date: "2026-01-01", id: "old" },
      { relevance: 90, date: "2025-01-01", id: "high" },
      { relevance: 80, date: "2026-03-01", id: "new" },
    ]);
    expect(sorted[0].id).toBe("high");
    expect(sorted[1].id).toBe("new");
  });
});
