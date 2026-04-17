import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssessmentProvider, useAssessment } from "@/contexts/AssessmentContext";
import { ActionPlanService } from "@/services/actionPlanService";
import { KoshaService } from "@/services/koshaService";
import { AssessmentLawService } from "@/services/assessmentLawService";

vi.mock("@/services/geminiService", () => ({
  GeminiService: {
    analyzeTask: vi.fn(async () => ({
      profile: {
        industry: "건설업",
        workLocation: "건물 외벽",
        equipment: ["고소작업대", "절단기"],
        hazards: [
          { id: "h1", name: "추락", type: "추락", weight: 30, confidence: "high", reason: "고소작업으로 추락 위험이 있습니다." },
          { id: "h2", name: "끼임/협착", type: "끼임/협착", weight: 25, confidence: "medium", reason: "장비 작동부 협착 위험이 있습니다." },
        ],
      },
      profileConfidence: {
        industry: "high",
        workLocation: "high",
        equipment: "medium",
        hazards: "medium",
      },
      scenario: "고소작업 중 추락 위험이 높습니다.",
      immediateActions: [
        { id: "a1", action: "안전대 착용 상태를 확인하라", priority: 1 },
        { id: "a2", action: "작업반경 출입통제를 시행하라", priority: 2 },
      ],
      improvements: [
        { id: "i1", action: "추락 방지 설비를 보강하라", category: "시설" },
      ],
      briefingDraft: "작업 전 추락 방지 조치를 점검하십시오.",
    })),
  },
}));

vi.mock("@/services/koshaService", () => ({
  KoshaService: {
    searchDisasterCases: vi.fn(async () => ({
      status: "success",
      items: [
        {
          id: "case-1",
          type: "case",
          sourceBadge: "재해사례",
          title: "외벽 작업 중 추락 사례",
          relevanceScore: 91,
          summaryBullets: ["안전난간 미설치 상태에서 작업하다 추락"],
          keywords: ["추락", "외벽", "고소작업대"],
          matchedKeywords: ["추락", "외벽"],
          ruleScore: 86,
          semanticScore: 95,
          matchReason: "위험요인 45점, 장비/작업어 25점, 장소/공종 11점, 최신성 12점",
          excluded: false,
        },
      ],
    })),
    queryFatalities: vi.fn(async () => ({
      status: "success",
      items: [
        {
          id: "fatality-1",
          type: "fatality",
          sourceBadge: "사고사망",
          title: "고소작업 중 추락 사망사고",
          relevanceScore: 88,
          summaryBullets: ["안전대 미착용 상태에서 추락"],
          keywords: ["추락", "사망"],
          matchedKeywords: ["추락"],
          ruleScore: 82,
          semanticScore: 94,
          matchReason: "위험요인 45점, 장비/작업어 20점, 장소/공종 8점, 최신성 9점",
          incidentDate: "2026-01-10",
          place: "서울",
          casualtyScale: "사망 1명",
          standardAccidentType: "추락",
          similarity: 0.88,
          excluded: false,
        },
      ],
    })),
    recommendMaterials: vi.fn(async () => ({
      status: "success",
      items: [
        {
          id: "material-1",
          type: "영상",
          title: "추락 재해 예방 교육",
          url: "https://example.com/video",
          language: "한국어",
          relevance: 92,
          recommendReason: "고위험 추락 작업에 직접 적용 가능",
          selected: false,
          excluded: false,
        },
      ],
    })),
  },
}));

