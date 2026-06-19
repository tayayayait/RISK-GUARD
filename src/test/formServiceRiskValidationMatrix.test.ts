import { describe, expect, it } from "vitest";
import {
  createEmptyRiskAssessmentRow,
  validateRiskAssessmentRows,
} from "@/services/formService";
import type { RiskAssessmentRow } from "@/types/formTemplate";

interface HazardValidationCase {
  hazardType: string;
  category: RiskAssessmentRow["category"];
  cause: string;
  hazardFactor: string;
  currentMeasure: string;
  reductionMeasure: string;
  anchorPattern: RegExp;
}

const FALL_CONFLICT_MEASURE = {
  current: "안전대 및 추락방지 보호구 착용 상태를 확인한다.",
  reduction: "난간과 작업발판 고정 상태를 보강한다.",
};

const ELECTRICAL_CONFLICT_MEASURE = {
  current: "전원 차단 후 충전부 노출 구간 접근을 통제한다.",
  reduction: "누전차단기 정격 감도를 재설정하고 정기 시험을 실시한다.",
};

const HAZARD_CASES: HazardValidationCase[] = [
  {
    hazardType: "추락",
    category: "작업특성 요인",
    cause: "비계 작업 중 난간 미설치 상태에서 추락 사고가 발생할 수 있음",
    hazardFactor: "작업발판 파손으로 추락 위험 증가",
    currentMeasure: "비계 난간과 안전대 체결 상태를 점검한다.",
    reductionMeasure: "추락 방지망과 안전난간을 추가 설치한다.",
    anchorPattern: /(추락|비계|발판|난간|안전대)/,
  },
  {
    hazardType: "붕괴",
    category: "작업특성 요인",
    cause: "지지 구조물 체결 불량 상태에서 붕괴 사고가 발생할 수 있음",
    hazardFactor: "동바리 변형으로 붕괴 위험 증가",
    currentMeasure: "지지 구조물 변형과 체결 상태를 점검한다.",
    reductionMeasure: "동바리 보강재를 추가 설치한다.",
    anchorPattern: /(붕괴|지지|동바리|구조물)/,
  },
  {
    hazardType: "질식",
    category: "작업특성 요인",
    cause: "밀폐공간 환기 미흡 상태에서 질식 사고가 발생할 수 있음",
    hazardFactor: "산소 결핍으로 질식 위험 증가",
    currentMeasure: "밀폐공간 산소 농도와 환기 상태를 측정한다.",
    reductionMeasure: "환기 설비를 가동하고 감시인을 배치한다.",
    anchorPattern: /(질식|밀폐공간|산소|환기)/,
  },
  {
    hazardType: "폭발/화재",
    category: "관리적 요인",
    cause: "가연성 증기 점화원 통제 미흡 상태에서 화재 사고가 발생할 수 있음",
    hazardFactor: "가스 누출로 폭발 위험 증가",
    currentMeasure: "가스 누출과 점화원 통제 상태를 점검한다.",
    reductionMeasure: "가연성 증기 폭발·화재 위험을 차단하고 소화기를 배치한다.",
    anchorPattern: /(폭발|화재|가연성|점화|방폭|소화)/,
  },
  {
    hazardType: "감전",
    category: "전기적 요인",
    cause: "전원 격리 미확인 상태에서 충전부 접촉으로 감전 사고가 발생할 수 있음",
    hazardFactor: "충전부 노출로 감전 위험 증가",
    currentMeasure: "충전부 노출과 전원 차단 상태를 점검한다.",
    reductionMeasure: "잠금표지 후 전원 차단 상태를 재확인한다.",
    anchorPattern: /(감전|충전부|전원|차단기|절연|누전|배선|전선)/,
  },
  {
    hazardType: "끼임/말림",
    category: "기계적 요인",
    cause: "회전부 방호 미흡 상태에서 끼임 사고가 발생할 수 있음",
    hazardFactor: "롤러 근접접촉으로 말림 위험 증가",
    currentMeasure: "회전부 방호장치와 인터록 상태를 점검한다.",
    reductionMeasure: "끼임 위험 구간에 안전장치를 추가 설치한다.",
    anchorPattern: /(끼임|말림|회전부|롤러|협착|인터록)/,
  },
  {
    hazardType: "절단",
    category: "기계적 요인",
    cause: "절단기 커버 미체결 상태에서 절단 사고가 발생할 수 있음",
    hazardFactor: "날 마모와 손 접근으로 절단 위험 증가",
    currentMeasure: "절단부 커버 체결과 날 마모 상태를 점검한다.",
    reductionMeasure: "절단 비산물 방호 스크린을 설치한다.",
    anchorPattern: /(절단|날|커팅|비상정지|커버)/,
  },
  {
    hazardType: "낙하물/비래",
    category: "기계적 요인",
    cause: "상부 자재 고정 미흡 상태에서 낙하물 사고가 발생할 수 있음",
    hazardFactor: "파편 비래로 충돌 위험 증가",
    currentMeasure: "상부 자재 고정과 낙하물 방지망 상태를 점검한다.",
    reductionMeasure: "낙하물·비래 방지망을 설치하고 상부 양중 구간 하부 출입을 통제한다.",
    anchorPattern: /(낙하물|비래|상부|파편|양중)/,
  },
  {
    hazardType: "차량/이동장비 충돌",
    category: "관리적 요인",
    cause: "지게차 후진 구간 유도자 미배치 상태에서 충돌 사고가 발생할 수 있음",
    hazardFactor: "보행자 동선 겹침으로 차량 충돌 위험 증가",
    currentMeasure: "차량 동선 분리와 후진 유도자 배치 상태를 점검한다.",
    reductionMeasure: "이동장비 속도 제한 장치를 설정하고 신호수를 배치한다.",
    anchorPattern: /(차량|이동장비|지게차|충돌|후진|동선|유도자)/,
  },
  {
    hazardType: "화학노출",
    category: "환경적 요인",
    cause: "유해물질 밀봉 미흡 상태에서 화학노출 사고가 발생할 수 있음",
    hazardFactor: "용제 증기 흡입으로 화학노출 위험 증가",
    currentMeasure: "유해물질 화학노출 위험과 국소배기 상태를 점검한다.",
    reductionMeasure: "유해물질 용기 밀봉과 비상 세안설비를 보강한다.",
    anchorPattern: /(화학|유해물질|노출|흡입|msds|국소배기)/i,
  },
  {
    hazardType: "소음/분진/반복작업",
    category: "환경적 요인",
    cause: "분진 관리 미흡 상태에서 반복작업 중 소음 노출 사고가 발생할 수 있음",
    hazardFactor: "분진 비산과 진동 누적으로 작업자 건강 위험 증가",
    currentMeasure: "소음 수치와 분진 발생 구간 방진 상태를 점검한다.",
    reductionMeasure: "청력 보호구 지급과 분진 집진 설비를 보강한다.",
    anchorPattern: /(소음|분진|반복|진동|방진|청력)/,
  },
];

