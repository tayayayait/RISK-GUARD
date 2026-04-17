import { describe, expect, it } from "vitest";
import { postProcessRiskAssessmentHazards } from "../../supabase/functions/form-autofill-analyze/hazard-postprocess";

type HazardConfidence = "high" | "medium" | "low";

function createHazard(seed: Partial<{
  id: string;
  name: string;
  type: string;
  weight: number;
  confidence: HazardConfidence;
  reason: string;
}> = {}) {
  return {
    id: seed.id ?? "h1",
    name: seed.name ?? "Open blade risk",
    type: seed.type ?? "절단",
    weight: seed.weight ?? 24,
    confidence: seed.confidence ?? "low",
    reason: seed.reason ?? "Guard remains open near blade contact zone",
  };
}

describe("form autofill risk hazard postprocess", () => {
  it("expands sparse hazards to 2~3 items for risk assessment mode", () => {
    const hazards = postProcessRiskAssessmentHazards({
      taskName: "Metal cutting operation",
      taskDescription:
        "Worker uses a metal cutter on steel plates while the guard is open, hand stays near blade and fragment spray can hit nearby workers during repetitive shifts.",
      hazards: [createHazard()],
    });

    expect(hazards.length).toBeGreaterThanOrEqual(2);
    expect(hazards.length).toBeLessThanOrEqual(3);
  });

  it("deduplicates overlapping hazard mechanisms", () => {
    const hazards = postProcessRiskAssessmentHazards({
      taskName: "Forklift roller cleaning",
      taskDescription:
        "지게차 후진 주행과 롤러 회전부 청소가 동시에 진행되며 유도자 미배치 상태에서 협착 위험이 반복된다.",
      hazards: [
        createHazard({
          id: "h1",
          type: "차량/이동장비 충돌",
          name: "지게차 근접 충돌 위험",
          reason: "지게차 후진 중 근접 구간에서 작업자와 충돌할 수 있음",
        }),
        createHazard({
          id: "h2",
          type: "차량/이동장비 충돌",
          name: "지게차 근접 충돌 위험",
          reason: "지게차 후진 중 근접 구간에서 작업자와 충돌할 수 있음",
        }),
      ],
    });

    const fingerprints = hazards.map((hazard) => `${hazard.type}|${hazard.name}|${hazard.reason}`);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it("keeps fallback hazard text anchored to context tokens", () => {
    const hazards = postProcessRiskAssessmentHazards({
      taskName: "Metal cutting operation",
      taskDescription:
        "Worker uses a metal cutter on steel plates while the guard is open, hand stays near blade and fragment spray can hit nearby workers during repetitive shifts.",
      hazards: [
        createHazard({
          reason:
            "Worker uses a metal cutter on steel plates while the guard is open, hand stays near blade and fragment spray can hit nearby workers during repetitive shifts.",
        }),
      ],
    });

    const anchorPattern = /(metal|cutter|steel|guard|blade|fragment)/i;
    for (const hazard of hazards) {
      expect(anchorPattern.test(`${hazard.name} ${hazard.reason}`)).toBe(true);
    }
  });
});
