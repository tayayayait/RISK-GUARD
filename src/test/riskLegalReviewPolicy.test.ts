import { describe, expect, it } from "vitest";
import { selectDeterministicLegalReview } from "../../supabase/functions/_shared/risk-legal-review-policy.ts";

const vehicleCollisionRow = {
  rowIndex: 0,
  workProcess: "자재 운반",
  category: "기계적 요인",
  cause: "지게차 후진 중 유도자 미배치로 작업자와 충돌할 수 있음",
  hazardFactor: "이동장비 충돌 위험",
  selectedLegalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
  candidateLegalBases: ["산업안전보건기준에 관한 규칙 제172조(접촉의 방지)"],
};

describe("deterministic legal review policy", () => {
  it("verifies a selected high-ranking storage candidate mapped to the row hazard", () => {
    const result = selectDeterministicLegalReview({
      ...vehicleCollisionRow,
      candidateOptions: [
        {
          legalBasis: vehicleCollisionRow.selectedLegalBasis,
          articleNumber: "제172조",
          rankingScore: 148,
          sourceType: "storage",
          originalText: "사업주는 차량계 하역운반기계등에 접촉되어 근로자가 위험해질 우려가 있는 장소에는 근로자를 출입시켜서는 아니 된다.",
        },
      ],
    });

    expect(result).toEqual(expect.objectContaining({
      recommendedLegalBasis: vehicleCollisionRow.selectedLegalBasis,
      status: "verified",
      reviewSource: "deterministic_fallback",
    }));
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("does not verify an unvalidated static fallback candidate", () => {
    const result = selectDeterministicLegalReview({
      ...vehicleCollisionRow,
      candidateOptions: [
        {
          legalBasis: vehicleCollisionRow.selectedLegalBasis,
          articleNumber: "제172조",
          rankingScore: 148,
          sourceType: "fallback",
        },
      ],
    });

    expect(result.status).toBe("review_required");
  });

  it("does not verify a trusted candidate when the original article text is missing", () => {
    const result = selectDeterministicLegalReview({
      ...vehicleCollisionRow,
      candidateOptions: [
        {
          legalBasis: vehicleCollisionRow.selectedLegalBasis,
          articleNumber: "제172조",
          rankingScore: 148,
          sourceType: "storage",
        },
      ],
    });

    expect(result.status).toBe("review_required");
  });

  it("does not verify a trusted candidate below the strict client ranking threshold", () => {
    const result = selectDeterministicLegalReview({
      ...vehicleCollisionRow,
      candidateOptions: [
        {
          legalBasis: vehicleCollisionRow.selectedLegalBasis,
          articleNumber: "제172조",
          rankingScore: 93,
          sourceType: "db",
        },
      ],
    });

    expect(result.status).toBe("review_required");
  });
});
