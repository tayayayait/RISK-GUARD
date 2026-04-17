import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import EvidenceBoard from "@/pages/EvidenceBoard";
import { useAssessment, useOptionalAssessment } from "@/contexts/AssessmentContext";
import { EvidenceSummaryService } from "@/services/evidenceSummaryService";

const MOCK_SUMMARY = {
  incidentRelevance: "현재 작업은 폭발 위험이 있어 관련 사고와 유사한 조건입니다.",
  applicabilityReason: "법령은 환기와 가스농도 측정을 의무화하고 있어 해당 작업에 직접 적용됩니다.",
  practicalActions: ["작업 전 가스농도를 즉시 측정하세요.", "화기작업 허가 절차를 완료하세요."],
};

vi.mock("@/contexts/AssessmentContext", () => ({
  useAssessment: vi.fn(),
  useOptionalAssessment: vi.fn(),
}));

vi.mock("@/services/evidenceSummaryService", () => ({
  EvidenceSummaryService: {
    summarizeEvidence: vi.fn(),
  },
}));

function buildContext() {
  const assessment = createMockAssessment();

  return {
    assessment: {
      ...assessment,
      currentStep: "evidence" as const,
      evidenceItems: [
        {
          id: "law-1",
          type: "law" as const,
          sourceBadge: "법령" as const,
          title: "산업안전보건법 제31조",
          relevanceScore: 92,
          semanticScore: 87,
          relevanceReason: "작업 위치와 폭발 위험 맥락이 조문 내용과 직접 일치합니다.",
          summaryBullets: ["폭발위험장소는 충분히 환기해야 한다."],
          fullContent: "폭발위험장소에서는 환기설비를 가동하고 가스 농도를 측정해야 한다.",
          keywords: ["폭발/화재", "환기"],
          sourceType: "api" as const,
          lawCategory: "1" as const,
          legalBasis: "산업안전보건법 제31조",
          articleNumber: "제31조",
          applicationPoints: ["환기 조치", "가스 농도 측정"],
          excluded: false,
          url: "https://example.com/law",
        },
        {
          id: "law-2",
          type: "law" as const,
          sourceBadge: "법령" as const,
          title: "산업안전보건기준에 관한 규칙 제20조",
          relevanceScore: 88,
          semanticScore: 83,
          relevanceReason: "출입 통제가 필요한 작업 조건과 조문 요구사항이 일치합니다.",
          summaryBullets: ["출입 금지 구역 통제를 시행해야 한다."],
          fullContent: "사업주는 출입 금지 구역을 지정하고 통제해야 한다.",
          keywords: ["출입통제", "추락"],
          sourceType: "api" as const,
          lawCategory: "4" as const,
          legalBasis: "산업안전보건기준에 관한 규칙 제20조",
          articleNumber: "제20조",
          excluded: false,
          url: "https://example.com/law-standards",
        },
        {
          id: "guide-1",
          type: "law" as const,
          sourceBadge: "Guide" as const,
          title: "밀폐공간 작업 기술지침",
          relevanceScore: 77,
          summaryBullets: ["작업 전 산소농도를 측정한다."],
          fullContent: "밀폐공간 진입 전 산소농도 측정을 수행한다.",
          keywords: ["Guide", "밀폐공간"],
          sourceType: "api" as const,
          excluded: false,
          url: "https://example.com/guide",
        },
        {
          id: "media-1",
          type: "law" as const,
          sourceBadge: "미디어" as const,
          title: "저장탱크 화재예방 OPS",
          relevanceScore: 81,
          summaryBullets: ["저장탱크 정비 시 점화원 통제를 우선 시행한다."],
          fullContent: "작업 시작 전 가스농도를 측정하고, 화기작업 허가 절차를 완료해야 한다.",
          keywords: ["OPS", "화재", "저장탱크"],
          mediaStyle: "OPS",
          sourceType: "api" as const,
          excluded: false,
          url: "https://example.com/media",
        },
      ],
      lawActionItems: [
        {
          id: "law-action-1",
          stage: "immediate" as const,
          actionText: "작업 전 가스농도를 측정하라",
          articleNumbers: ["제31조"],
        },
      ],
      lawGuideMeta: {
        sourceCounts: { api: 4, db: 0, storage: 0 },
        trackCounts: { law: 2, guide: 1, media: 1 },
        trackStatus: { law: "success", guide: "success", media: "success" },
        guideEmptyReason: "NO_GUIDE_CANDIDATE",
      },
      apiStatuses: {
        ...assessment.apiStatuses,
        lawGuide: "success" as const,
      },
    },
    setAssessment: vi.fn(),
    updateField: vi.fn(),
    currentStep: "evidence" as const,
    setCurrentStep: vi.fn(),
    isLoading: false,
    setIsLoading: vi.fn(),
    loadMockData: vi.fn(),
    startAnalysis: vi.fn(),
    confirmProfile: vi.fn(),
    prefetchLawGuidesForAnalysis: vi.fn(),
    loadEvidence: vi.fn(async () => undefined),
    toggleEvidenceExcluded: vi.fn(),
    selectCitation: vi.fn(),
    selectMaterial: vi.fn(),
    generateReport: vi.fn(),
    updateReportSection: vi.fn(),
    updateChecklist: vi.fn(),
    updateBriefing: vi.fn(),
    exportReport: vi.fn(),
    canAccessStep: vi.fn(() => true),
    getStepRoute: vi.fn(() => "/assessments/new"),
  } as ReturnType<typeof useAssessment>;
}

