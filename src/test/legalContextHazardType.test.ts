import { describe, expect, it } from "vitest";
import * as hazardTaxonomy from "../../supabase/functions/_shared/hazard-taxonomy.ts";

describe("legal context hazard type resolution", () => {
  it("keeps strong source-row vehicle signals over an AI conflicting type", () => {
    expect(hazardTaxonomy).toHaveProperty("resolveLegalContextHazardType");
    const resolveType = (hazardTaxonomy as unknown as {
      resolveLegalContextHazardType: (sourceText: string, aiHazardType: string, aiContext?: string) => string;
    }).resolveLegalContextHazardType;

    expect(resolveType(
      "지게차 운반 중 후진 구간에 유도자를 배치하지 않아 작업자 충돌 위험이 있음",
      "낙하물/비래",
      "작업 구역 접근 중 타격 위험",
    )).toBe("차량/이동장비 충돌");
  });
});
