import { describe, expect, it } from "vitest";
import {
  applyRiskFields,
  applyRiskFieldsToRows,
  estimatePostRisk,
  findUnresolvedRows,
  formatRiskLevel,
  resolveAcceptability,
  resolveFrequencyReductionStep,
  toRiskLabel,
} from "@/lib/riskRowAcceptability";
import type { RiskAssessmentRow } from "@/types/formTemplate";

function buildRow(seed: Partial<RiskAssessmentRow> = {}): RiskAssessmentRow {
  return {
    workProcess: "외벽 도장",
    category: "추락",
    cause: "비계 발판 미고정",
    hazardFactor: "고소 작업 중 추락",
    legalBasis: "",
    currentMeasure: "안전대 착용",
    frequency: 3,
    severity: 4,
    riskLevel: "",
    reductionMeasure: "작업발판 고정 및 안전난간 설치",
    ...seed,
  };
}

describe("위험성 등급 임계값", () => {
  it("서식센터 표와 동일한 임계값을 유지한다", () => {
    expect(toRiskLabel(15)).toBe("높음");
    expect(toRiskLabel(14)).toBe("보통");
    expect(toRiskLabel(6)).toBe("보통");
    expect(toRiskLabel(5)).toBe("낮음");
  });

  it("위험성 표기를 '점수(등급)' 형식으로 만든다", () => {
    expect(formatRiskLevel(3, 4)).toBe("12(보통)");
    expect(formatRiskLevel(5, 5)).toBe("25(높음)");
    expect(formatRiskLevel(1, 2)).toBe("2(낮음)");
  });

  it("1~5 범위를 벗어난 입력을 보정한다", () => {
    expect(formatRiskLevel(0, 9)).toBe("5(낮음)");
    expect(formatRiskLevel(99, 99)).toBe("25(높음)");
  });
});

describe("허용 가능 여부 결정 (시행규칙 제37조제1항제2호)", () => {
  it("낮음 등급만 허용 가능으로 판정한다", () => {
    expect(resolveAcceptability(1, 2).acceptability).toBe("acceptable");
    expect(resolveAcceptability(2, 3).acceptability).toBe("not_acceptable");
    expect(resolveAcceptability(4, 5).acceptability).toBe("not_acceptable");
  });

  it("판단 근거 문구에 점수와 등급을 담는다", () => {
    expect(resolveAcceptability(1, 2).acceptabilityBasis).toContain("2점(낮음)");
    expect(resolveAcceptability(5, 4).acceptabilityBasis).toContain("20점(높음)");
  });
});

describe("개선 후 위험성 추정", () => {
  it("감소대책이 없으면 위험성이 그대로 남는다", () => {
    const estimate = estimatePostRisk(3, 4, "", undefined);
    expect(estimate.postFrequency).toBe(3);
    expect(estimate.postSeverity).toBe(4);
    expect(estimate.postRiskLevel).toBe("12(보통)");
  });

  it("중대성(강도)은 기본적으로 낮추지 않는다", () => {
    const estimate = estimatePostRisk(3, 4, "안전난간 설치", "structural_support");
    expect(estimate.postSeverity).toBe(4);
  });

  it("공학적 대책이 관리적 대책보다 가능성을 더 낮춘다", () => {
    expect(resolveFrequencyReductionStep("equipment_guard")).toBe(2);
    expect(resolveFrequencyReductionStep("energy_isolation")).toBe(2);
    expect(resolveFrequencyReductionStep("operating_procedure")).toBe(1);
    expect(resolveFrequencyReductionStep("ppe")).toBe(1);
    expect(resolveFrequencyReductionStep(undefined)).toBe(1);
  });

  it("가능성이 1 미만으로 내려가지 않는다", () => {
    const estimate = estimatePostRisk(1, 5, "방호덮개 설치", "equipment_guard");
    expect(estimate.postFrequency).toBe(1);
  });
});

describe("applyRiskFields", () => {
  it("허용 여부와 개선 후 위험성을 채운다", () => {
    const row = applyRiskFields(buildRow());

    expect(row.riskLevel).toBe("12(보통)");
    expect(row.acceptability).toBe("not_acceptable");
    expect(row.acceptabilityBasis).toContain("12점(보통)");
    expect(row.postRiskLevel).toBe("8(보통)");
    expect(row.postAcceptability).toBe("not_acceptable");
  });

  it("평가자가 입력한 값을 덮어쓰지 않는다", () => {
    const row = applyRiskFields(
      buildRow({
        acceptability: "acceptable",
        acceptabilityBasis: "현장 확인 결과 허용 가능",
        postFrequency: 1,
        postSeverity: 2,
      }),
    );

    expect(row.acceptability).toBe("acceptable");
    expect(row.acceptabilityBasis).toBe("현장 확인 결과 허용 가능");
    expect(row.postRiskLevel).toBe("2(낮음)");
    expect(row.postAcceptability).toBe("acceptable");
  });

  it("과거 하드코딩 값 'low'를 재계산한다", () => {
    const row = applyRiskFields(buildRow({ postRiskLevel: "low" }));
    expect(row.postRiskLevel).toBe("8(보통)");
  });

  it("완료일이 있으면 이행 상태를 done으로 본다", () => {
    expect(applyRiskFields(buildRow({ completionDate: "2026-08-20" })).improvementStatus).toBe("done");
    expect(applyRiskFields(buildRow()).improvementStatus).toBe("planned");
  });

  it("명시된 이행 상태를 유지한다", () => {
    const row = applyRiskFields(buildRow({ improvementStatus: "in_progress" }));
    expect(row.improvementStatus).toBe("in_progress");
  });

  it("여러 행을 일괄 처리한다", () => {
    const rows = applyRiskFieldsToRows([buildRow(), buildRow({ frequency: 1, severity: 2 })]);
    expect(rows[0].acceptability).toBe("not_acceptable");
    expect(rows[1].acceptability).toBe("acceptable");
  });
});

describe("findUnresolvedRows", () => {
  it("허용 불가인데 감소대책이 비어 있는 행을 찾는다", () => {
    const rows = applyRiskFieldsToRows([
      buildRow({ reductionMeasure: "" }),
      buildRow(),
      buildRow({ frequency: 1, severity: 2, reductionMeasure: "" }),
    ]);

    const unresolved = findUnresolvedRows(rows);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].index).toBe(0);
  });
});
