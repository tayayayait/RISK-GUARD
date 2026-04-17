import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentProvider, useAssessment } from "@/contexts/AssessmentContext";
import { KoshaService } from "@/services/koshaService";
import { AssessmentLawService } from "@/services/assessmentLawService";
import { ActionPlanService } from "@/services/actionPlanService";
import type { EvidenceFetchResult, MaterialFetchResult } from "@/types/assessment";

vi.mock("@/services/geminiService", () => ({
  GeminiService: {
    analyzeTask: vi.fn(async () => ({
      profile: {
        industry: "건설업",
        workLocation: "저장탱크 외벽",
        equipment: ["용접기"],
        hazards: [
          { id: "h1", name: "폭발", type: "폭발", weight: 35, confidence: "high", reason: "인화성 증기와 점화원이 접촉할 수 있습니다." },
          { id: "h2", name: "화학물질누출", type: "화학물질누출", weight: 25, confidence: "medium", reason: "배관 연결부 누출 가능성이 있습니다." },
        ],
      },
      profileConfidence: {
        industry: "high",
        workLocation: "high",
        equipment: "high",
        hazards: "medium",
      },
      scenario: "인화성 증기와 점화원이 만나 폭발할 수 있습니다.",
      immediateActions: [{ id: "a1", action: "작업중지 후 가스농도 재측정", priority: 1 }],
      improvements: [{ id: "i1", action: "질소 퍼지 절차 강화", category: "관리" }],
      briefingDraft: "가연성 증기 점검이 완료되기 전 작업을 중단하십시오.",
    })),
  },
}));

vi.mock("@/services/koshaService", () => ({
  KoshaService: {
    searchDisasterCases: vi.fn(),
    queryFatalities: vi.fn(),
    recommendMaterials: vi.fn(),
  },
}));

