import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssessmentProvider, useAssessment } from "@/contexts/AssessmentContext";
import { KoshaService } from "@/services/koshaService";
import { AssessmentLawService } from "@/services/assessmentLawService";

vi.mock("@/services/geminiService", () => ({
  GeminiService: {
    analyzeTask: vi.fn(async () => ({
      profile: {
        industry: "건설업",
        workLocation: "외벽",
        equipment: ["고소작업대"],
        hazards: [
          { id: "h1", name: "추락", type: "추락", weight: 35, confidence: "high", reason: "추락 위험" },
        ],
      },
      profileConfidence: {
        industry: "high",
        workLocation: "high",
        equipment: "high",
        hazards: "high",
      },
      scenario: "고소작업 중 추락 위험",
      immediateActions: [{ id: "a1", action: "안전대 확인", priority: 1 }],
      improvements: [{ id: "i1", action: "안전난간 보강", category: "시설" }],
      briefingDraft: "안전대 상태를 점검하십시오.",
    })),
  },
}));

vi.mock("@/services/koshaService", () => ({
  KoshaService: {
    searchDisasterCases: vi.fn(async () => ({ status: "empty", items: [] })),
    queryFatalities: vi.fn(async () => ({ status: "empty", items: [] })),
    recommendMaterials: vi.fn(async () => ({
      status: "success",
      items: [
        {
          id: "material-initial",
          type: "OPS",
          title: "추락 예방 OPS",
          url: "https://example.com/ops",
          language: "한국어",
          relevance: 80,
          recommendReason: "추락 기준 추천",
          selected: false,
          excluded: false,
        },
      ],
    })),
  },
}));

vi.mock("@/services/assessmentLawService", () => ({
  AssessmentLawService: {
    searchLaws: vi.fn(async () => ({ status: "empty", items: [] })),
  },
}));

vi.mock("@/services/actionPlanService", () => ({
  ActionPlanService: {
    generateLawActions: vi.fn(async () => ({
      status: "empty",
      items: [],
      stageCounts: {
        immediate: 0,
        same_day: 0,
        pre_resume: 0,
        improvement: 0,
      },
    })),
  },
}));

let latestContext: ReturnType<typeof useAssessment> | null = null;

function ContextProbe() {
  const context = useAssessment();
  useEffect(() => {
    latestContext = context;
  }, [context]);
  return null;
}

describe("materials reload flow", () => {
  it("preserves selected state across server requery using title/url key", async () => {
    latestContext = null;
    render(
      <AssessmentProvider>
        <ContextProbe />
      </AssessmentProvider>,
    );

    await waitFor(() => {
      expect(latestContext).not.toBeNull();
    });

    await act(async () => {
      await latestContext!.startAnalysis({
        taskName: "외벽 작업",
        taskDescription: "고소작업대를 사용한 외벽 작업",
        siteName: "테스트",
      });
    });

    await act(async () => {
      await latestContext!.confirmProfile(latestContext!.assessment!.profile);
    });

    await act(async () => {
      await latestContext!.loadEvidence(true);
    });

    act(() => {
      latestContext!.selectMaterial("material-initial", "briefing");
    });

    vi.mocked(KoshaService.recommendMaterials).mockResolvedValueOnce({
      status: "success",
      items: [
        {
          id: "material-refetched-with-different-id",
          type: "OPS",
          title: "추락 예방 OPS",
          url: "https://example.com/ops",
          language: "한국어",
          relevance: 92,
          recommendReason: "추락 기준 추천",
          selected: false,
          excluded: false,
        },
      ],
    });

    await act(async () => {
      await latestContext!.reloadMaterials({
        keyword: "추락",
        materialTypeCode: "12",
        hazardCodesOverride: ["11000001"],
        priorityMode: "즉시교육",
      });
    });

    expect(vi.mocked(KoshaService.recommendMaterials)).toHaveBeenLastCalledWith(
      latestContext!.assessment!.taskName,
      latestContext!.assessment!.profile,
      {
        keyword: "추락",
        materialTypeCode: "12",
        hazardCodesOverride: ["11000001"],
        priorityMode: "즉시교육",
      },
    );

    const material = latestContext!.assessment!.materials[0];
    expect(material?.id).toBe("material-refetched-with-different-id");
    expect(material?.selected).toBe(true);
    expect(latestContext!.assessment!.selectedMaterials).toEqual(["material-refetched-with-different-id"]);
    expect(vi.mocked(AssessmentLawService.searchLaws)).toHaveBeenCalled();
  });
});

