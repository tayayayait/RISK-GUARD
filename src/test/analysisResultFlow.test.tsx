import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import { useAssessment, useOptionalAssessment } from "@/contexts/AssessmentContext";
import AnalysisResult from "@/pages/AnalysisResult";

vi.mock("@/contexts/AssessmentContext", () => ({
  useAssessment: vi.fn(),
  useOptionalAssessment: vi.fn(),
}));

function buildContext() {
  const assessment = createMockAssessment();

  return {
    assessment: {
      ...assessment,
      currentStep: "analysis" as const,
      status: "analysis_ready" as const,
      lawActionItems: [
        {
          id: "law-action-1",
          stage: "immediate" as const,
          actionText: "작업 시작 전에 안전 상태를 점검합니다.",
          articleNumbers: ["제3조"],
          articleTitle: "달비계의 구조",
          lawName: "산업안전보건기준에 관한 규칙",
          legalRequirement: "사업주는 근로자용 달비계를 설치하는 경우 기준을 준수해야 합니다.",
          clausePreview: "사업주는 근로자용 달비계를 설치하는 경우 각 호의 사항을 준수해야 합니다.",
          actionNeedReason: "즉시 조치 단계에서 선제 대응이 필요합니다.",
          applicabilityReason: "현재 작업 조건과 직접 연계됩니다.",
        },
        {
          id: "law-action-2",
          stage: "same_day" as const,
          actionText: "당일 내 비정상 장치를 차단합니다.",
          articleNumbers: ["제4조"],
          lawName: "산업안전보건기준에 관한 규칙",
          legalRequirement: "당일 조치 기준을 충족해야 합니다.",
          actionNeedReason: "당일 완료가 필요합니다.",
        },
        {
          id: "law-action-3",
          stage: "pre_resume" as const,
          actionText: "작업 재개 전에 비상구를 확인합니다.",
          articleNumbers: ["제5조"],
          lawName: "산업안전보건기준에 관한 규칙",
          legalRequirement: "재개 전 점검이 필요합니다.",
          actionNeedReason: "재개 전 확인이 필요합니다.",
        },
      ],
      evidenceItems: [
        {
          id: "law-evidence-1",
          type: "law" as const,
          sourceBadge: "법령" as const,
          title: "산업안전보건기준에 관한 규칙 제3조",
          relevanceScore: 95,
          summaryBullets: ["달비계 기준 준수"],
          keywords: ["달비계", "점검"],
          sourceType: "storage" as const,
          articleNumber: "제3조",
          articleTitle: "달비계의 구조",
          legalBasis: "산업안전보건기준에 관한 규칙 제3조",
          clausePreview: "사업주는 근로자용 달비계를 설치하는 경우 각 호의 사항을 준수해야 합니다.",
          fullContent: "제3조(달비계의 구조) 사업주는 근로자용 달비계를 설치하는 경우 각 호의 사항을 준수해야 합니다.",
        },
      ],
      citations: [],
    },
    setAssessment: vi.fn(),
    updateField: vi.fn(),
    currentStep: "analysis" as const,
    setCurrentStep: vi.fn(),
    isLoading: false,
    setIsLoading: vi.fn(),
    loadMockData: vi.fn(),
    startAnalysis: vi.fn(),
    confirmProfile: vi.fn(async () => undefined),
    prefetchLawGuidesForAnalysis: vi.fn(async () => undefined),
    loadEvidence: vi.fn(async () => undefined),
    reloadMaterials: vi.fn(async () => undefined),
    toggleEvidenceExcluded: vi.fn(),
    selectCitation: vi.fn(),
    selectMaterial: vi.fn(),
    generateReport: vi.fn(),
    updateReportSection: vi.fn(),
    updateChecklist: vi.fn(),
    updateBriefing: vi.fn(),
    exportReport: vi.fn(async () => ({ ok: true, message: "" })),
    canAccessStep: vi.fn(() => true),
    getStepRoute: vi.fn(() => "/assessments/new"),
  } as ReturnType<typeof useAssessment>;
}

describe("AnalysisResult execution flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders stage sections and hides the legal basis panel", () => {
    const context = buildContext();
    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <AnalysisResult />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "즉시 조치" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "당일 조치" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "작업 재개 전 확인" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "법령 근거" })).not.toBeInTheDocument();
  });

  it("keeps article source links on action cards", () => {
    const context = buildContext();
    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <AnalysisResult />
      </MemoryRouter>,
    );

    const originalLinks = screen.getAllByRole("link", { name: "원문보기" });
    expect(originalLinks.length).toBeGreaterThan(0);

    const matched = originalLinks.find((link) =>
      (link.getAttribute("href") ?? "").includes("kr-industrial-safety-and-health-standards-rules.pdf"),
    );
    expect(matched).toBeDefined();
    expect(matched?.getAttribute("href")).toContain("#search=");
  });

  it("opens right panel drawer automatically on xl-down viewport", async () => {
    const matchMediaSpy = vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query === "(max-width: 1279px)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList);

    try {
      const context = buildContext();
      vi.mocked(useAssessment).mockReturnValue(context);
      vi.mocked(useOptionalAssessment).mockReturnValue(context);

      render(
        <MemoryRouter>
          <AnalysisResult />
        </MemoryRouter>,
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      fireEvent.click(screen.getAllByRole("button", { name: /제3조/ })[0]);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    } finally {
      matchMediaSpy.mockRestore();
    }
  });
});