vi.mock("@/services/assessmentLawService", () => ({
  AssessmentLawService: {
    searchLaws: vi.fn(),
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

async function runToEvidenceStep() {
  await runToAnalysisStep();

  await act(async () => {
    await latestContext!.loadEvidence(true);
  });
}

async function runToAnalysisStep() {
  await act(async () => {
    await latestContext!.startAnalysis({
      taskName: "저장탱크 외벽 용접",
      taskDescription: "저장탱크 외벽에서 인화성 증기 잔류 가능 구간 용접",
      siteName: "A현장",
    });
  });

  await act(async () => {
    await latestContext!.confirmProfile({
      ...latestContext!.assessment!.profile,
      industry: "화학업",
      workLocation: "저장탱크 외벽",
    });
  });
}

describe("evidence status handling", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    latestContext = null;

    render(
      <AssessmentProvider>
        <ContextProbe />
      </AssessmentProvider>,
    );

    await waitFor(() => {
      expect(latestContext).not.toBeNull();
    });
  });

  it("API 실패 시 mock fallback 없이 error 상태를 표시한다", async () => {
    const mocked = vi.mocked(KoshaService);
    const errorEvidenceResult: EvidenceFetchResult = { status: "error", errorCode: "UPSTREAM_ERROR", items: [] };
    const errorMaterialResult: MaterialFetchResult = { status: "error", errorCode: "UPSTREAM_ERROR", items: [] };

    mocked.searchDisasterCases.mockResolvedValue(errorEvidenceResult);
    mocked.queryFatalities.mockResolvedValue(errorEvidenceResult);
    vi.mocked(AssessmentLawService.searchLaws).mockResolvedValue(errorEvidenceResult);
    mocked.recommendMaterials.mockResolvedValue(errorMaterialResult);

    await runToEvidenceStep();

    const assessment = latestContext!.assessment!;
    expect(assessment.evidenceItems).toHaveLength(0);
    expect(assessment.apiStatuses.disasterCase).toBe("error");
    expect(assessment.apiStatuses.fatalityCase).toBe("error");
    expect(assessment.apiStatuses.lawGuide).toBe("error");
    expect(assessment.status).toBe("analysis_ready");
  });

  it("API empty 응답 시 empty 상태를 표시한다", async () => {
    const mocked = vi.mocked(KoshaService);
    const emptyEvidenceResult: EvidenceFetchResult = { status: "empty", items: [] };
    const emptyMaterialResult: MaterialFetchResult = { status: "empty", items: [] };

    mocked.searchDisasterCases.mockResolvedValue(emptyEvidenceResult);
    mocked.queryFatalities.mockResolvedValue(emptyEvidenceResult);
    vi.mocked(AssessmentLawService.searchLaws).mockResolvedValue(emptyEvidenceResult);
    mocked.recommendMaterials.mockResolvedValue(emptyMaterialResult);

    await runToEvidenceStep();

    const assessment = latestContext!.assessment!;
    expect(assessment.evidenceItems).toHaveLength(0);
    expect(assessment.apiStatuses.disasterCase).toBe("empty");
    expect(assessment.apiStatuses.fatalityCase).toBe("empty");
    expect(assessment.apiStatuses.lawGuide).toBe("empty");
    expect(assessment.status).toBe("ready_for_report");
  });

  it("law prefetch 이후에도 idle 소스가 있으면 loadEvidence가 전체 조회를 실행한다", async () => {
    const mocked = vi.mocked(KoshaService);
    const errorEvidenceResult: EvidenceFetchResult = { status: "error", errorCode: "UPSTREAM_ERROR", items: [] };
    const emptyEvidenceResult: EvidenceFetchResult = { status: "empty", items: [] };
    const emptyMaterialResult: MaterialFetchResult = { status: "empty", items: [] };

    mocked.searchDisasterCases.mockResolvedValue(emptyEvidenceResult);
    mocked.queryFatalities.mockResolvedValue(emptyEvidenceResult);
    mocked.recommendMaterials.mockResolvedValue(emptyMaterialResult);
    vi.mocked(AssessmentLawService.searchLaws).mockResolvedValue(errorEvidenceResult);

    await runToAnalysisStep();

    await act(async () => {
      await latestContext!.prefetchLawGuidesForAnalysis({ force: true });
    });

    expect(latestContext!.assessment!.apiStatuses.disasterCase).toBe("idle");
    expect(latestContext!.assessment!.apiStatuses.fatalityCase).toBe("idle");
    expect(latestContext!.assessment!.apiStatuses.materials).toBe("idle");
    expect(latestContext!.assessment!.apiStatuses.lawGuide).toBe("error");

    await act(async () => {
      await latestContext!.loadEvidence();
    });

    expect(mocked.searchDisasterCases).toHaveBeenCalledTimes(1);
    expect(mocked.queryFatalities).toHaveBeenCalledTimes(1);
    expect(mocked.recommendMaterials).toHaveBeenCalledTimes(1);
    expect(latestContext!.assessment!.apiStatuses.disasterCase).toBe("empty");
    expect(latestContext!.assessment!.apiStatuses.fatalityCase).toBe("empty");
    expect(latestContext!.assessment!.apiStatuses.materials).toBe("empty");
  });

  it("law prefetch 성공 이후 loadEvidence는 법령 재요청 없이 나머지 소스만 조회한다", async () => {
    const mocked = vi.mocked(KoshaService);
    const emptyEvidenceResult: EvidenceFetchResult = { status: "empty", items: [] };
    const emptyMaterialResult: MaterialFetchResult = { status: "empty", items: [] };
    const prefetchedLawResult: EvidenceFetchResult = {
      status: "success",
      items: [
        {
          id: "law-1",
          type: "law",
          sourceBadge: "법령",
          title: "산업안전보건기준에 관한 규칙 제20조",
          relevanceScore: 90,
          summaryBullets: ["근거 요약"],
          keywords: ["추락"],
        },
      ],
      lawActionItems: [
        {
          id: "action-1",
          stage: "immediate",
          actionText: "작업을 중지하세요.",
          articleNumbers: ["제20조"],
        },
      ],
      lawGuideMeta: {
        sourceCounts: { api: 1, db: 0, storage: 0 },
        trackCounts: { law: 1, guide: 0, media: 0 },
        trackStatus: { law: "success", guide: "empty", media: "empty" },
      },
    };

    mocked.searchDisasterCases.mockResolvedValue(emptyEvidenceResult);
    mocked.queryFatalities.mockResolvedValue(emptyEvidenceResult);
    mocked.recommendMaterials.mockResolvedValue(emptyMaterialResult);
    vi.mocked(AssessmentLawService.searchLaws).mockResolvedValue(prefetchedLawResult);

    await runToAnalysisStep();

    await act(async () => {
      await latestContext!.prefetchLawGuidesForAnalysis({ force: true });
    });

    expect(vi.mocked(AssessmentLawService.searchLaws)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ActionPlanService.generateLawActions)).toHaveBeenCalledTimes(1);

    await act(async () => {
      await latestContext!.loadEvidence();
    });

    expect(vi.mocked(AssessmentLawService.searchLaws)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ActionPlanService.generateLawActions)).toHaveBeenCalledTimes(1);
    expect(mocked.searchDisasterCases).toHaveBeenCalledTimes(1);
    expect(mocked.queryFatalities).toHaveBeenCalledTimes(1);
    expect(mocked.recommendMaterials).toHaveBeenCalledTimes(1);
    expect(latestContext!.assessment!.apiStatuses.lawGuide).toBe("success");
  });
});
