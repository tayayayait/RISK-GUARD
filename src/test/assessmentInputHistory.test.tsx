import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssessmentInput from "@/pages/AssessmentInput";
import { RiskAssessmentStoreService } from "@/services/riskAssessmentStoreService";
import { restoreAssessmentFromDetail } from "@/lib/assessmentPersistence";

const setAssessment = vi.fn();
const setCurrentStep = vi.fn();

vi.mock("@/contexts/AssessmentContext", () => ({
  useAssessment: () => ({
    startAnalysis: vi.fn(),
    setAssessment,
    setCurrentStep,
  }),
}));

vi.mock("@/services/riskAssessmentStoreService", () => ({
  RiskAssessmentStoreService: {
    list: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/lib/assessmentPersistence", () => ({
  restoreAssessmentFromDetail: vi.fn(),
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const summary = {
  id: "assessment-1",
  taskName: "외벽 도장 작업",
  siteName: "A 현장",
  workDate: "2026-08-20",
  industry: "건설업",
  workLocation: "외벽",
  evaluator: "홍길동",
  referenceScore: 72,
  referenceLevel: "high" as const,
  status: "draft" as const,
  createdAt: "2026-08-20T01:00:00.000Z",
  updatedAt: "2026-08-20T02:00:00.000Z",
  retainUntil: "2029-08-20T01:00:00.000Z",
};

describe("AssessmentInput account history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(RiskAssessmentStoreService.list).mockResolvedValue([summary]);
    vi.mocked(RiskAssessmentStoreService.remove).mockResolvedValue();
  });

  it("저장된 위험성평가를 목록에서 다시 열어 이전 단계로 이동한다", async () => {
    vi.mocked(RiskAssessmentStoreService.get).mockResolvedValue({ id: summary.id } as never);
    vi.mocked(restoreAssessmentFromDetail).mockReturnValue({
      id: summary.id,
      currentStep: "analysis",
    } as never);

    render(
      <MemoryRouter initialEntries={["/assessments/new"]}>
        <Routes>
          <Route path="/assessments/new" element={<AssessmentInput />} />
          <Route path="/assessments/:id/analysis" element={<div>복원된 분석 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("외벽 도장 작업")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "외벽 도장 작업 열기" }));

    await waitFor(() => {
      expect(RiskAssessmentStoreService.get).toHaveBeenCalledWith("assessment-1");
      expect(setAssessment).toHaveBeenCalledWith(expect.objectContaining({ id: "assessment-1" }));
      expect(screen.getByText("복원된 분석 화면")).toBeInTheDocument();
    });
  });

  it("저장된 위험성평가를 삭제하면 목록에서도 제거한다", async () => {
    render(
      <MemoryRouter>
        <AssessmentInput />
      </MemoryRouter>,
    );

    expect(await screen.findByText("외벽 도장 작업")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "외벽 도장 작업 삭제" }));

    await waitFor(() => {
      expect(RiskAssessmentStoreService.remove).toHaveBeenCalledWith("assessment-1");
      expect(screen.queryByText("외벽 도장 작업")).not.toBeInTheDocument();
    });
  });
});
