import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import ReportOutput from "@/pages/ReportOutput";
import { createMockAssessment } from "@/data/mockData";

const navigateMock = vi.fn();
const setCurrentStepMock = vi.fn();
const generateReportMock = vi.fn();
const updateReportSectionMock = vi.fn();
const updateChecklistMock = vi.fn();
const updateBriefingMock = vi.fn();
const exportReportMock = vi.fn(async () => ({ ok: true, message: "done" }));
const toastMock = vi.fn();

const assessmentMock = {
  ...createMockAssessment(),
  reportSections: [
    { id: "header", title: "문서 헤더", content: "ignored", editable: false, order: 1 },
    { id: "overview", title: "작업 개요", content: "개요 본문", editable: true, order: 2 },
    { id: "hazards", title: "주요 위험요인", content: "- 추락", editable: true, order: 3 },
    { id: "risk-level", title: "위험등급 및 즉시 조치", content: "HIGH", editable: true, order: 4 },
    { id: "law-remedial-actions", title: "법령 기반 개선조치", content: "- 법령 조치", editable: true, order: 5 },
    { id: "improvements", title: "권장 개선조치", content: "- 권장 조치", editable: true, order: 6 },
    { id: "law-guide", title: "법령 및 KOSHA Guide 근거", content: "[법령 인용]\n- 조문", editable: true, order: 7 },
    { id: "materials", title: "추천 교육자료", content: "- 자료", editable: true, order: 8 },
    { id: "checklist", title: "작업 전 체크리스트", content: "", editable: false, order: 9 },
    { id: "briefing", title: "작업 전 안전 브리핑 문안", content: "", editable: false, order: 10 },
  ],
  checklistItems: ["점검 1"],
  briefingText: "브리핑",
};

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/contexts/AssessmentContext", () => ({
  useAssessment: () => ({
    assessment: assessmentMock,
    setCurrentStep: setCurrentStepMock,
    generateReport: generateReportMock,
    updateReportSection: updateReportSectionMock,
    updateChecklist: updateChecklistMock,
    updateBriefing: updateBriefingMock,
    exportReport: exportReportMock,
  }),
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children, rightPanel }: { children: ReactNode; rightPanel?: ReactNode }) => (
    <div>
      <div>{children}</div>
      <div>{rightPanel}</div>
    </div>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

describe("ReportOutput profile toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("switches preview profile and exports with selected profile", async () => {
    render(<ReportOutput />);

    expect(screen.getByTestId("report-preview-profile-label")).toHaveTextContent("제출용");

    fireEvent.click(screen.getByTestId("report-profile-review"));
    expect(screen.getByTestId("report-preview-profile-label")).toHaveTextContent("검토용");

    fireEvent.click(screen.getByRole("button", { name: /PDF 다운로드/ }));

    await waitFor(() => {
      expect(exportReportMock).toHaveBeenCalledWith("pdf", "review");
    });

    fireEvent.click(screen.getByRole("button", { name: /내용 복사/ }));
    await waitFor(() => {
      expect(exportReportMock).toHaveBeenCalledWith("clipboard", "review");
    });
  });
});

