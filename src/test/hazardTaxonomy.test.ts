import { describe, expect, it } from "vitest";
import { normalizeHazardType, normalizeHazardTypeList } from "../../supabase/functions/_shared/hazard-taxonomy.ts";
import { normalizeHazards } from "@/types/assessment";

describe("hazard taxonomy normalization", () => {
  it("동의어를 표준 위험유형으로 변환한다", () => {
    expect(normalizeHazardType("폭발", "폭발 위험")).toBe("폭발/화재");
    expect(normalizeHazardType("화학물질누출", "배관 누출")).toBe("화학노출");
    expect(normalizeHazardType("협착", "롤러 협착")).toBe("끼임/말림");
  });

  it("위험유형 목록을 표준값으로 중복 제거한다", () => {
    expect(normalizeHazardTypeList(["폭발", "화재", "폭발/화재"])).toEqual(["폭발/화재"]);
  });

  it("프로필 hazards 정규화 시 type을 표준값으로 고정한다", () => {
    const normalized = normalizeHazards([
      {
        id: "h1",
        name: "인화성 증기 폭발",
        type: "폭발",
        weight: 10,
        confidence: "high",
        reason: "테스트",
      },
    ]);

    expect(normalized[0].type).toBe("폭발/화재");
    expect(normalized[0].weight).toBe(35);
  });
});
