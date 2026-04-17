import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeBackend } from "@/services/edgeFunctionClient";
import { RiskValidationAuditService } from "@/services/riskValidationAuditService";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

describe("RiskValidationAuditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns inserted=0 and skips backend call when events are empty", async () => {
    const result = await RiskValidationAuditService.writeEvents([]);

    expect(result.inserted).toBe(0);
    expect(invokeBackend).not.toHaveBeenCalled();
  });

  it("sends audit events as best-effort payload and returns inserted count", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({ inserted: 2 });

    const result = await RiskValidationAuditService.writeEvents([
      {
        timestamp: "2026-04-17T00:00:00.000Z",
        siteName: "A현장",
        formType: "risk-assessment",
        rowIndex: 0,
        expectedHazardType: "감전",
        detectedHazardType: "추락",
        field: "currentMeasure",
        reasonCode: "current_measure_mismatch",
        rewritten: true,
        finalStatus: "review_required",
      },
      {
        timestamp: "2026-04-17T00:00:00.000Z",
        siteName: "A현장",
        formType: "risk-assessment",
        rowIndex: 1,
        expectedHazardType: "감전",
        detectedHazardType: "감전",
        field: "reductionMeasure",
        reasonCode: "reduction_measure_mismatch",
        rewritten: true,
        finalStatus: "ok",
      },
    ], {
      trigger: "analyze_and_fill",
    });

    expect(result.inserted).toBe(2);
    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "risk-validation-audit",
        payload: expect.objectContaining({
          source: "form-editor",
          metadata: { trigger: "analyze_and_fill" },
        }),
      }),
    );
  });
});

