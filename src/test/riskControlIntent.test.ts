import { describe, expect, it } from "vitest";
import { resolveRiskControlIntent } from "@/lib/riskControlIntent";
import * as riskControlIntent from "@/lib/riskControlIntent";

describe("risk control intent taxonomy", () => {
  it("separates vehicle access, supervision, and traffic controls", () => {
    expect(resolveRiskControlIntent("보행자 동선과 차량 통로를 분리한다", "차량/이동장비 충돌"))
      .toBe("access_control");
    expect(resolveRiskControlIntent("후진 구간에 유도자를 배치한다", "차량/이동장비 충돌"))
      .toBe("supervision");
    expect(resolveRiskControlIntent("후진 경보와 속도 제한을 적용한다", "차량/이동장비 충돌"))
      .toBe("traffic_operation");
  });

  it("keeps structural support separate from condition inspection", () => {
    expect(resolveRiskControlIntent("동바리 하중 집중 구간을 보강한다", "붕괴"))
      .toBe("structural_support");
    expect(resolveRiskControlIntent("체결 상태와 변형 징후를 점검한다", "붕괴"))
      .toBe("inspection_maintenance");
  });

  it("provides Korean legal-search terms for each control intent", () => {
    expect(riskControlIntent).toHaveProperty("getRiskControlIntentSearchTerms");
    const getSearchTerms = (riskControlIntent as unknown as {
      getRiskControlIntentSearchTerms: (intent: string) => string[];
    }).getRiskControlIntentSearchTerms;

    expect(getSearchTerms("access_control")).toEqual(expect.arrayContaining(["출입 통제", "동선 분리"]));
    expect(getSearchTerms("supervision")).toEqual(expect.arrayContaining(["유도자 배치", "신호수 배치"]));
    expect(getSearchTerms("traffic_operation")).toEqual(expect.arrayContaining(["제한속도", "후진 경보"]));
  });
});
