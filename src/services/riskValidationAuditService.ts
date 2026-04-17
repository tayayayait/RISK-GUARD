import { invokeBackend } from "@/services/edgeFunctionClient";
import type { RiskRowValidationEvent } from "@/types/formTemplate";

interface RiskValidationAuditResponse {
  inserted?: number;
}

export const RiskValidationAuditService = {
  async writeEvents(
    events: RiskRowValidationEvent[],
    metadata: Record<string, unknown> = {},
  ) {
    if (!Array.isArray(events) || events.length === 0) {
      return { inserted: 0 };
    }

    const response = await invokeBackend<RiskValidationAuditResponse>({
      supabaseFunction: "risk-validation-audit",
      legacyPath: "/risk-validation-audit",
      payload: {
        events,
        source: "form-editor",
        metadata,
      },
      timeoutMs: 30000,
    });

    return {
      inserted: typeof response?.inserted === "number" ? response.inserted : 0,
    };
  },
};
