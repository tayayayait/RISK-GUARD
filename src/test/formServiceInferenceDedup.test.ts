import { describe, expect, it } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import { FormService } from "@/services/formService";

describe("FormService inferred risk narrative generation", () => {
  it("builds inferred rows without directly copying the raw situation phrase", () => {
    const assessment = createMockAssessment();
    assessment.taskName = "설비 점검";
    assessment.taskDescription =
      "이동식 사다리를 사용해 높은 곳 설비와 배관을 점검하는 작업 중 이동식 사다리 고정 미흡으로 작업자가 균형을 잃을 수 있는 상황";
    assessment.analysis.scenario = assessment.taskDescription;
    assessment.profile.hazards = [
      {
        id: "h-ladder-1",
        name: "사다리 점검 위험",
        type: "추락",
        weight: 26,
        confidence: "medium",
        reason: assessment.taskDescription,
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    const rawPhrase = "높은 곳 설비와 배관을 점검하는 작업";
    const signatures = rows.map((row) => `${row.cause}|${row.hazardFactor}`);

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(signatures.every((text) => !text.includes(rawPhrase))).toBe(true);
  });

  it("avoids selecting repeated mechanism rows from near-duplicate ladder hazards", () => {
    const assessment = createMockAssessment();
    assessment.taskName = "설비 점검";
    assessment.taskDescription =
      "이동식 사다리를 사용해 높은 곳의 설비와 배관을 점검하며, 고정 상태 확인 없이 반복 접근하는 상황";
    assessment.analysis.scenario = assessment.taskDescription;
    assessment.profile.hazards = [
      {
        id: "h-ladder-a",
        name: "이동식 사다리 사용 중 설비 점검 위험",
        type: "추락",
        weight: 30,
        confidence: "medium",
        reason: "이동식 사다리를 사용해 높은 곳의 설비와 배관을 점검하는 작업 중 사고 발생 가능",
      },
      {
        id: "h-ladder-b",
        name: "이동식 사다리 점검 작업 위험",
        type: "추락",
        weight: 29,
        confidence: "medium",
        reason: "이동식 사다리 점검 작업에서 사고가 발생할 수 있음",
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    const mechanismPattern = /(미흡|미착용|미준수|미확인|개방|불량|통제)/;
    const signatures = rows.map((row) => `${row.cause}|${row.hazardFactor}`);

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(rows.every((row) => mechanismPattern.test(`${row.cause} ${row.hazardFactor}`))).toBe(true);
  });
});
