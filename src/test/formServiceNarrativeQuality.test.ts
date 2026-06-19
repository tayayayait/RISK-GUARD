import { describe, expect, it } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import { FormService } from "@/services/formService";

const CAUSE_MIN = 18;
const CAUSE_MAX = 56;
const HAZARD_MIN = 12;
const HAZARD_MAX = 36;
const INCOMPLETE_ENDING_TOKENS = new Set([
  "및",
  "또는",
  "에서",
  "으로",
  "으로서",
  "하고",
  "하며",
  "중",
  "등",
]);

function endsWithIncompleteToken(text: string) {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }
  return INCOMPLETE_ENDING_TOKENS.has(tokens[tokens.length - 1]);
}

describe("FormService narrative quality for risk rows", () => {
  it("caps generated rows at 3 even for highly detailed accident descriptions", () => {
    const assessment = createMockAssessment();
    assessment.taskDescription =
      "설비 점검 작업에서 작업발판 고정이 미흡하고, 상부 자재 이송과 정비가 동시에 진행되며, 전원 차단 확인 없이 충전부 인접 작업을 수행하는 상황";
    assessment.profile.hazards = [
      { id: "h-1", name: "추락 위험", type: "추락", weight: 35, confidence: "high", reason: "작업발판 고정 미흡" },
      { id: "h-2", name: "낙하물 위험", type: "낙하물/비래", weight: 30, confidence: "medium", reason: "상부 자재 이송 동시 진행" },
      { id: "h-3", name: "끼임 위험", type: "끼임/말림", weight: 30, confidence: "medium", reason: "가동부 접근" },
      { id: "h-4", name: "감전 위험", type: "감전", weight: 30, confidence: "medium", reason: "전원 차단 미확인" },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);
  });

  it("keeps risk row count between 2 and 3 based on description detail", () => {
    const assessment = createMockAssessment();
    assessment.taskDescription =
      "설비 보수 작업 중 비계 난간 일부가 해체된 상태에서 몸을 기울여 점검하고, 발판이 미끄러운 조건에서 전원 인접 부위를 확인하는 상황";
    assessment.profile.hazards = [
      {
        id: "h-short-1",
        name: "작업발판 미끄럼",
        type: "추락",
        weight: 30,
        confidence: "high",
        reason: "발판 오염과 난간 해체",
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);
    for (const row of rows) {
      expect(row.cause.length).toBeGreaterThanOrEqual(CAUSE_MIN);
      expect(row.cause.length).toBeLessThanOrEqual(CAUSE_MAX);
      expect(row.hazardFactor.length).toBeGreaterThanOrEqual(HAZARD_MIN);
      expect(row.hazardFactor.length).toBeLessThanOrEqual(HAZARD_MAX);
      expect(endsWithIncompleteToken(row.cause)).toBe(false);
      expect(endsWithIncompleteToken(row.hazardFactor)).toBe(false);
    }
  });

  it("keeps cause/hazard narratives medium-length for table readability", () => {
    const assessment = createMockAssessment();
    assessment.profile.hazards = [
      {
        id: "h-long-1",
        name: "충전부 인접 접촉 위험",
        type: "감전",
        weight: 34,
        confidence: "high",
        reason: "절연 조치 미흡 상태에서 점검 수행",
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows[0].cause.length).toBeGreaterThanOrEqual(CAUSE_MIN);
    expect(rows[0].cause.length).toBeLessThanOrEqual(CAUSE_MAX);
    expect(rows[0].hazardFactor.length).toBeGreaterThanOrEqual(HAZARD_MIN);
    expect(rows[0].hazardFactor.length).toBeLessThanOrEqual(HAZARD_MAX);
    expect(endsWithIncompleteToken(rows[0].cause)).toBe(false);
    expect(endsWithIncompleteToken(rows[0].hazardFactor)).toBe(false);
  });

  it("applies common structural split for mixed accident factors", () => {
    const assessment = createMockAssessment();
    assessment.taskName = "설비 보수 중 복합사고";
    assessment.taskDescription =
      "현장에서 지게차와 보행 동선 분리가 미흡하고, 회전체 가드가 열린 상태에서 근접 점검을 하며, 전원 차단 확인 없이 작업을 수행하는 상황";
    assessment.profile.hazards = [
      {
        id: "h-mixed-1",
        name: "이동장비 충돌 및 끼임 감전 위험",
        type: "차량/이동장비 충돌",
        weight: 33,
        confidence: "high",
        reason: "동선 분리와 가드 복구, 전원 격리 동시 미흡",
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);
    const mergedNarratives = rows.map((row) => `${row.cause} ${row.hazardFactor}`).join("\n");
    expect(mergedNarratives).toMatch(/지게차|회전체|감전|충돌|끼임/);
    for (const row of rows) {
      expect(endsWithIncompleteToken(row.cause)).toBe(false);
      expect(endsWithIncompleteToken(row.hazardFactor)).toBe(false);
    }
  });

  it("keeps generated fallback narratives anchored to task context tokens", () => {
    const assessment = createMockAssessment();
    assessment.taskName = "Metal cutter operation";
    assessment.taskDescription =
      "Worker uses a metal cutter on steel plates while the guard is open and the hand stays near the blade during repetitive cutting work without explicit isolation checks for a prolonged shift cycle";
    assessment.analysis.scenario = assessment.taskDescription;
    assessment.profile.hazards = [
      {
        id: "h-anchor-1",
        name: "Open blade contact risk",
        type: "절단",
        weight: 24,
        confidence: "low",
        reason: assessment.taskDescription,
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    const anchorPattern = /(metal|cutter|steel|blade|cutting|isolation|prolonged|절단|안전조치|설비)/i;
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.controlIntent)).size).toBe(rows.length);
    for (const row of rows) {
      expect(anchorPattern.test(`${row.cause} ${row.hazardFactor}`)).toBe(true);
    }
  });

  it("does not introduce unrelated fall rows for non-fall context", () => {
    const assessment = createMockAssessment();
    assessment.taskName = "지게차 롤러 점검";
    assessment.taskDescription =
      "지게차 전진 이동 중 유도자 없이 근접 구역에서 주행하고 동시에 롤러 회전체 가드를 해체한 채 청소를 진행하여 충돌과 접촉 위험이 반복적으로 발생하는 조건";
    assessment.analysis.scenario = assessment.taskDescription;
    assessment.profile.hazards = [
      {
        id: "h-context-1",
        name: "지게차 충돌 위험",
        type: "차량/이동장비 충돌",
        weight: 28,
        confidence: "low",
        reason: assessment.taskDescription,
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(rows.some((row) => /추락/.test(`${row.cause} ${row.hazardFactor}`))).toBe(false);
  });

  it("splits mixed context into multiple plausible mechanism families", () => {
    const assessment = createMockAssessment();
    assessment.taskName = "분전반 점검 및 자재 절단";
    assessment.taskDescription =
      "분전반 내부 배선 점검 중 전원 차단 미확인 상태에서 충전부가 노출되어 감전 위험이 있고, " +
      "동시에 작업발판 고정이 미흡해 추락 위험이 있으며, 절단기 방호장치를 해체한 채 자재 절단 작업을 진행하는 상황";
    assessment.analysis.scenario = assessment.taskDescription;
    assessment.profile.hazards = [
      {
        id: "h-mixed-mechanism",
        name: "복합 위험",
        type: "감전",
        weight: 34,
        confidence: "medium",
        reason: assessment.taskDescription,
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);

    const merged = rows.map((row) => `${row.cause} ${row.hazardFactor}`).join("\n");
    const matchedFamilies = [
      /(감전|충전부|전원|절연)/.test(merged),
      /(추락|작업발판|비계|난간)/.test(merged),
      /(절단|칼날|커팅|방호장치)/.test(merged),
    ].filter(Boolean).length;
    expect(matchedFamilies).toBeGreaterThanOrEqual(2);

    const signatures = rows.map((row) => `${row.cause}|${row.hazardFactor}`);
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});
