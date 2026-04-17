import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FormEditor from "@/pages/FormEditor";
import { FormHistoryService } from "@/services/formHistoryService";

vi.mock("@/services/formHistoryService", () => ({
  FormHistoryService: {
    getHistoryRecord: vi.fn(),
    createRiskHistoryRecord: vi.fn(),
    createAccidentHistoryRecord: vi.fn(),
  },
}));

vi.mock("@/services/assessmentAnalysisService", () => ({
  analyzeTaskToAssessment: vi.fn(),
}));

vi.mock("@/services/formLawService", () => ({
  FormLawService: {
    searchLaws: vi.fn(),
  },
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/forms/RiskAssessmentTable", () => ({
  RiskAssessmentTable: ({ readOnly, data }: { readOnly?: boolean; data: Array<{ category?: string }> }) => (
    <div data-testid="risk-table">
      {readOnly ? "readonly" : "editable"}:{data.length}:{data[0]?.category ?? ""}
    </div>
  ),
}));

vi.mock("@/components/forms/AccidentReportForm", () => ({
  AccidentReportForm: () => <div>accident-form</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("FormEditor history mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(FormHistoryService.getHistoryRecord).mockResolvedValue({
      id: "history-1",
      formType: "risk-assessment",
      taskName: "현장작업 위험성평가",
      siteName: "A현장",
      workDate: "2026-04-12",
      createdAt: "2026-04-12T10:00:00.000Z",
      expiresAt: "2026-05-12T10:00:00.000Z",
      rowCount: 1,
      contextText: "작업 설명",
      riskRows: [
        {
          workProcess: "발판 점검",
          category: "추락",
          cause: "작업발판 미고정",
          hazardFactor: "발판 미끄러짐",
          legalBasis: "산업안전보건기준에 관한 규칙 제42조",
          currentMeasure: "작업중지",
          frequency: 3,
          severity: 4,
          riskLevel: "12(보통)",
          reductionMeasure: "안전대 착용",
          postRiskLevel: "",
          improvementDate: "",
          completionDate: "",
          responsiblePerson: "",
        },
      ],
      accidentData: null,
    });
  });

  it("does not restore stale draft when historyId is missing", () => {
    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("risk-table")).not.toBeInTheDocument();
  });

  it("loads history in read-only mode and normalizes legacy category", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/forms/risk-assessment?historyId=history-1"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(FormHistoryService.getHistoryRecord).toHaveBeenCalledWith("history-1");
    });

    await waitFor(() => {
      expect(screen.getByTestId("risk-table")).toHaveTextContent("readonly:1:작업특성 요인");
    });

    const taskInput = container.querySelector("#form-task-name") as HTMLInputElement | null;
    expect(taskInput).toBeTruthy();
    expect(taskInput).toBeDisabled();
  });

  it("loads accident-report history in read-only mode", async () => {
    vi.mocked(FormHistoryService.getHistoryRecord).mockResolvedValueOnce({
      id: "history-accident-1",
      formType: "accident-report",
      taskName: "지게차 충돌 사고",
      siteName: "B현장",
      workDate: "2026-04-13",
      createdAt: "2026-04-13T10:00:00.000Z",
      expiresAt: "2026-05-13T10:00:00.000Z",
      rowCount: 0,
      contextText: "사고 설명",
      riskRows: [],
      accidentData: {
        administrativeInfo: {},
        businessInfo: {},
        victimInfo: {},
        accidentDetails: {},
        preventionPlan: {},
      } as any,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/forms/accident-report?historyId=history-accident-1"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(FormHistoryService.getHistoryRecord).toHaveBeenCalledWith("history-accident-1");
    });
    expect(screen.getByText("accident-form")).toBeInTheDocument();

    const taskInput = container.querySelector("#form-task-name") as HTMLInputElement | null;
    expect(taskInput).toBeTruthy();
    expect(taskInput).toBeDisabled();
  });
});