function buildBaseRow(seed: HazardValidationCase) {
  return createEmptyRiskAssessmentRow({
    workProcess: "테스트 공정",
    category: seed.category,
    cause: seed.cause,
    hazardFactor: seed.hazardFactor,
    legalBasis: "",
    currentMeasure: seed.currentMeasure,
    frequency: 3,
    severity: 4,
    riskLevel: "12(보통)",
    reductionMeasure: seed.reductionMeasure,
  });
}

describe("risk validation matrix", () => {
  it("keeps aligned rows as ok across 11 standard hazard types", () => {
    for (const hazardCase of HAZARD_CASES) {
      const result = validateRiskAssessmentRows(
        [buildBaseRow(hazardCase)],
        {},
        { rewriteInvalidFields: false, clearUnresolvedFields: false },
      );

      const row = result.rows[0];
      expect(row.validationStatus).toBe("ok");
      expect(row.reviewRequiredFields).toEqual([]);
      expect(row.expectedHazardType).toBe(hazardCase.hazardType);
      expect(hazardCase.anchorPattern.test(`${row.currentMeasure} ${row.reductionMeasure}`)).toBe(true);
    }
  });

  it("rewrites conflicting measures for each hazard type and falls back to review_required only per failed row", () => {
    let reviewRequiredObserved = false;

    for (const hazardCase of HAZARD_CASES) {
      const conflict = hazardCase.hazardType === "감전"
        ? FALL_CONFLICT_MEASURE
        : ELECTRICAL_CONFLICT_MEASURE;
      const row = buildBaseRow({
        ...hazardCase,
        currentMeasure: conflict.current,
        reductionMeasure: conflict.reduction,
      });

      const result = validateRiskAssessmentRows(
        [row],
        {},
        { rewriteInvalidFields: true, clearUnresolvedFields: true },
      );

      const validated = result.rows[0];
      expect(validated.currentMeasure).not.toBe(conflict.current);
      expect(validated.reductionMeasure).not.toBe(conflict.reduction);

      if (validated.validationStatus === "ok") {
        expect(hazardCase.anchorPattern.test(validated.currentMeasure)).toBe(true);
        expect(hazardCase.anchorPattern.test(validated.reductionMeasure)).toBe(true);
      } else {
        reviewRequiredObserved = true;
        expect(validated.validationStatus).toBe("review_required");
        expect(validated.reviewRequiredFields?.length ?? 0).toBeGreaterThan(0);
        expect(validated.currentMeasure.trim().length).toBeGreaterThan(0);
        expect(validated.reductionMeasure.trim().length).toBeGreaterThan(0);
      }

      const rewrittenEvents = result.validationEvents.filter((event) =>
        event.rowIndex === 0
        && (event.field === "currentMeasure" || event.field === "reductionMeasure")
        && event.rewritten,
      );
      expect(rewrittenEvents.length).toBeGreaterThan(0);
    }

    expect(reviewRequiredObserved).toBe(true);
  });

  it("marks only failed rows as review_required when rewrite is disabled", () => {
    const conflictRow = buildBaseRow({
      ...HAZARD_CASES.find((item) => item.hazardType === "감전")!,
      currentMeasure: FALL_CONFLICT_MEASURE.current,
      reductionMeasure: FALL_CONFLICT_MEASURE.reduction,
    });
    const alignedRow = buildBaseRow(HAZARD_CASES.find((item) => item.hazardType === "감전")!);

    const result = validateRiskAssessmentRows(
      [conflictRow, alignedRow],
      {},
      { rewriteInvalidFields: false, clearUnresolvedFields: false },
    );

    expect(result.validationSummary.totalRows).toBe(2);
    expect(result.validationSummary.reviewRequiredRows).toBe(1);
    expect(result.rows[0].validationStatus).toBe("review_required");
    expect(result.rows[1].validationStatus).toBe("ok");
  });

  it("does not treat standalone '전원 확인' phrasing as electrical evidence in fall rows", () => {
    const fallCase = HAZARD_CASES.find((item) => item.hazardType === "추락")!;
    const row = buildBaseRow({
      ...fallCase,
      currentMeasure: "안전대 및 추락방지 보호구 착용 상태를 전원 확인한다.",
      reductionMeasure: "난간과 작업발판 고정 상태를 보강한다.",
    });

    const result = validateRiskAssessmentRows(
      [row],
      {},
      { rewriteInvalidFields: false, clearUnresolvedFields: false },
    );

    expect(result.rows[0].validationStatus).toBe("ok");
    expect(result.rows[0].expectedHazardType).toBe("추락");
    expect(result.rows[0].currentMeasure).toContain("전원 확인");
  });
});
