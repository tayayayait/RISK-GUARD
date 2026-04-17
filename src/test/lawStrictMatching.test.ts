import { describe, expect, it } from "vitest";
import {
  createLawStrictAxisEvaluator,
  evaluateLawStrictAxes,
  type MatchCandidate,
  type MatchContext,
} from "../../supabase/functions/_shared/matching.ts";

const baseContext: MatchContext = {
  taskName: "이동식 비계 점검 작업",
  profile: {
    industry: "제조업",
    workLocation: "조립 라인",
    equipment: ["이동식 비계", "충전부"],
    hazards: [
      { name: "추락", type: "추락", weight: 35 },
      { name: "감전", type: "감전", weight: 25 },
    ],
  },
};

describe("strict law axis matching", () => {
  it("passes when accident type, hazard factor, and work/equipment axes all match", () => {
    const candidate: MatchCandidate = {
      id: "law-1",
      title: "비계 작업 추락 방지 조치",
      content: "이동식 비계 작업 전 안전난간 설치 및 점검",
      keywords: ["추락", "비계", "점검"],
      hazardTypes: ["추락"],
      legalBasis: "산업안전보건기준에 관한 규칙 제13조",
    };

    const result = evaluateLawStrictAxes(baseContext, candidate);

    expect(result.accidentTypeMatched).toBe(true);
    expect(result.hazardFactorMatched).toBe(true);
    expect(result.workOrEquipmentMatched).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("fails when work/equipment axis is missing", () => {
    const candidate: MatchCandidate = {
      id: "law-2",
      title: "추락 위험 관리",
      content: "추락 위험이 있는 경우 안전조치를 해야 한다",
      keywords: ["추락", "위험"],
      hazardTypes: ["추락"],
      legalBasis: "산업안전보건기준에 관한 규칙 제10조",
    };

    const result = evaluateLawStrictAxes(baseContext, candidate);

    expect(result.accidentTypeMatched).toBe(true);
    expect(result.hazardFactorMatched).toBe(true);
    expect(result.workOrEquipmentMatched).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("fails when accident type does not match", () => {
    const candidate: MatchCandidate = {
      id: "law-3",
      title: "지게차 충돌 방지",
      content: "지게차 이동 동선 분리와 신호수 배치",
      keywords: ["차량", "충돌", "지게차"],
      hazardTypes: ["차량/이동장비 충돌"],
      legalBasis: "산업안전보건기준에 관한 규칙 제172조",
    };

    const evaluator = createLawStrictAxisEvaluator(baseContext);
    const result = evaluator(candidate);

    expect(result.accidentTypeMatched).toBe(false);
    expect(result.passed).toBe(false);
  });
});
