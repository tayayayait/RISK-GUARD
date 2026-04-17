import { describe, expect, it } from "vitest";
import { calculateRiskScore, HIGH_RISK_EQUIPMENT, normalizeHazardWeight, type HazardItem } from "@/types/assessment";

function hazard(name: string, weight: number): HazardItem {
  return {
    id: `h-${name}`,
    name,
    type: name,
    weight,
    confidence: "high",
    reason: "테스트 근거",
  };
}

describe("calculateRiskScore", () => {
  it("가중치 합으로 기본 점수를 계산한다", () => {
    const result = calculateRiskScore([hazard("추락", 30), hazard("화학노출", 25), hazard("낙하물/비래", 20)], [], 0);
    expect(result.score).toBe(75);
    expect(result.level).toBe("high");
  });

  it("고위험 장비 보정치를 적용한다", () => {
    const result = calculateRiskScore([hazard("추락", 30)], [HIGH_RISK_EQUIPMENT[0]], 0);
    expect(result.score).toBe(45);
    expect(result.level).toBe("medium");
  });

  it("사망사고 유사도 보정치를 적용한다", () => {
    const highSimilarity = calculateRiskScore([hazard("추락", 30)], [], 0.9);
    expect(highSimilarity.score).toBe(50);

    const mediumSimilarity = calculateRiskScore([hazard("추락", 30)], [], 0.65);
    expect(mediumSimilarity.score).toBe(40);
  });

  it("표준 위험유형은 기준 가중치로 정규화한다", () => {
    expect(normalizeHazardWeight("추락", 7)).toBe(30);
    expect(normalizeHazardWeight("폭발/화재", 5)).toBe(35);
    expect(normalizeHazardWeight("폭발", 77)).toBe(35);
  });

  it("표준 위험유형으로 매핑되지 않으면 1~40 범위로 보정한다", () => {
    expect(normalizeHazardWeight("알수없음", -4)).toBe(1);
    expect(normalizeHazardWeight("기타", 23.7)).toBe(24);
  });
});