vi.mock("@/services/assessmentLawService", () => ({
  AssessmentLawService: {
    searchLaws: vi.fn(async () => ({
      status: "success",
      items: [
        {
          id: "law-1",
          type: "law",
          sourceBadge: "법령",
          title: "산업안전보건기준에 관한 규칙",
          relevanceScore: 84,
          summaryBullets: ["추락 위험 방지 조치 의무"],
          keywords: ["추락", "안전보건"],
          matchedKeywords: ["추락"],
          ruleScore: 79,
          semanticScore: 91,
          matchReason: "위험요인 40점, 장비/작업어 18점, 장소/공종 9점, 최신성 12점",
          applicationPoints: ["추락 방지설비 설치"],
          riskIfOmitted: "중대재해 위험 증가",
          excluded: false,
        },
        {
          id: "media-1",
          type: "law",
          sourceBadge: "미디어",
          title: "저장탱크 화재예방 OPS",
          relevanceScore: 73,
          summaryBullets: ["가스농도 측정 후 화기작업 허가 진행"],
          keywords: ["OPS", "화재"],
          mediaStyle: "OPS",
          fullContent: "작업 시작 전 가스농도 측정과 화기작업 허가 절차를 수행해야 한다.",
          sourceType: "api",
          excluded: false,
        },
      ],
    })),
  },
}));