describe("EvidenceBoard law/guide/media tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(EvidenceSummaryService.summarizeEvidence).mockResolvedValue(MOCK_SUMMARY);
  });

  it("근거 생성 완료 전에는 대기 로딩 화면을 먼저 표시한다", async () => {
    const context = buildContext();
    context.assessment = {
      ...context.assessment,
      currentStep: "analysis",
      status: "analysis_ready",
      evidenceItems: [],
      materials: [],
      apiStatuses: {
        ...context.assessment.apiStatuses,
        disasterCase: "idle",
        fatalityCase: "idle",
        lawGuide: "idle",
        materials: "idle",
      },
    };

    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    expect(screen.getByText("근거 자료 생성 중")).toBeInTheDocument();
    expect(screen.queryByText("근거 화면")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(context.loadEvidence).toHaveBeenCalledTimes(1);
    });
  });

  it("법령 탭에서 출처 집계를 표시한다", () => {
    const context = buildContext();
    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "법령" }));

    expect(screen.queryByText("법령 실행지침")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /산업안전보건법.*\(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /산업안전보건법 시행령.*\(0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /산업안전보건기준에 관한 규칙.*\(1\)/ })).toBeInTheDocument();
    expect(screen.getByText(/법령 범위: 스마트검색 1~4/)).toBeInTheDocument();
    expect(screen.getByText(/트랙 건수: 법령 2건 · Guide 1건 · 미디어 1건/)).toBeInTheDocument();
    expect(screen.getByText(/출처 집계\(법령\): API 1/)).toBeInTheDocument();
    expect(screen.getByText(/법령\/Guide\/미디어\(집계\): 완료/)).toBeInTheDocument();
    expect(screen.getByText(/법령 트랙: 완료/)).toBeInTheDocument();
    expect(screen.getByText(/Guide 트랙: 완료/)).toBeInTheDocument();
    expect(screen.getByText(/미디어 트랙: 완료/)).toBeInTheDocument();
    expect(screen.getByText(/AI 관련성 점수: 87/)).toBeInTheDocument();
    expect(screen.getByText(/AI 관련성 근거: 작업 위치와 폭발 위험 맥락이 조문 내용과 직접 일치합니다./)).toBeInTheDocument();
  });

  it("법령 하위 탭 전환 시 카테고리별 결과를 필터링한다", () => {
    const context = buildContext();
    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "법령" }));

    expect(screen.getByText("산업안전보건법 제31조")).toBeInTheDocument();
    expect(screen.queryByText("산업안전보건기준에 관한 규칙 제20조")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /산업안전보건기준에 관한 규칙.*\(1\)/ }));

    expect(screen.getByText("산업안전보건기준에 관한 규칙 제20조")).toBeInTheDocument();
    expect(screen.queryByText("산업안전보건법 제31조")).not.toBeInTheDocument();
  });

  it("Guide 탭에서 empty reason을 표시한다", () => {
    const context = buildContext();
    context.assessment.evidenceItems = context.assessment.evidenceItems.filter((item) => item.sourceBadge !== "Guide");
    if (context.assessment.lawGuideMeta) {
      context.assessment.lawGuideMeta = {
        ...context.assessment.lawGuideMeta,
        trackCounts: {
          ...context.assessment.lawGuideMeta.trackCounts,
          guide: 0,
        },
        trackStatus: {
          ...(context.assessment.lawGuideMeta.trackStatus ?? { law: "empty", guide: "empty", media: "empty" }),
          guide: "empty",
        },
      };
    }

    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "KOSHA Guide" }));

    expect(screen.getByText(/Guide 결과가 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/Guide 상태: Guide 후보가 없어 결과가 비어 있습니다./)).toBeInTheDocument();
  });

  it("Guide 트랙 오류를 별도로 표시한다", () => {
    const context = buildContext();
    context.assessment.evidenceItems = context.assessment.evidenceItems.filter((item) => item.sourceBadge !== "Guide");
    context.assessment.apiStatuses.lawGuide = "partial";
    if (context.assessment.lawGuideMeta) {
      context.assessment.lawGuideMeta = {
        ...context.assessment.lawGuideMeta,
        trackCounts: {
          ...context.assessment.lawGuideMeta.trackCounts,
          guide: 0,
        },
        trackStatus: {
          ...(context.assessment.lawGuideMeta.trackStatus ?? { law: "empty", guide: "empty", media: "empty" }),
          guide: "error",
        },
        trackErrors: {
          ...(context.assessment.lawGuideMeta.trackErrors ?? {}),
          guide: ["MISSING_SECRET:DATA_GO_KR_API_KEY"],
        },
      };
    }

    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "KOSHA Guide" }));

    expect(screen.getByText(/Guide 결과가 없습니다. Guide 트랙 조회 실패/)).toBeInTheDocument();
    expect(screen.getByText(/트랙 오류: MISSING_SECRET:DATA_GO_KR_API_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/Guide 트랙: 조회 실패/)).toBeInTheDocument();
  });

  it("미디어 탭에서 카드와 출처 집계를 표시한다", () => {
    const context = buildContext();
    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "미디어" }));

    expect(screen.getByText("저장탱크 화재예방 OPS")).toBeInTheDocument();
    expect(screen.getByText(/출처 집계\(미디어\): API 1/)).toBeInTheDocument();
  });

  it("상세 모달에서 Guide 항목 AI 요약 버튼을 실행한다", async () => {
    const context = buildContext();
    context.assessment.citations = [
      {
        id: "cite-guide-1",
        evidenceId: "guide-1",
        title: "밀폐공간 작업 기술지침",
        sourceBadge: "Guide",
        summary: "요약",
        order: 1,
        addedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "KOSHA Guide" }));
    fireEvent.click(screen.getByRole("button", { name: "상세 보기" }));

    expect(screen.getByText("전체 내용")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /원문 링크 열기/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "AI 요약" }));

    await waitFor(() => {
      expect(EvidenceSummaryService.summarizeEvidence).toHaveBeenCalledTimes(1);
      expect(screen.getByText("우리 회사 사고와의 관련성")).toBeInTheDocument();
      expect(screen.getByText("적용 이유")).toBeInTheDocument();
      expect(screen.getByText("실제 조치")).toBeInTheDocument();
      expect(screen.getByText("현재 작업은 폭발 위험이 있어 관련 사고와 유사한 조건입니다.")).toBeInTheDocument();
      expect(context.updateField).toHaveBeenCalledWith(
        "evidenceItems",
        expect.arrayContaining([
          expect.objectContaining({
            id: "guide-1",
            aiSummary: MOCK_SUMMARY,
          }),
        ]),
      );
      expect(context.updateField).toHaveBeenCalledWith(
        "citations",
        expect.arrayContaining([
          expect.objectContaining({
            evidenceId: "guide-1",
            aiSummary: MOCK_SUMMARY,
          }),
        ]),
      );
    });
  });

  it("미디어 상세 모달에서는 AI 요약 버튼을 노출하지 않는다", () => {
    const context = buildContext();
    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "미디어" }));
    fireEvent.click(screen.getByRole("button", { name: "상세 보기" }));

    expect(screen.queryByRole("button", { name: "AI 요약" })).not.toBeInTheDocument();
    expect(EvidenceSummaryService.summarizeEvidence).not.toHaveBeenCalled();
  });

  it("상세 모달 오픈 시 기존 AI 요약이 있으면 즉시 표시한다", () => {
    const context = buildContext();
    context.assessment.evidenceItems = context.assessment.evidenceItems.map((item) =>
      item.id === "guide-1" ? { ...item, aiSummary: MOCK_SUMMARY } : item,
    );
    vi.mocked(useAssessment).mockReturnValue(context);
    vi.mocked(useOptionalAssessment).mockReturnValue(context);

    render(
      <MemoryRouter>
        <EvidenceBoard />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "KOSHA Guide" }));
    fireEvent.click(screen.getByRole("button", { name: "상세 보기" }));

    expect(screen.getByText("우리 회사 사고와의 관련성")).toBeInTheDocument();
    expect(screen.getByText("적용 이유")).toBeInTheDocument();
    expect(screen.getByText("실제 조치")).toBeInTheDocument();
    expect(screen.getByText("현재 작업은 폭발 위험이 있어 관련 사고와 유사한 조건입니다.")).toBeInTheDocument();
    expect(EvidenceSummaryService.summarizeEvidence).not.toHaveBeenCalled();
  });
});
