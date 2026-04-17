import { describe, expect, it } from "vitest";
import { postProcessRiskAssessmentHazards } from "../../supabase/functions/form-autofill-analyze/hazard-postprocess";

describe("form autofill hazard scope alignment", () => {
  it("removes unrelated hazards that do not match task context", () => {
    const hazards = postProcessRiskAssessmentHazards({
      taskName: "분전반 배선 점검 및 차단기 교체",
      taskDescription:
        "분전반 내부 노후 배선을 점검하고 절연이 손상된 전선을 교체하며 차단기를 교체하는 작업",
      hazards: [
        {
          id: "H1",
          name: "충전부 노출 상태로 인한 감전 위험 증가",
          type: "감전",
          weight: 32,
          confidence: "high",
          reason: "전원 차단 미확인 상태에서 충전부가 노출되어 감전 사고가 발생할 수 있음",
        },
        {
          id: "H2",
          name: "비계 고정 불량 상태로 인한 추락 위험 증가",
          type: "추락",
          weight: 31,
          confidence: "high",
          reason: "비계와 작업발판 고정 점검이 미흡해 추락 사고가 발생할 수 있음",
        },
      ],
    });

    expect(hazards.length).toBeGreaterThanOrEqual(2);
    expect(hazards.length).toBeLessThanOrEqual(3);
    expect(hazards.some((hazard) => hazard.type === "추락")).toBe(false);
    expect(
      hazards.every((hazard) =>
        /(감전|충전부|전원|분전반|배전반|배선|전선|절연|차단기)/.test(`${hazard.name} ${hazard.reason}`),
      ),
    ).toBe(true);
  });

  it("does not bias fallback hazard type to fall for electrical panel wiring tasks", () => {
    const hazards = postProcessRiskAssessmentHazards({
      taskName: "분전반 배선 점검 및 차단기 교체",
      taskDescription:
        "분전반 내부 배선 점검과 차단기 단자 교체 작업을 수행하며 절연 상태를 확인하는 작업",
      hazards: [],
    });

    expect(hazards.length).toBeGreaterThanOrEqual(2);
    expect(hazards.length).toBeLessThanOrEqual(3);
    expect(hazards.some((hazard) => hazard.type === "추락")).toBe(false);
    expect(hazards.some((hazard) => hazard.type === "감전")).toBe(true);
  });
});
