import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FormEditor from "@/pages/FormEditor";
import { analyzeTaskToAssessment } from "@/services/assessmentAnalysisService";
import { CompanyProfileService } from "@/services/companyProfileService";

vi.mock("@/services/assessmentAnalysisService", () => ({
  analyzeTaskToAssessment: vi.fn(),
}));

vi.mock("@/services/formLawService", () => ({
  FormLawService: {
    searchLaws: vi.fn(),
  },
}));

vi.mock("@/services/companyProfileService", () => ({
  CompanyProfileService: {
    getLatestProfile: vi.fn(),
  },
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/forms/RiskAssessmentTable", () => ({
  RiskAssessmentTable: () => <div>risk-table</div>,
}));

vi.mock("@/components/forms/AccidentReportForm", () => ({
  AccidentReportForm: ({ data }: { data: { businessInfo: { businessName: string; businessNumber: string } } }) => (
    <div>
      <div data-testid="accident-business-name">{data.businessInfo.businessName}</div>
      <div data-testid="accident-business-number">{data.businessInfo.businessNumber}</div>
    </div>
  ),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

describe("FormEditor accident report company profile integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzeTaskToAssessment).mockResolvedValue({
      id: "assessment-1",
      taskName: "지게차 충돌 사고",
      taskDescription: "사고 상세",
      profile: {
        industry: "제조업",
        workLocation: "A동",
        equipment: [],
        hazards: [],
      },
      analysis: {
        scenario: "시나리오",
        immediateActions: [],
        improvements: [],
        score: 0,
        level: "low",
        fatalityCases: [],
      },
      evidenceItems: [],
      lawActionItems: [],
    } as any);
  });

  it("applies saved company profile defaults to generated accident draft", async () => {
    vi.mocked(CompanyProfileService.getLatestProfile).mockResolvedValue({
      item: {
        businessNumber: "123-45-67890",
        managementNumber: "A-001",
        businessName: "리스크가드 본사",
        industry: "제조업",
        headquartersAddress: "서울시 중구 1",
      },
      source: "server",
    });

    render(
      <MemoryRouter initialEntries={["/forms/accident-report"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/작업\/사고 제목/), {
      target: { value: "지게차 충돌 사고" },
    });
    fireEvent.change(screen.getByLabelText("현재 작업 상황 / 사고 발생 내용 (필수)"), {
      target: { value: "작업자가 후진 중인 지게차와 충돌하여 넘어졌고, 즉시 응급조치를 시행함." },
    });
    fireEvent.click(screen.getByRole("button", { name: "AI 분석 및 서식 자동작성" }));

    await waitFor(() => {
      expect(screen.getByTestId("accident-business-name")).toHaveTextContent("리스크가드 본사");
    });
    expect(screen.getByTestId("accident-business-number")).toHaveTextContent("123-45-67890");
  });

  it("shows warning banner when company profile is missing", async () => {
    vi.mocked(CompanyProfileService.getLatestProfile).mockResolvedValue({
      item: null,
      source: "none",
    });

    render(
      <MemoryRouter initialEntries={["/forms/accident-report"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/작업\/사고 제목/), {
      target: { value: "지게차 충돌 사고" },
    });
    fireEvent.change(screen.getByLabelText("현재 작업 상황 / 사고 발생 내용 (필수)"), {
      target: { value: "작업자가 후진 중인 지게차와 충돌하여 넘어졌고, 즉시 응급조치를 시행함." },
    });
    fireEvent.click(screen.getByRole("button", { name: "AI 분석 및 서식 자동작성" }));

    await waitFor(() => {
      expect(screen.getByText("회사 정보가 등록되지 않아 사업장 고정값 자동입력을 적용하지 못했습니다.")).toBeInTheDocument();
    });
  });

  it("allows accident auto-fill with context only when title is empty", async () => {
    vi.mocked(CompanyProfileService.getLatestProfile).mockResolvedValue({
      item: null,
      source: "none",
    });

    render(
      <MemoryRouter initialEntries={["/forms/accident-report"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/작업\/사고 제목/), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("현재 작업 상황 / 사고 발생 내용 (필수)"), {
      target: { value: "지게차가 후진하던 중 작업자 팔 부위를 충격했고, 팔 통증과 타박이 발생해 즉시 작업을 중단했습니다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "AI 분석 및 서식 자동작성" }));

    await waitFor(() => {
      expect(analyzeTaskToAssessment).toHaveBeenCalledTimes(1);
    });
    const payload = vi.mocked(analyzeTaskToAssessment).mock.calls[0][0];
    expect(payload.taskName.length).toBeGreaterThan(0);
    expect(payload.taskDescription).toContain("지게차가 후진하던 중");
  });
});
