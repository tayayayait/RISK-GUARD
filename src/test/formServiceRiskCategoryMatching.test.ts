import { describe, expect, it } from "vitest";
import {
  reclassifyRiskAssessmentRows,
  type RiskCategoryOption,
} from "@/services/formService";
import type { RiskAssessmentRow } from "@/types/formTemplate";

function buildRiskRow(seed: Partial<RiskAssessmentRow>): RiskAssessmentRow {
  return {
    workProcess: seed.workProcess ?? "설치/해체",
    category: seed.category ?? "전기적 요인",
    cause: seed.cause ?? "",
    hazardFactor: seed.hazardFactor ?? "",
    legalBasis: seed.legalBasis ?? "",
    currentMeasure: seed.currentMeasure ?? "",
    frequency: seed.frequency ?? 3,
    severity: seed.severity ?? 3,
    riskLevel: seed.riskLevel ?? "9(보통)",
    reductionMeasure: seed.reductionMeasure ?? "",
    postRiskLevel: seed.postRiskLevel ?? "low",
    improvementDate: seed.improvementDate ?? "",
    completionDate: seed.completionDate ?? "",
    responsiblePerson: seed.responsiblePerson ?? "",
  };
}

function classify(seed: Partial<RiskAssessmentRow>) {
  const [row] = reclassifyRiskAssessmentRows([buildRiskRow(seed)]);
  return row?.category;
}

describe("reclassifyRiskAssessmentRows", () => {
  it("matches major hazard types to expected categories from cause signals", () => {
    const cases: Array<{
      name: string;
      cause: string;
      hazardFactor: string;
      expected: RiskCategoryOption;
    }> = [
      {
        name: "fall",
        cause: "고소작업 중 난간이 해체된 상태에서 중심을 잃어 추락할 수 있음",
        hazardFactor: "작업발판 고정 불량으로 추락 위험 증가",
        expected: "작업특성 요인",
      },
      {
        name: "collapse",
        cause: "흙막이 지지대 설치가 미흡해 구조물이 무너질 수 있음",
        hazardFactor: "지지 구조물 변형으로 붕괴 위험 증가",
        expected: "작업특성 요인",
      },
      {
        name: "suffocation",
        cause: "밀폐공간에서 환기 없이 작업해 산소결핍으로 질식할 수 있음",
        hazardFactor: "환기 미실시로 질식 위험 증가",
        expected: "작업특성 요인",
      },
      {
        name: "fire-explosion",
        cause: "인화성 용제 주변에서 점화원을 통제하지 않아 화재가 발생할 수 있음",
        hazardFactor: "가연성 증기 축적으로 폭발 위험 증가",
        expected: "작업특성 요인",
      },
      {
        name: "electrical",
        cause: "충전부 노출 상태에서 절연이 손상되어 감전될 수 있음",
        hazardFactor: "누전으로 통전 위험 증가",
        expected: "전기적 요인",
      },
      {
        name: "entrapment",
        cause: "컨베이어 회전부 청소 중 손이 롤러에 끼일 수 있음",
        hazardFactor: "회전부 방호덮개 해체로 끼임 위험 증가",
        expected: "기계적 요인",
      },
      {
        name: "cutting",
        cause: "절단기 날 교체 중 잠금표지 없이 작업해 손이 베일 수 있음",
        hazardFactor: "절단날 노출로 절단 위험 증가",
        expected: "기계적 요인",
      },
      {
        name: "falling-object",
        cause: "상부 적재 자재 고정이 불량해 낙하물이 떨어질 수 있음",
        hazardFactor: "비래물 방지망 미설치로 낙하물 충돌 위험 증가",
        expected: "기계적 요인",
      },
      {
        name: "vehicle-collision",
        cause: "지게차 후진 구간에서 유도 없이 작업자와 근접 운행하여 충돌할 수 있음",
        hazardFactor: "동선 분리 미흡으로 차량 충돌 위험 증가",
        expected: "기계적 요인",
      },
      {
        name: "chemical",
        cause: "유해화학물질 취급 중 밀폐가 불량해 증기를 흡입할 수 있음",
        hazardFactor: "화학물질 노출로 건강장해 위험 증가",
        expected: "환경적 요인",
      },
      {
        name: "noise-dust-repetitive",
        cause: "분진과 소음이 높은 구간에서 반복작업을 장시간 수행함",
        hazardFactor: "소음·분진 누적으로 건강 위험 증가",
        expected: "환경적 요인",
      },
    ];

    for (const testCase of cases) {
      expect(
        classify({
          cause: testCase.cause,
          hazardFactor: testCase.hazardFactor,
        }),
        testCase.name,
      ).toBe(testCase.expected);
    }
  });

  it("prioritizes management category when cause text is management failure", () => {
    expect(classify({
      cause: "작업허가서 없이 작업계획 검토를 생략하고 작업을 진행함",
      hazardFactor: "비계 고정 불량으로 추락 위험 증가",
    })).toBe("관리적 요인");
  });

  it("prioritizes human category when cause text is human behavior failure", () => {
    expect(classify({
      cause: "작업자 부주의와 보호구 미착용 상태에서 절단 설비를 조작함",
      hazardFactor: "절단날 접촉 위험 증가",
    })).toBe("인적 요인");
  });

  it("does not classify as electrical when only one weak electrical token appears with fall context", () => {
    expect(classify({
      cause: "고소 작업 중 고소작업 설비의 전원 거리 미확인 상태에서 추락 사고가 발생할 수 있음",
      hazardFactor: "비계 고정 불량 상태로 인한 추락 위험 증가",
    })).toBe("작업특성 요인");
  });

  it("classifies as electrical when multiple weak electrical tokens coexist", () => {
    expect(classify({
      cause: "전원 차단 없이 배선을 임시 연결한 상태에서 작업함",
      hazardFactor: "전선 피복 손상으로 접촉 위험이 증가함",
    })).toBe("전기적 요인");
  });
});
