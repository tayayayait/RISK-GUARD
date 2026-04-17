import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeBackend } from "@/services/edgeFunctionClient";
import { ActionPlanService } from "@/services/actionPlanService";
import type { WorkProfile } from "@/types/assessment";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

const profile: WorkProfile = {
  industry: "화학업",
  workLocation: "저장탱크 외벽",
  equipment: ["용접기"],
  hazards: [
    {
      id: "h1",
      name: "가스폭발",
      type: "폭발/화재",
      weight: 40,
      confidence: "high",
      reason: "인화성 증기 잔류 가능",
    },
  ],
};

describe("ActionPlanService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("actionItems가 있으면 success를 반환한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      actionItems: [
        {
          id: "law-action-1",
          stage: "immediate",
          actionText: "작업 전 가스농도를 측정하라",
          articleNumbers: ["제295조"],
        },
      ],
      stageCounts: {
        immediate: 1,
        same_day: 0,
        pre_resume: 0,
        improvement: 0,
      },
    });

    const result = await ActionPlanService.generateLawActions("저장탱크 외벽 용접", profile);

    expect(result.status).toBe("success");
    expect(result.items).toHaveLength(1);
    expect(result.stageCounts?.immediate).toBe(1);
    expect(invokeBackend).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseFunction: "analysis-action-plan",
        timeoutMs: 120000,
      }),
    );
  });

  it("actionItems가 없으면 empty를 반환한다", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      actionItems: [],
    });

    const result = await ActionPlanService.generateLawActions("저장탱크 외벽 용접", profile);
    expect(result.status).toBe("empty");
    expect(result.items).toHaveLength(0);
  });
});
