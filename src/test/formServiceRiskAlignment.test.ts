import { describe, expect, it } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import { FormService, type RiskLawContext } from "@/services/formService";

const ELECTRICAL_SIGNAL_PATTERN = /(감전|충전부|전원|분전반|배전반|배선|전선|절연|차단기)/;
const FALL_SIGNAL_PATTERN = /(추락|비계|발판|난간|안전대)/;
const MEASURE_ANCHOR_PATTERN = /(감전|충전부|전원|전선|배선|차단기|절연|누전|분전반|배전반)/;
const ELECTRICAL_MECHANISM_TOKENS = ["충전부", "차단기", "배선", "전선", "분전반", "배전반", "절연", "전원", "누전", "접지"];

function toElectricalMechanismSignature(text: string) {
  const equipment = text.match(/(충전부|차단기|배선|전선|분전반|배전반|절연)/)?.[1] ?? "none";
  const action = text.match(/(점검·정비 작업|전기 작업|점검 작업)/)?.[1] ?? "none";
  const failure =
    text.match(/(전원 격리 미확인|충전부 노출|절연 상태 불량|접지 점검 미흡|안전조치 미흡|근접접촉 통제 미흡|방호장치 개방)/)?.[1]
    ?? "none";
  const risk = text.match(/(감전|누전)/)?.[1] ?? "none";
  return `${equipment}|${action}|${failure}|${risk}`;
}

function buildElectricalAssessment() {
  const assessment = createMockAssessment();
  assessment.taskName = "분전반 점검 및 배선 교체";
  assessment.taskDescription =
    "분전반 내부 충전부 노출 상태를 점검하고 손상된 배선과 차단기를 교체하는 작업이다.";
  assessment.analysis.scenario = assessment.taskDescription;
  assessment.profile.industry = "제조업";
  assessment.profile.workLocation = "배전실";
  assessment.profile.equipment = ["분전반", "배선", "차단기"];
  assessment.profile.hazards = [
    {
      id: "h-electric-1",
      name: "충전부 노출로 인한 감전 위험",
      type: "감전",
      weight: 34,
      confidence: "high",
      reason: "전원 차단 확인 미흡 상태에서 충전부 접촉이 발생하면 감전 사고가 발생할 수 있음",
    },
  ];
  assessment.analysis.immediateActions = [
    { id: "a-1", action: "비계와 작업발판 고정 상태를 점검한다.", priority: 1 },
    { id: "a-2", action: "전원 차단 후 충전부 노출 구간 접근을 통제한다.", priority: 2 },
  ];
  assessment.analysis.improvements = [
    { id: "i-1", action: "비계 난간 보강 계획을 수립한다.", category: "시설" },
    { id: "i-2", action: "잠금표지 절차를 적용하고 전원 차단 확인 기록을 남긴다.", category: "관리" },
  ];
  return assessment;
}

function buildVehicleCollisionAssessment() {
  const assessment = createMockAssessment();
  assessment.taskName = "자재 운반";
  assessment.taskDescription =
    "지게차 운반 동선과 보행자 통로가 겹치고, 후진 구간 유도자 배치 없이 자재를 이송하는 작업이다. " +
    "협소 구간에서 자재 적치 상태가 불안정해 작업자 근접접촉 위험이 반복된다.";
  assessment.analysis.scenario = assessment.taskDescription;
  assessment.profile.industry = "물류업";
  assessment.profile.workLocation = "자재 야드";
  assessment.profile.equipment = ["지게차", "운반차량", "적치대"];
  assessment.profile.hazards = [
    {
      id: "h-vehicle-1",
      name: "동선 분리 미흡으로 이동장비 충돌 위험 증가",
      type: "차량/이동장비 충돌",
      weight: 32,
      confidence: "high",
      reason: "자재 운반 동선과 보행자 통로 분리가 미흡하면 이동장비 충돌 사고가 발생할 수 있음",
    },
    {
      id: "h-vehicle-2",
      name: "유도자 미배치로 후진 구간 충돌 위험 증가",
      type: "차량/이동장비 충돌",
      weight: 30,
      confidence: "medium",
      reason: "유도자 없이 후진 운행 시 작업자와 차량 사이 근접접촉이 발생하면 충돌 사고가 발생할 수 있음",
    },
    {
      id: "h-vehicle-3",
      name: "협소 구간 적치 불량으로 근접접촉 위험 증가",
      type: "차량/이동장비 충돌",
      weight: 28,
      confidence: "medium",
      reason: "협소 구간에서 적치 자재가 돌출된 상태로 운반하면 작업자 근접접촉 충돌이 발생할 수 있음",
    },
  ];
  assessment.analysis.immediateActions = [
    { id: "a-v-1", action: "현장 통제 상태를 점검한다.", priority: 1 },
    { id: "a-v-2", action: "현장 통제 상태를 점검한다.", priority: 2 },
    { id: "a-v-3", action: "현장 통제 상태를 점검한다.", priority: 3 },
  ];
  assessment.analysis.improvements = [
    { id: "i-v-1", action: "추가 개선 조치를 시행한다.", category: "관리" },
    { id: "i-v-2", action: "추가 개선 조치를 시행한다.", category: "시설" },
    { id: "i-v-3", action: "추가 개선 조치를 시행한다.", category: "관리" },
  ];
  return assessment;
}

