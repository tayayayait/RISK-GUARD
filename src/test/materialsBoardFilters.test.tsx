import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MaterialsBoard from "@/pages/MaterialsBoard";
import { createMockAssessment } from "@/data/mockData";
import type { MaterialItem, MaterialSearchFilters } from "@/types/assessment";
import type { ReactNode } from "react";

const navigateMock = vi.fn();
const setCurrentStepMock = vi.fn();
const selectMaterialMock = vi.fn();
const reloadMaterialsMock = vi.fn(async (_filters?: MaterialSearchFilters) => undefined);
const generateReportMock = vi.fn();

function buildMaterial(index: number): MaterialItem {
  return {
    id: `mat-${index}`,
    type: "OPS",
    title: `테스트 자료 ${index}`,
    url: `https://example.com/${index}`,
    language: "한국어",
    relevance: 100 - index,
    recommendReason: "테스트 추천 사유",
    selected: false,
    excluded: false,
  };
}

const baseAssessment = {
  ...createMockAssessment(),
  materials: [buildMaterial(1)],
  selectedMaterials: [],
  apiStatuses: {
    ...createMockAssessment().apiStatuses,
    materials: "success" as const,
  },
};

let assessmentMock = baseAssessment;

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
    selectMaterial: selectMaterialMock,
    reloadMaterials: reloadMaterialsMock,
    generateReport: generateReportMock,
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

describe("MaterialsBoard filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assessmentMock = {
      ...baseAssessment,
      materials: [buildMaterial(1)],
    };
  });

  it("sends full-search payload with scopes", async () => {
    render(<MaterialsBoard />);

    fireEvent.click(screen.getByTestId("materials-tab-search"));
    fireEvent.change(screen.getByTestId("materials-keyword-input"), {
      target: { value: "추락" },
    });
    fireEvent.click(screen.getByTestId("materials-search-button"));

    await waitFor(() => {
      expect(reloadMaterialsMock).toHaveBeenCalledWith({
        keyword: "추락",
        priorityMode: "즉시교육",
        industryScope: "all",
        hazardScope: "all",
      });
    });
  });

  it("resets filters to default full-search query", async () => {
    render(<MaterialsBoard />);

    fireEvent.click(screen.getByTestId("materials-tab-search"));
    const input = screen.getByTestId("materials-keyword-input");
    fireEvent.change(input, { target: { value: "감전" } });
    expect(input).toHaveValue("감전");

    fireEvent.click(screen.getByTestId("materials-reset-button"));

    await waitFor(() => {
      expect(reloadMaterialsMock).toHaveBeenCalledWith({
        priorityMode: "즉시교육",
        industryScope: "all",
        hazardScope: "all",
      });
    });
    expect(input).toHaveValue("");
  });

  it("shows 10 items per page and supports page navigation", async () => {
    assessmentMock = {
      ...baseAssessment,
      materials: Array.from({ length: 12 }, (_, index) => buildMaterial(index + 1)),
    };

    render(<MaterialsBoard />);

    expect(screen.getByText("테스트 자료 1")).toBeInTheDocument();
    expect(screen.getByText("테스트 자료 10")).toBeInTheDocument();
    expect(screen.queryByText("테스트 자료 11")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("materials-page-2"));

    expect(screen.getByText("테스트 자료 11")).toBeInTheDocument();
    expect(screen.getByText("테스트 자료 12")).toBeInTheDocument();
    expect(screen.queryByText("테스트 자료 1")).not.toBeInTheDocument();
  });
});
