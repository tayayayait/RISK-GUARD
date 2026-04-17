import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RiskAssessmentTable } from "@/components/forms/RiskAssessmentTable";
import type { RiskAssessmentRow } from "@/types/formTemplate";

function createRow(seed: Partial<RiskAssessmentRow> = {}): RiskAssessmentRow {
  return {
    workProcess: "설비 점검",
    category: "기계적 요인",
    cause: "체결 상태 점검 미흡",
    hazardFactor: "접촉 충돌 위험 증가",
    legalBasis: "",
    currentMeasure: "작업 구역을 점검한다.",
    frequency: 3,
    severity: 2,
    riskLevel: "6(보통)",
    reductionMeasure: "개선 조치를 시행한다.",
    improvementDate: "",
    completionDate: "",
    responsiblePerson: "",
    ...seed,
  };
}

describe("RiskAssessmentTable layout", () => {
  it("renders add-row button and propagates callback", () => {
    const onChange = vi.fn();
    const onAddRow = vi.fn();
    const onReclassifyCategories = vi.fn();
    const onAddRiskWithAi = vi.fn();

    render(
      <RiskAssessmentTable
        data={[createRow()]}
        onChange={onChange}
        onAddRow={onAddRow}
        onReclassifyCategories={onReclassifyCategories}
        onAddRiskWithAi={onAddRiskWithAi}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);

    expect(onReclassifyCategories).toHaveBeenCalledTimes(0);
    expect(onAddRiskWithAi).toHaveBeenCalledTimes(0);
    expect(onAddRow).toHaveBeenCalledTimes(1);

    const [categorySelect] = screen.getAllByRole("combobox");
    fireEvent.change(categorySelect, { target: { value: "관리적 요인" } });
    expect(onChange).toHaveBeenCalledWith(0, "category", "관리적 요인");
  });

  it("hides action buttons in readOnly mode", () => {
    render(
      <RiskAssessmentTable
        data={[createRow()]}
        onChange={vi.fn()}
        onAddRow={vi.fn()}
        onAddRiskWithAi={vi.fn()}
        onMatchLegalBasisWithAi={vi.fn()}
        onReclassifyCategories={vi.fn()}
        readOnly
      />,
    );

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("does not render AI add button even when AI props are provided", () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <RiskAssessmentTable
        data={[createRow()]}
        onChange={onChange}
        onAddRiskWithAi={vi.fn()}
        disableAddRiskWithAi
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <RiskAssessmentTable
        data={[createRow()]}
        onChange={onChange}
        onAddRiskWithAi={vi.fn()}
        isAddingRiskWithAi
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows legal-basis review marker when legal basis is empty but review is required", () => {
    render(
      <RiskAssessmentTable
        data={[createRow({ legalBasis: "" })]}
        onChange={vi.fn()}
        legalBasisReviewRequiredByRow={[true]}
      />,
    );

    expect(screen.getByPlaceholderText("검토 필요")).toBeInTheDocument();
  });

  it("shows review badge and highlights failed cells when validationStatus is review_required", () => {
    render(
      <RiskAssessmentTable
        data={[
          createRow({
            validationStatus: "review_required",
            reviewRequiredFields: ["currentMeasure", "reductionMeasure"],
            reviewReasonCodes: ["current_measure_mismatch", "reduction_measure_mismatch"],
          }),
        ]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("검토 필요")).toBeInTheDocument();

    const currentCell = screen.getByLabelText("현재조치-1").closest("td");
    const reductionCell = screen.getByLabelText("감소대책-1").closest("td");
    expect(currentCell?.className).toContain("bg-warning-050/50");
    expect(reductionCell?.className).toContain("bg-warning-050/50");
  });

  it("renders legal-match button and propagates callback", () => {
    const onMatchLegalBasisWithAi = vi.fn();

    render(
      <RiskAssessmentTable
        data={[createRow()]}
        onChange={vi.fn()}
        onMatchLegalBasisWithAi={onMatchLegalBasisWithAi}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "AI로 적합한 법령 찾기" }));
    expect(onMatchLegalBasisWithAi).toHaveBeenCalledTimes(1);
  });

  it("disables legal-match button while matching", () => {
    render(
      <RiskAssessmentTable
        data={[createRow()]}
        onChange={vi.fn()}
        onMatchLegalBasisWithAi={vi.fn()}
        isMatchingLegalBasis
      />,
    );

    const button = screen.getByRole("button", { name: "법령 매칭 중..." });
    expect(button).toBeDisabled();
  });
});