function buildCollapseAssessment() {
  const assessment = createMockAssessment();
  assessment.taskName = "동바리 상태 점검";
  assessment.taskDescription =
    "콘크리트 타설 전 동바리 지지 상태와 하중 집중 구간을 점검하는 작업이다.";
  assessment.analysis.scenario = assessment.taskDescription;
  assessment.profile.industry = "건설업";
  assessment.profile.workLocation = "구조물 내부";
  assessment.profile.equipment = ["동바리", "지지대"];
  assessment.profile.hazards = [
    {
      id: "h-collapse-1",
      name: "동바리 지지력 부족으로 구조물 붕괴 위험 증가",
      type: "붕괴",
      weight: 32,
      confidence: "high",
      reason: "동바리 지지 상태가 불량한 구간에 하중이 집중되면 구조물 붕괴 사고가 발생할 수 있음",
    },
  ];
  assessment.analysis.immediateActions = [
    { id: "a-c-1", action: "동바리 지지 상태를 점검한다.", priority: 1 },
  ];
  assessment.analysis.improvements = [
    { id: "i-c-1", action: "하중 집중 구간의 동바리를 보강한다.", category: "시설" },
  ];
  return assessment;
}

function buildElectricalLawContext(): RiskLawContext {
  return {
    workTokens: ["분전반", "배선", "점검", "차단기", "교체"],
    equipmentTokens: ["분전반", "배선", "차단기", "충전부"],
    lawItems: [
      {
        id: "law-storage-301",
        type: "law",
        sourceBadge: "법령",
        title: "제301조(전기기계·기구 등의 충전부 방호)",
        relevanceScore: 98,
        summaryBullets: ["충전부 방호와 접근 통제 기준"],
        keywords: ["감전", "충전부", "전원", "절연"],
        sourceType: "storage",
        legalBasis: "산업안전보건기준에 관한 규칙 제301조(전기기계·기구 등의 충전부 방호)",
        articleNumber: "제301조",
      } as any,
      {
        id: "law-storage-56",
        type: "law",
        sourceBadge: "법령",
        title: "제56조(작업발판의 구조)",
        relevanceScore: 98,
        summaryBullets: ["작업발판 구조 기준"],
        keywords: ["추락", "비계", "작업발판"],
        sourceType: "storage",
        legalBasis: "산업안전보건기준에 관한 규칙 제56조(작업발판의 구조)",
        articleNumber: "제56조",
      } as any,
    ],
    lawActionItems: [],
  };
}

