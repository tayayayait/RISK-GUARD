import { describe, expect, it } from "vitest";
import { HAZARD_REASON_FALLBACK, normalizeGeminiAnalyzeResponse } from "../../supabase/functions/gemini-analyze/normalize";

function buildPayload(reason: unknown) {
  return {
    profile: {
      industry: "construction",
      workLocation: "scaffold zone",
      equipment: ["mobile scaffold"],
      hazards: [
        {
          id: "h1",
          name: "fall risk",
          type: "추락",
          weight: 30,
          confidence: "high",
          reason,
        },
      ],
    },
    profileConfidence: {
      industry: "high",
      workLocation: "medium",
      equipment: "medium",
      hazards: "high",
    },
    scenario: "Worker lost balance during scaffold work.",
    immediateActions: [{ id: "a1", action: "Stop work and secure area", priority: 1 }],
    improvements: [{ id: "i1", action: "Install anti-slip board", category: "facility" }],
    briefingDraft: "Check fall-prevention controls before work.",
  };
}

describe("normalizeGeminiAnalyzeResponse", () => {
  it("normalizes profile.hazards when Gemini returns string-only hazard list", () => {
    const normalized = normalizeGeminiAnalyzeResponse({
      profile: {
        industry: "건설업 및 물류업",
        workLocation: "현장 내 자재 하역장 및 운반 경로",
        equipment: ["지게차", "팔레트", "안전고깔", "라싱벨트"],
        hazards: [
          "지게차 이동 중 작업자와의 충돌 위험",
          "자재 적재 불량으로 인한 낙하 및 쏟아짐",
          "급선회 또는 과속으로 인한 지게차 전도",
          "지면 요철에 의한 팔레트 파손 및 화물 이탈",
        ],
      },
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.profile.hazards).toHaveLength(4);
    expect(normalized?.profile.hazards[0]).toMatchObject({
      id: "hazard-1",
      confidence: "low",
    });
    expect(normalized?.scenario).toMatch(/[가-힣]/);
  });

  it("uses fallback reason when hazards.reason is undefined", () => {
    const normalized = normalizeGeminiAnalyzeResponse(buildPayload(undefined));
    expect(normalized).not.toBeNull();
    expect(normalized?.profile.hazards[0].reason).toBe(HAZARD_REASON_FALLBACK);
  });

  it("uses fallback reason when hazards.reason is blank", () => {
    const normalized = normalizeGeminiAnalyzeResponse(buildPayload("   "));
    expect(normalized).not.toBeNull();
    expect(normalized?.profile.hazards[0].reason).toBe(HAZARD_REASON_FALLBACK);
  });

  it("assigns fallback id when hazard id is missing", () => {
    const payload = buildPayload("reason text");
    const invalid = {
      ...payload,
      profile: {
        ...payload.profile,
        hazards: [{ ...payload.profile.hazards[0], id: "" }],
      },
    };

    const normalized = normalizeGeminiAnalyzeResponse(invalid);
    expect(normalized).not.toBeNull();
    expect(normalized?.profile.hazards[0].id).toBe("hazard-1");
  });

  it("falls back confidence to low when confidence value is unknown", () => {
    const payload = buildPayload("reason text");
    const normalized = normalizeGeminiAnalyzeResponse({
      ...payload,
      profile: {
        ...payload.profile,
        hazards: [{ ...payload.profile.hazards[0], confidence: "unknown-confidence" }],
      },
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.profile.hazards[0].confidence).toBe("low");
  });

  it("uses Korean fallback text for empty industry/workLocation", () => {
    const payload = buildPayload("reason text");
    const normalized = normalizeGeminiAnalyzeResponse({
      ...payload,
      profile: {
        ...payload.profile,
        industry: "",
        workLocation: "",
      },
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.profile.industry).toBe("기타");
    expect(normalized?.profile.workLocation).toBe("작업현장");
  });

  it("normalizes non-Korean hazard name/reason to Korean defaults", () => {
    const payload = buildPayload("Not enough evidence");
    const normalized = normalizeGeminiAnalyzeResponse(payload);

    expect(normalized).not.toBeNull();
    expect(normalized?.profile.hazards[0].name).toBe("추락 위험");
    expect(normalized?.profile.hazards[0].reason).toBe(HAZARD_REASON_FALLBACK);
  });

  it("replaces missing or non-Korean scenario with Korean fallback narrative", () => {
    const normalized = normalizeGeminiAnalyzeResponse(buildPayload("reason text"));

    expect(normalized).not.toBeNull();
    expect(normalized?.scenario).not.toContain("Failed to generate scenario.");
    expect(normalized?.scenario).toMatch(/[가-힣]/);
    expect(normalized?.scenario).toContain("위험");
  });
});
