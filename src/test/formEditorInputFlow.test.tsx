import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FormEditor from "@/pages/FormEditor";
import { analyzeTaskToAssessment } from "@/services/assessmentAnalysisService";
import { FormLawService } from "@/services/formLawService";
import { RiskLegalBasisFitService } from "@/services/riskLegalBasisFitService";

vi.mock("@/services/assessmentAnalysisService", () => ({
  analyzeTaskToAssessment: vi.fn(),
}));

vi.mock("@/services/formLawService", () => ({
  FormLawService: {
    searchLaws: vi.fn(async () => ({
      items: [],
      lawItems: [],
      guideItems: [],
      mediaItems: [],
      lawActionItems: [],
      status: "empty",
    })),
  },
}));

vi.mock("@/services/riskLegalBasisFitService", () => ({
  RiskLegalBasisFitService: {
    analyzeRows: vi.fn(async (input: { rows: Array<{ cause: string; hazardFactor: string }> }) => (
      input.rows.map((row, rowIndex) => ({
        rowIndex,
        hazardType: "추락",
        accidentMechanism: `${row.cause} ${row.hazardFactor}`.trim() || "비계 작업발판 고정 불량으로 인한 추락",
        unsafeCondition: row.cause || "작업발판 고정 상태 미확인",
        equipment: ["비계", "작업발판"],
        searchTerms: ["비계 작업발판", "추락 방지", "작업발판 고정"],
      }))
    )),
    reviewRows: vi.fn(async () => []),
  },
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/forms/RiskAssessmentTable", () => ({
  RiskAssessmentTable: () => <div>risk-table</div>,
}));

vi.mock("@/components/forms/AccidentReportForm", () => ({
  AccidentReportForm: () => <div>accident-form</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("FormEditor input automation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzeTaskToAssessment).mockResolvedValue({
      id: "assessment-1",
      taskName: "비계 작업 중 추락 위험",
      taskDescription: "테스트용 작업 설명",
      profile: {
        industry: "건설업",
        workLocation: "비계",
        equipment: [],
        hazards: [],
      },
      analysis: {
        scenario: "",
        immediateActions: [],
        improvements: [],
        score: 0,
        level: "low",
        fatalityCases: [],
      },
      evidenceItems: [],
      lawActionItems: [],
    } as any);
    vi.mocked(FormLawService.searchLaws).mockResolvedValue({
      items: [],
      lawItems: [],
      guideItems: [],
      mediaItems: [],
      lawActionItems: [],
      status: "empty",
    });
  });

  it("uses form input when requesting AI analysis", async () => {
    const inputTaskName = "비계 작업 중 추락 위험";
    const inputContext =
      "작업자가 고소작업대에서 비계 작업을 수행하던 중 발판이 흔들리고, 안전대 결속 상태를 즉시 점검해야 하는 상황입니다.";

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("작업 제목 (필수)"), {
      target: { value: inputTaskName },
    });
    fireEvent.change(screen.getByLabelText("현재 작업 상황 (필수)"), {
      target: {
        value: inputContext,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(analyzeTaskToAssessment).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(RiskLegalBasisFitService.analyzeRows).toHaveBeenCalledTimes(1);
      expect(FormLawService.searchLaws).toHaveBeenCalledTimes(1);
    });

    const lawOptions = vi.mocked(FormLawService.searchLaws).mock.calls[0]?.[2];
    expect(lawOptions?.semanticIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowIndex: 0,
          hazardType: "추락",
          searchTerms: expect.arrayContaining(["비계 작업발판", "추락 방지"]),
        }),
      ]),
    );

    const payload = vi.mocked(analyzeTaskToAssessment).mock.calls[0][0];
    expect(payload.taskName).toBe(inputTaskName);
    expect(payload.taskDescription).toContain(inputContext);
    expect(payload.formType).toBe("risk-assessment");
    expect(payload.formTemplateHint).toContain("[위험성평가표 작성 기준]");
  });
});
