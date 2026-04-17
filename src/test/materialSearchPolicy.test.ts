import { describe, expect, it } from "vitest";
import {
  applyKeywordPostFilter,
  dedupeMaterialsByUrlTitle,
  HAZARD_CODE_OPTIONS,
  INDUSTRY_CODE_OPTIONS,
  MATERIAL_TYPE_CODE_OPTIONS,
  resolveHazardCode,
  resolveMaterialQueryPlan,
  resolveTopHazardCodes,
  sortMaterialsByPriority,
} from "../../supabase/functions/_shared/material-search.ts";

describe("material search policy", () => {
  it("keeps full code coverage from code table", () => {
    expect(MATERIAL_TYPE_CODE_OPTIONS).toHaveLength(17);
    expect(INDUSTRY_CODE_OPTIONS).toHaveLength(5);
    expect(HAZARD_CODE_OPTIONS).toHaveLength(26);
  });

  it("maps 넘어짐 label to code 11000002", () => {
    const label = HAZARD_CODE_OPTIONS.find((option) => option.code === "11000002")?.label ?? "";
    expect(resolveHazardCode(`작업 중 ${label} 위험`)).toBe("11000002");
  });

  it("selects top 3 hazard codes by weight and deduplicates", () => {
    const fallLabel = HAZARD_CODE_OPTIONS.find((option) => option.code === "11000001")?.label ?? "";
    const electricLabel = HAZARD_CODE_OPTIONS.find((option) => option.code === "11000009")?.label ?? "";
    const tripLabel = HAZARD_CODE_OPTIONS.find((option) => option.code === "11000002")?.label ?? "";

    const codes = resolveTopHazardCodes([
      { name: `${fallLabel} 위험`, weight: 35 },
      { name: `${electricLabel} 위험`, weight: 30 },
      { name: `${tripLabel} 위험`, weight: 28 },
      { name: `${fallLabel} 재발 위험`, weight: 25 },
    ]);

    expect(codes).toEqual(["11000001", "11000009", "11000002"]);
  });

  it("uses selected scopes and applies max 3 hazard overrides", () => {
    const plan = resolveMaterialQueryPlan(
      {
        industry: "건설",
        hazards: [{ name: "추락", weight: 30 }],
      },
      {
        materialTypeCode: "12",
        industryScope: "selected",
        industryCodeOverride: "4",
        hazardScope: "selected",
        hazardCodesOverride: ["11000011", "11000009", "11000001", "11000002"],
      },
    );

    expect(plan.materialTypeCode).toBe("12");
    expect(plan.industryCodes).toEqual(["4"]);
    expect(plan.hazardCodes).toEqual(["11000011", "11000009", "11000001"]);
    expect(plan.industryScope).toBe("selected");
    expect(plan.hazardScope).toBe("selected");
  });

  it("returns all codes when all scopes are requested", () => {
    const plan = resolveMaterialQueryPlan(
      {
        industry: "건설",
        hazards: [{ name: "추락", weight: 30 }],
      },
      {
        industryScope: "all",
        hazardScope: "all",
      },
    );

    expect(plan.industryCodes).toHaveLength(5);
    expect(plan.hazardCodes).toHaveLength(26);
  });

  it("keeps backward compatibility for industry override without scope", () => {
    const plan = resolveMaterialQueryPlan(
      {
        industry: "건설",
        hazards: [{ name: "추락", weight: 30 }],
      },
      {
        industryCodeOverride: "4",
      },
    );

    expect(plan.industryCodes).toEqual(["4"]);
  });

  it("deduplicates materials by url+title and keeps higher relevance", () => {
    const deduped = dedupeMaterialsByUrlTitle([
      {
        id: "a",
        type: "OPS",
        title: "추락 예방 OPS",
        url: "https://example.com/ops",
        language: "한국어",
        relevance: 72,
        recommendReason: "A",
        selected: false,
        excluded: false,
      },
      {
        id: "b",
        type: "OPS",
        title: "추락 예방 OPS",
        url: "https://example.com/ops",
        language: "한국어",
        relevance: 90,
        recommendReason: "B",
        selected: false,
        excluded: false,
      },
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.id).toBe("b");
    expect(deduped[0]?.relevance).toBe(90);
  });

  it("filters by keyword and adds keyword bonus", () => {
    const filtered = applyKeywordPostFilter(
      [
        {
          id: "m1",
          type: "OPS",
          title: "추락 예방 OPS",
          url: "https://example.com/1",
          language: "한국어",
          relevance: 70,
          recommendReason: "건설 추락 기준 추천",
          selected: false,
          excluded: false,
        },
        {
          id: "m2",
          type: "OPS",
          title: "화학물질 취급 안내",
          url: "https://example.com/2",
          language: "한국어",
          relevance: 80,
          recommendReason: "화학 기준 추천",
          selected: false,
          excluded: false,
        },
      ],
      "추락",
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("m1");
    expect(filtered[0]?.relevance).toBeGreaterThan(70);
  });

  it("sorts by briefing priority mode", () => {
    const sorted = sortMaterialsByPriority(
      [
        {
          id: "book",
          type: "책자",
          title: "책자",
          url: "https://example.com/book",
          language: "한국어",
          relevance: 100,
          recommendReason: "",
          selected: false,
          excluded: false,
        },
        {
          id: "ops",
          type: "OPS",
          title: "ops",
          url: "https://example.com/ops",
          language: "한국어",
          relevance: 80,
          recommendReason: "",
          selected: false,
          excluded: false,
        },
        {
          id: "video",
          type: "동영상",
          title: "video",
          url: "https://example.com/video",
          language: "한국어",
          relevance: 60,
          recommendReason: "",
          selected: false,
          excluded: false,
        },
      ],
      "작업전 브리핑",
    );

    expect(sorted.map((item) => item.id)).toEqual(["video", "ops", "book"]);
  });
});
