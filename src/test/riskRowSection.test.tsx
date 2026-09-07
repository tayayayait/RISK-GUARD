import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssessment } from "@/contexts/AssessmentContext";
import { RiskRowSection } from "@/components/assessment/RiskRowSection";
import { createMockAssessment } from "@/data/mockData";
import { applyRiskFieldsToRows } from "@/lib/riskRowAcceptability";
import type { RiskAssessmentRow } from "@/types/formTemplate";

vi.mock("@/contexts/AssessmentContext", () => ({
  useAssessment: vi.fn(),
}));

const baseRow: RiskAssessmentRow = {
  workProcess: "외벽 도장",
  category: "추락",
  cause: "발판 미고정",
  hazardFactor: "고소 작업 중 추락",
  legalBasis: "",
  currentMeasure: "안전대 착용",
  frequency: 3,
  severity: 4,
  riskLevel: "12(보통)",
  reductionMeasure: "안전난간 설치",
};

function mountWithRows(rows: RiskAssessmentRow[]) {
  const updateRiskRow = vi.fn();
  vi.mocked(useAssessment).mockReturnValue({
    assessment: { ...createMockAssessment(), riskRows: rows },
    updateRiskRow,
  } as never);

  render(<RiskRowSection />);
  return { updateRiskRow };
}

describe("RiskRowSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("허용 가능 여부를 행마다 보여준다", () => {
    mountWithRows(applyRiskFieldsToRows([baseRow]));

    const select = screen.getByLabelText("허용여부-1") as HTMLSelectElement;
    expect(select.value).toBe("not_acceptable");
  });

  it("개선 후 위험성을 보여준다", () => {
    mountWithRows(applyRiskFieldsToRows([baseRow]));

    expect(screen.getByTestId("post-risk-level-0").textContent).toBe("8(보통)");
    expect((screen.getByLabelText("개선후가능성-1") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("개선후중대성-1") as HTMLInputElement).value).toBe("4");
  });

  it("이행 상태를 행마다 선택할 수 있다", () => {
    const { updateRiskRow } = mountWithRows(applyRiskFieldsToRows([baseRow]));

    const statusSelect = screen.getByLabelText("이행상태-1");
    expect((statusSelect as HTMLSelectElement).value).toBe("planned");

    fireEvent.change(statusSelect, { target: { value: "done" } });
    expect(updateRiskRow).toHaveBeenCalledWith(0, { improvementStatus: "done" });
  });

  it("담당자와 개선일을 편집하면 해당 행만 갱신한다", () => {
    const { updateRiskRow } = mountWithRows(applyRiskFieldsToRows([baseRow, baseRow]));

    fireEvent.change(screen.getByLabelText("담당자-2"), { target: { value: "김안전" } });
    expect(updateRiskRow).toHaveBeenCalledWith(1, { responsiblePerson: "김안전" });

    fireEvent.change(screen.getByLabelText("개선일-2"), { target: { value: "2026-08-25" } });
    expect(updateRiskRow).toHaveBeenCalledWith(1, { improvementDate: "2026-08-25" });
  });

  it("허용 불가인데 감소대책이 비어 있으면 경고한다", () => {
    mountWithRows(applyRiskFieldsToRows([{ ...baseRow, reductionMeasure: "" }]));

    expect(screen.getByTestId("risk-row-unresolved-warning").textContent).toContain("1건");
  });

  it("감소대책이 채워져 있으면 경고하지 않는다", () => {
    mountWithRows(applyRiskFieldsToRows([baseRow]));

    expect(screen.queryByTestId("risk-row-unresolved-warning")).toBeNull();
  });

  it("미완료 개선대책 건수를 보여준다", () => {
    mountWithRows(
      applyRiskFieldsToRows([baseRow, { ...baseRow, improvementStatus: "done" }]),
    );

    expect(screen.getByTestId("risk-row-section").textContent).toContain("미완료 개선대책 1건");
  });
});
