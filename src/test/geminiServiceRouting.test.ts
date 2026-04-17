import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeBackend } from "@/services/edgeFunctionClient";
import { GeminiService } from "@/services/geminiService";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

const mockResult = {
  profile: {
    industry: "건설업",
    workLocation: "외벽 작업구간",
    equipment: ["고소작업대"],
    hazards: [
      {
        id: "h1",
        name: "추락",
        type: "추락",
        weight: 30,
        confidence: "high",
        reason: "고소 작업으로 인한 추락 위험",
      },
    ],
  },
  profileConfidence: {
    industry: "high",
    workLocation: "high",
    equipment: "high",
    hazards: "high",
  },
  scenario: "작업 중 발판 불안정으로 추락 위험이 증가한다.",
  immediateActions: [{ id: "a1", action: "안전대 결속 상태를 즉시 점검", priority: 1 }],
  improvements: [{ id: "i1", action: "안전난간 보강", category: "시설" }],
  briefingDraft: "작업 전 추락 방지조치 확인.",
};

describe("GeminiService backend routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invokeBackend).mockResolvedValue(mockResult);
  });

  it("uses gemini-analyze for default assessment flow", async () => {
    await GeminiService.analyzeTask({
      taskName: "외벽 도장",
      taskDescription: "고소작업대를 사용한 외벽 도장 작업",
    });

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "gemini-analyze",
        legacyPath: "/gemini/analyze",
        timeoutMs: 60000,
      }),
    );
  });

  it("uses form-autofill-analyze for form center flow", async () => {
    await GeminiService.analyzeTask({
      taskName: "위험성평가표 작성",
      taskDescription: "서식센터 자동작성 입력 기반 위험성평가표 작성",
      formType: "risk-assessment",
      formTemplateHint: "위험성평가표 작성 기준",
    });

    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "form-autofill-analyze",
        legacyPath: "/form-autofill/analyze",
        timeoutMs: 60000,
      }),
    );
  });

  it("stops retrying when form-autofill invocation times out", async () => {
    vi.mocked(invokeBackend).mockRejectedValue(new Error("Timeout: form-autofill-analyze"));

    await expect(
      GeminiService.analyzeTask({
        taskName: "위험성평가표 작성",
        taskDescription: "기계 정비 작업 위험성평가 작성",
        formType: "risk-assessment",
      }),
    ).rejects.toThrow("Timeout: form-autofill-analyze");

    expect(invokeBackend).toHaveBeenCalledTimes(1);
  });

  it("stops retrying when form-autofill returns upstream timeout", async () => {
    vi.mocked(invokeBackend).mockRejectedValue(
      new Error("Supabase function failed (form-autofill-analyze): 504 UPSTREAM_TIMEOUT"),
    );

    await expect(
      GeminiService.analyzeTask({
        taskName: "위험성평가표 작성",
        taskDescription: "기계 정비 작업 위험성평가 작성",
        formType: "risk-assessment",
      }),
    ).rejects.toThrow("UPSTREAM_TIMEOUT");

    expect(invokeBackend).toHaveBeenCalledTimes(1);
  });
});