describe("FormService risk row alignment", () => {
  it("keeps 2~3 generated rows within electrical mechanism for electrical panel work", () => {
    const rows = FormService.mapAssessmentToRiskForm(buildElectricalAssessment(), {
      lawItems: [],
      lawActionItems: [],
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);

    for (const row of rows) {
      const narrative = `${row.cause} ${row.hazardFactor}`;
      expect(ELECTRICAL_SIGNAL_PATTERN.test(narrative)).toBe(true);
      expect(FALL_SIGNAL_PATTERN.test(narrative)).toBe(false);
    }
  });

  it("rewrites measures to stay aligned with row hazard signals", () => {
    const rows = FormService.mapAssessmentToRiskForm(buildElectricalAssessment(), {
      lawItems: [],
      lawActionItems: [],
    });

    for (const row of rows) {
      const measureText = `${row.currentMeasure} ${row.reductionMeasure}`;
      expect(ELECTRICAL_SIGNAL_PATTERN.test(measureText)).toBe(true);
      expect(FALL_SIGNAL_PATTERN.test(measureText)).toBe(false);
    }
  });

  it("does not treat '작업자 전원 확인' phrasing as electrical evidence in fall-oriented measures", () => {
    const assessment = buildElectricalAssessment();
    assessment.analysis.immediateActions = [
      { id: "a-conflict-1", action: "안전대 및 추락방지 보호구 착용 상태를 전원 확인한다.", priority: 1 },
    ];
    assessment.analysis.improvements = [
      { id: "i-conflict-1", action: "누전차단기 정격 감도를 재설정하고 정기 시험을 실시한다.", category: "관리" },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    for (const row of rows) {
      const measureText = `${row.currentMeasure} ${row.reductionMeasure}`;
      expect(ELECTRICAL_SIGNAL_PATTERN.test(measureText)).toBe(true);
      expect(FALL_SIGNAL_PATTERN.test(measureText)).toBe(false);
      expect(row.currentMeasure).not.toContain("전원 확인");
    }
  });

  it("maps legal basis to electrical articles and excludes fall articles", () => {
    const rows = FormService.mapAssessmentToRiskForm(
      buildElectricalAssessment(),
      buildElectricalLawContext(),
    );

    const legalBases = rows.map((row) => row.legalBasis).filter(Boolean);
    expect(legalBases.length).toBeGreaterThan(0);
    expect(legalBases.some((item) => item.includes("제56조"))).toBe(false);
    expect(legalBases.every((item) => item.includes("제301조"))).toBe(true);
  });

  it("fills 2~3 rows by varying electrical sub-mechanisms instead of unrelated hazard types", () => {
    const assessment = buildElectricalAssessment();
    assessment.profile.hazards = [
      {
        id: "h-electric-single",
        name: "차단기 교체 중 감전 위험",
        type: "감전",
        weight: 30,
        confidence: "medium",
        reason: "차단기 단자부 점검 중 충전부 접촉 통제가 미흡하면 감전 사고가 발생할 수 있음",
      },
    ];

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThanOrEqual(3);
    for (const row of rows) {
      const rowText = `${row.cause} ${row.hazardFactor} ${row.currentMeasure} ${row.reductionMeasure}`;
      expect(ELECTRICAL_SIGNAL_PATTERN.test(rowText)).toBe(true);
      expect(FALL_SIGNAL_PATTERN.test(rowText)).toBe(false);
    }
  });

  it("keeps current/reduction measures concise and anchored to row mechanism tokens", () => {
    const rows = FormService.mapAssessmentToRiskForm(buildElectricalAssessment(), {
      lawItems: [],
      lawActionItems: [],
    });

    for (const row of rows) {
      expect(row.currentMeasure.length).toBeLessThanOrEqual(60);
      expect(row.reductionMeasure.length).toBeLessThanOrEqual(60);
      expect(MEASURE_ANCHOR_PATTERN.test(row.currentMeasure)).toBe(true);
      expect(MEASURE_ANCHOR_PATTERN.test(row.reductionMeasure)).toBe(true);
    }
  });

  it("prefers 3 rows and keeps electrical row mechanisms distinct for detailed electrical work", () => {
    const assessment = buildElectricalAssessment();
    assessment.taskDescription =
      "분전반 점검 작업에서 전원 차단 확인이 누락된 상태로 충전부 인접 점검을 수행하고, " +
      "손상된 배선 절연 구간을 교체하며, 접지 상태를 확인하지 않고 차단기 단자부를 정비하는 작업이다.";
    assessment.analysis.scenario = assessment.taskDescription;

    const rows = FormService.mapAssessmentToRiskForm(assessment, {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows).toHaveLength(3);
    const mechanismSignatures = rows.map((row) =>
      toElectricalMechanismSignature(`${row.cause} ${row.hazardFactor}`));
    expect(new Set(mechanismSignatures).size).toBe(rows.length);

    for (const row of rows) {
      const narrativeText = `${row.cause} ${row.hazardFactor}`;
      const measureText = `${row.currentMeasure} ${row.reductionMeasure}`;
      expect(ELECTRICAL_SIGNAL_PATTERN.test(narrativeText)).toBe(true);
      const rowAnchors = ELECTRICAL_MECHANISM_TOKENS.filter((token) => narrativeText.includes(token));
      const expectedAnchors = rowAnchors.length > 0 ? rowAnchors : ["감전"];
      expect(expectedAnchors.some((token) => measureText.includes(token))).toBe(true);
    }
  });

  it("generates row-specific current/reduction measures without repeated phrasing for vehicle collision rows", () => {
    const rows = FormService.mapAssessmentToRiskForm(buildVehicleCollisionAssessment(), {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows).toHaveLength(3);
    const controlIntents = rows.map((row) => row.controlIntent);
    expect(controlIntents.every(Boolean)).toBe(true);
    expect(new Set(controlIntents).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.currentMeasure)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.reductionMeasure)).size).toBe(rows.length);

    for (const row of rows) {
      expect(row.currentMeasure).not.toEqual(row.reductionMeasure);
      const rowNarrative = `${row.cause} ${row.hazardFactor}`;
      const rowAnchors = ["동선", "유도자", "후진", "근접", "이동장비", "차량", "충돌"]
        .filter((token) => rowNarrative.includes(token));
      const expectedAnchors = [...new Set([
        ...rowAnchors,
        "동선",
        "분리",
        "이동장비",
        "차량",
        "충돌",
      ])];

      expect(expectedAnchors.some((token) => row.currentMeasure.includes(token))).toBe(true);
      expect(expectedAnchors.some((token) => row.reductionMeasure.includes(token))).toBe(true);
    }
  });

  it("does not force three rows when only one or two distinct control intents are supported", () => {
    const rows = FormService.mapAssessmentToRiskForm(buildCollapseAssessment(), {
      lawItems: [],
      lawActionItems: [],
    });

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeLessThanOrEqual(2);
    expect(new Set(rows.map((row) => row.controlIntent)).size).toBe(rows.length);
  });
});
