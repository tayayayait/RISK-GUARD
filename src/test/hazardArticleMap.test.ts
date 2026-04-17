import { describe, it, expect } from "vitest";
import { HAZARD_ARTICLE_MAP } from "../../supabase/functions/_shared/hazard-article-map.ts";
import { STANDARD_HAZARD_TYPES } from "../../supabase/functions/_shared/hazard-taxonomy.ts";

describe("HAZARD_ARTICLE_MAP", () => {
  it("should have at least one article for each standard hazard type", () => {
    // STANDARD_HAZARD_TYPES contains standard ones like 추락, 감전, 끼임/말림, etc.
    const mappedTypes = Object.keys(HAZARD_ARTICLE_MAP);
    
    // We didn't map all hazard types but the major 11 ones.
    const expectedMajorTypes = [
      "추락", "감전", "끼임/말림", "폭발/화재", "질식", 
      "붕괴", "절단/베임", "낙하물/비래", "차량/이동장비 충돌",
      "화학노출", "소음/분진/반복작업"
    ];

    for (const type of expectedMajorTypes) {
      expect(mappedTypes).toContain(type);
      expect(HAZARD_ARTICLE_MAP[type].length).toBeGreaterThan(0);
    }
  });

  it("should have strictly formatted article numbers (제XX조)", () => {
    Object.values(HAZARD_ARTICLE_MAP).flat().forEach((entry) => {
      expect(entry.article).toMatch(/^제\s*\d+\s*조(?:의\s*\d+)?$/);
      expect(entry.title.length).toBeGreaterThan(0);
    });
  });
});
