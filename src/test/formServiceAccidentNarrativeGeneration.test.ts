import { describe, expect, it } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import { FormService } from "@/services/formService";

function buildAccidentAssessmentFixture() {
  const assessment = createMockAssessment();
  assessment.taskName = "철재 절단 작업 중 손 끼임 사고";
  assessment.taskDescription =
    "철재 자재를 절단기 쪽으로 이동시키는 작업 중 작업자 1명의 손이 장비와 자재 사이에 끼이는 사고가 발생하였다. "
    + "절단기 가동이 완전히 정지되지 않은 상태에서 자재 위치를 손으로 맞추었고, 주변 작업자와의 신호 전달이 지연되어 비상정지 대응이 늦었다.";
  assessment.analysis.scenario =
    "절단기 주변에서 자재 이송 중 손이 장비와 자재 사이에 끼였고, 작업 중지 조치가 지연되어 부상이 발생하였다.";
  assessment.profile.hazards = [
    {
      id: "hazard-1",
      name: "회전부 근접접촉 통제 미흡",
      type: "끼임/말림",
      weight: 33,
      confidence: "high",
      reason: "절단기 가동 상태에서 자재 위치를 손으로 조정하는 과정에서 근접접촉 통제가 미흡하였다",
    },
    {
      id: "hazard-2",
      name: "신호체계 미준수",
      type: "끼임/말림",
      weight: 28,
      confidence: "medium",
      reason: "작업자 간 신호 전달이 지연되어 비상정지 시점이 늦어졌다",
    },
  ];
  assessment.analysis.improvements = [
    {
      id: "improvement-1",
      action: "절단 설비 정비 및 자재 위치조정 작업은 전원 차단과 잠금표지 절차를 선행",
      category: "관리",
    },
    {
      id: "improvement-2",
      action: "작업 시작 전 역할 분담과 비상정지 신호 기준을 TBM으로 공유",
      category: "관리",
    },
    {
      id: "improvement-3",
      action: "관리감독자가 보호구 착용 및 방호장치 상태를 교대별 점검 기록",
      category: "관리",
    },
  ];

  return assessment;
}

describe("FormService accident-report narrative generation", () => {
  it("generates situation/cause/prevention texts in report-ready Korean narrative style", () => {
    const report = FormService.mapAssessmentToAccidentReport(buildAccidentAssessmentFixture());

    expect(report.accidentDetails.workType).toMatch(/절단|작업|자재/);
    expect(report.accidentDetails.workType).not.toMatch(/[.!?]$/);

    expect(report.accidentDetails.situation).toMatch(/절단|자재|끼이|사고/);
    expect(report.accidentDetails.situation).toMatch(/[.]$/);

    expect(report.accidentDetails.cause.length).toBeGreaterThanOrEqual(2);
    expect(report.accidentDetails.cause.length).toBeLessThanOrEqual(4);
    expect(new Set(report.accidentDetails.cause).size).toBe(report.accidentDetails.cause.length);
    for (const cause of report.accidentDetails.cause) {
      expect(cause).toMatch(/사고|원인|통제/);
      expect(cause).toMatch(/[.]$/);
    }

    const preventionLines = report.preventionPlan.plan.split("\n").filter(Boolean);
    expect(preventionLines).toHaveLength(3);
    preventionLines.forEach((line, index) => {
      expect(line).toMatch(new RegExp(`^${index + 1}\\.\\s`));
      expect(line).toMatch(/[.]$/);
    });
  });

  it("uses fallback prevention plan template when improvements are empty", () => {
    const assessment = buildAccidentAssessmentFixture();
    assessment.analysis.improvements = [];

    const report = FormService.mapAssessmentToAccidentReport(assessment);
    const preventionLines = report.preventionPlan.plan.split("\n").filter(Boolean);

    expect(preventionLines).toHaveLength(3);
    expect(report.preventionPlan.plan).toMatch(/TBM|잠금표지|점검|보호구/);
  });

  it("keeps accident cause lines distinct from the situation summary", () => {
    const report = FormService.mapAssessmentToAccidentReport(buildAccidentAssessmentFixture());

    expect(report.accidentDetails.cause.length).toBeGreaterThan(0);
    report.accidentDetails.cause.forEach((cause) => {
      expect(cause).not.toBe(report.accidentDetails.situation);
    });
  });
});