vi.mock("@/services/actionPlanService", () => ({
  ActionPlanService: {
    generateLawActions: vi.fn(async () => ({
      status: "success",
      items: [
        {
          id: "law-action-1",
          stage: "immediate" as const,
          actionText: "가스농도 재측정 후 작업 허가를 재확인하라",
          articleNumbers: ["제295조"],
          generationType: "direct" as const,
        },
      ],
      stageCounts: {
        immediate: 1,
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

describe("assessment flow integration", () => {
  it("SCR-01 -> SCR-06 상태 전이를 수행한다", async () => {
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
      const next = await latestContext!.startAnalysis({
        taskName: "외벽 도장 작업",
        taskDescription: "고소작업대를 사용해 외벽 도장 작업을 수행한다.",
        siteName: "테스트 현장",
      });
      expect(next.currentStep).toBe("profile_review");
    });

    expect(latestContext!.assessment!.profile.hazards[0].reason).toContain("추락 위험");

    await act(async () => {
      const profile = latestContext!.assessment!.profile;
      await latestContext!.confirmProfile({
        ...profile,
        industry: "건설업",
        workLocation: "건축물 외벽",
      });
    });
    expect(latestContext!.assessment!.currentStep).toBe("analysis");

    await act(async () => {
      await latestContext!.loadEvidence(true);
    });
    expect(latestContext!.assessment!.evidenceItems.length).toBeGreaterThan(0);
    expect(latestContext!.assessment!.evidenceItems.some((item) => item.sourceBadge === "미디어")).toBe(true);

    act(() => {
      latestContext!.generateReport();
    });
    expect(latestContext!.assessment!.currentStep).toBe("report");
    expect(latestContext!.assessment!.reportSections.length).toBeGreaterThan(0);
  });

  it("이미 도달한 단계는 하향 갱신되지 않아 materials/report 접근이 유지된다", async () => {
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
        taskName: "외벽 도장 작업",
        taskDescription: "고소작업대를 사용해 외벽 도장 작업을 수행한다.",
        siteName: "테스트 현장",
      });
    });

    await act(async () => {
      const profile = latestContext!.assessment!.profile;
      await latestContext!.confirmProfile({
        ...profile,
        industry: "건설업",
        workLocation: "건축물 외벽",
      });
      await latestContext!.loadEvidence(true);
    });

    act(() => {
      latestContext!.generateReport();
    });
    expect(latestContext!.assessment!.currentStep).toBe("report");

    act(() => {
      latestContext!.setCurrentStep("profile_review");
    });

    expect(latestContext!.assessment!.currentStep).toBe("report");
    expect(latestContext!.canAccessStep("materials")).toBe(true);
    expect(latestContext!.canAccessStep("report")).toBe(true);
  });

  it("조문번호 없는 action-plan 응답이면 lawResult.lawActionItems를 우선 반영한다", async () => {
    latestContext = null;
    vi.mocked(AssessmentLawService.searchLaws).mockResolvedValueOnce({
      status: "success",
      items: [
        {
          id: "law-1",
          type: "law",
          sourceBadge: "법령",
          title: "산업안전보건기준에 관한 규칙 제13조",
          relevanceScore: 90,
          summaryBullets: ["추락 위험 구간 방호조치"],
          keywords: ["추락"],
          articleNumber: "제13조",
          legalBasis: "산업안전보건기준에 관한 규칙 제13조",
        },
      ],
      lawActionItems: [
        {
          id: "law-action-from-law-result",
          stage: "immediate",
          actionText: "추락 위험 구간에 방호조치를 설치하세요.",
          articleNumbers: ["제13조"],
          legalBasis: "산업안전보건기준에 관한 규칙 제13조",
        },
      ],
    });

    vi.mocked(ActionPlanService.generateLawActions).mockResolvedValueOnce({
      status: "success",
      items: [
        {
          id: "law-action-no-article",
          stage: "immediate",
          actionText: "작업을 즉시 중지하세요.",
          articleNumbers: [],
        },
      ],
      stageCounts: {
        immediate: 1,
        same_day: 0,
        pre_resume: 0,
        improvement: 0,
      },
    });

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
        taskName: "외벽 도장 작업",
        taskDescription: "고소작업대를 사용해 외벽 도장 작업을 수행한다.",
        siteName: "테스트 현장",
      });
    });

    await act(async () => {
      const profile = latestContext!.assessment!.profile;
      await latestContext!.confirmProfile({
        ...profile,
        industry: "건설업",
        workLocation: "건축물 외벽",
      });
    });

    await act(async () => {
      await latestContext!.loadEvidence(true);
    });

    expect(latestContext!.assessment!.lawActionItems[0]?.id).toBe("law-action-from-law-result");
    expect(latestContext!.assessment!.lawActionItems[0]?.articleNumbers).toEqual(["제13조"]);
  });

  it("문서 재생성 시 최신 선택 근거와 자동 기본값을 반영한다", async () => {
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
        taskName: "외벽 도장 작업",
        taskDescription: "고소작업대를 사용해 외벽 도장 작업을 수행한다.",
        siteName: "테스트 현장",
      });
    });

    await act(async () => {
      const profile = latestContext!.assessment!.profile;
      await latestContext!.confirmProfile({
        ...profile,
        industry: "건설업",
        workLocation: "건축물 외벽",
      });
    });

    await act(async () => {
      await latestContext!.loadEvidence(true);
    });

    act(() => {
      latestContext!.selectCitation("case-1", true);
      latestContext!.generateReport();
    });

    let disasterSection = latestContext!.assessment!.reportSections.find((section) => section.id === "disaster-cases");
    expect(disasterSection?.content).toContain("외벽 작업 중 추락 사례");

    act(() => {
      latestContext!.updateChecklist([]);
      latestContext!.updateField("analysis", {
        ...latestContext!.assessment!.analysis,
        improvements: [],
      });
      latestContext!.selectCitation("case-1", false);
      latestContext!.selectCitation("fatality-1", true);
      latestContext!.generateReport();
    });

    const fatalitySection = latestContext!.assessment!.reportSections.find((section) => section.id === "fatality-warning");
    disasterSection = latestContext!.assessment!.reportSections.find((section) => section.id === "disaster-cases");
    const improvementsSection = latestContext!.assessment!.reportSections.find((section) => section.id === "improvements");

    expect(disasterSection?.content).toContain("근거 수집 실패 또는 미선택");
    expect(fatalitySection?.content).toContain("고소작업 중 추락 사망사고");
    expect(fatalitySection?.content).toContain("일시: 2026-01-10");
    expect(fatalitySection?.content).toContain("장소: 서울");
    expect(fatalitySection?.content).toContain("인명피해: 사망 1명");

    expect(latestContext!.assessment!.checklistItems.length).toBeGreaterThan(0);
    expect(improvementsSection?.content).not.toContain("데이터 없음");
  });
});
