import { describe, expect, it } from "vitest";
import {
  getRiskRowsLegalBasisCandidateOptions,
  resolveRiskRowLegalBasis,
  resolveRiskRowsLegalBasis,
  type RiskLawContext,
} from "@/services/formService";

describe("FormService risk legal basis mapping", () => {
  it("returns storage legal basis when row context matches", () => {
    const legalBasis = resolveRiskRowLegalBasis(
      {
        workProcess: "설비 점검",
        category: "전기적 요인",
        cause: "충전부 노출 상태에서 점검",
        hazardFactor: "감전 위험",
      },
      {
        workTokens: ["설비", "점검"],
        equipmentTokens: ["충전부"],
        lawItems: [
          {
            id: "law-storage-301",
            type: "law",
            sourceBadge: "법령",
            title: "제301조(전기기계·기구 등의 충전부 방호)",
            relevanceScore: 96,
            summaryBullets: ["충전부 방호조치"],
            keywords: ["감전", "충전부"],
            sourceType: "storage",
            legalBasis:
              "산업안전보건기준에 관한 규칙 제301조(전기기계·기구 등의 충전부 방호)",
            articleNumber: "제301조",
          },
        ],
        lawActionItems: [],
      },
    );

    expect(legalBasis).toBe(
      "산업안전보건기준에 관한 규칙 제301조(전기기계·기구 등의 충전부 방호)",
    );
  });

  it("uses hazard fallback when strict storage candidate fails context gate", () => {
    const legalBasis = resolveRiskRowLegalBasis(
      {
        workProcess: "설비 점검",
        category: "전기적 요인",
        cause: "충전부 노출 상태 점검",
        hazardFactor: "감전 위험",
      },
      {
        workTokens: ["zz-unmatched-work-token"],
        equipmentTokens: ["zz-unmatched-equipment-token"],
        lawItems: [
          {
            id: "law-storage-context-miss",
            type: "law",
            sourceBadge: "법령",
            title: "제399조(임의조문)",
            relevanceScore: 95,
            summaryBullets: ["감전 방지 관련 내용"],
            keywords: ["감전", "충전부"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제399조(임의조문)",
            articleNumber: "제399조",
          },
        ],
        lawActionItems: [],
      },
    );

    const rulesPrefix = "산업안전보건기준에 관한 규칙";
    expect(legalBasis.startsWith(rulesPrefix)).toBe(true);
    expect(legalBasis).not.toContain("제399조");
  });

  it("returns empty string when there is no usable context", () => {
    const context: RiskLawContext = {
      workTokens: [],
      equipmentTokens: [],
      lawItems: [],
      lawActionItems: [],
    };

    const legalBases = resolveRiskRowsLegalBasis(
      [
        {
          workProcess: "",
          category: "",
          cause: "",
          hazardFactor: "",
        },
      ],
      context,
    );

    expect(legalBases).toEqual([""]);
  });

  it("runs fallback matching even when hazard type is not detected", () => {
    const legalBasis = resolveRiskRowLegalBasis(
      {
        workProcess: "설비 점검",
        category: "작업특성 요인",
        cause: "고소 위치에서 몸을 과도하게 기울여 작업함",
        hazardFactor: "안전대 미착용 상태",
      },
      {
        workTokens: ["설비", "점검"],
        equipmentTokens: ["작업발판"],
        lawItems: [],
        lawActionItems: [],
      },
    );

    expect(legalBasis).toMatch(/^산업안전보건기준에 관한 규칙 제\d+조\(.+\)$/);
  });

  it("does not reuse the same legal basis within one accident when unique candidates are insufficient", () => {
    const legalBases = resolveRiskRowsLegalBasis(
      [
        {
          workProcess: "설비 점검",
          category: "관리적 요인",
          cause: "작업허가서 승인 절차 없이 설비 점검을 진행함",
          hazardFactor: "승인 절차 누락으로 사고 위험 증가",
        },
        {
          workProcess: "설비 점검",
          category: "관리적 요인",
          cause: "작업허가서 승인 없이 야간 점검 작업을 수행함",
          hazardFactor: "승인 확인 누락으로 사고 위험 증가",
        },
        {
          workProcess: "설비 점검",
          category: "관리적 요인",
          cause: "작업허가서 승인 확인을 생략하고 작업을 시작함",
          hazardFactor: "승인 검토 누락으로 사고 위험 증가",
        },
      ],
      {
        workTokens: ["설비", "점검", "작업허가"],
        equipmentTokens: [],
        lawItems: [
          {
            id: "law-storage-only-one",
            type: "law",
            sourceBadge: "법령",
            title: "제57조(작업허가 절차의 준수)",
            relevanceScore: 97,
            summaryBullets: ["작업허가 절차 준수"],
            keywords: ["작업허가", "승인", "절차"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제57조(작업허가 절차의 준수)",
            articleNumber: "제57조",
          },
        ],
        lawActionItems: [],
      },
    );

    const nonEmpty = legalBases.filter((item) => item);
    expect(new Set(nonEmpty).size).toBe(nonEmpty.length);
    expect(legalBases.filter((item) => item.includes("제57조")).length).toBeLessThanOrEqual(1);
  });

  it("deduplicates same article even when one candidate misses articleNumber metadata", () => {
    const legalBases = resolveRiskRowsLegalBasis(
      [
        {
          workProcess: "설비 점검",
          category: "작업특성 요인",
          cause: "외벽 보수 작업 전 비계 조립 상태를 충분히 확인하지 않음",
          hazardFactor: "비계 고정 불량으로 추락 위험 증가",
        },
        {
          workProcess: "설비 점검",
          category: "작업특성 요인",
          cause: "작업발판 고정 점검 없이 이동식 비계에서 작업함",
          hazardFactor: "비계 및 작업발판 이탈로 추락 위험 증가",
        },
      ],
      {
        workTokens: ["외벽", "보수", "비계", "작업발판"],
        equipmentTokens: ["비계", "작업발판"],
        lawItems: [
          {
            id: "law-storage-57-missing-article",
            type: "law",
            sourceBadge: "법령",
            title: "제57조(비계 등의 조립·해체 및 변경)",
            relevanceScore: 97,
            summaryBullets: ["비계 조립·해체 기준 준수"],
            keywords: ["비계", "작업발판", "고정"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제57조(비계 등의 조립·해체 및 변경)",
            articleNumber: "",
          },
        ],
        lawActionItems: [],
      },
    );

    expect(legalBases.filter((item) => item.includes("제57조")).length).toBeLessThanOrEqual(1);
  });

  it("maps distinct rows to distinct legal basis articles when evidence exists", () => {
    const legalBases = resolveRiskRowsLegalBasis(
      [
        {
          workProcess: "설비 점검",
          category: "전기적 요인",
          cause: "충전부 노출 상태로 점검함",
          hazardFactor: "감전 위험 증가",
        },
        {
          workProcess: "고소 작업",
          category: "작업특성 요인",
          cause: "작업발판 고정 상태 점검이 미흡함",
          hazardFactor: "발판 이탈로 추락 위험 증가",
        },
        {
          workProcess: "기계 정비",
          category: "기계적 요인",
          cause: "회전부 방호장치를 해체한 채 점검함",
          hazardFactor: "회전체 접촉으로 끼임 위험 증가",
        },
      ],
      {
        workTokens: ["설비", "점검", "정비"],
        equipmentTokens: ["충전부", "작업발판", "회전부"],
        lawItems: [
          {
            id: "law-storage-301",
            type: "law",
            sourceBadge: "법령",
            title: "제301조(전기기계·기구 등의 충전부 방호)",
            relevanceScore: 96,
            summaryBullets: ["충전부 방호조치"],
            keywords: ["감전", "충전부"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제301조(전기기계·기구 등의 충전부 방호)",
            articleNumber: "제301조",
          },
          {
            id: "law-storage-56",
            type: "law",
            sourceBadge: "법령",
            title: "제56조(작업발판의 구조)",
            relevanceScore: 93,
            summaryBullets: ["작업발판 구조 기준"],
            keywords: ["발판", "추락", "고정"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제56조(작업발판의 구조)",
            articleNumber: "제56조",
          },
          {
            id: "law-storage-87",
            type: "law",
            sourceBadge: "법령",
            title: "제87조(원동기·회전축 등의 위험 방지)",
            relevanceScore: 95,
            summaryBullets: ["회전부 위험 방지"],
            keywords: ["회전부", "끼임", "방호장치"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제87조(원동기·회전축 등의 위험 방지)",
            articleNumber: "제87조",
          },
        ],
        lawActionItems: [],
      },
    );

    const nonEmpty = legalBases.filter((item) => item);
    expect(new Set(nonEmpty).size).toBe(nonEmpty.length);
    expect(legalBases[0]).toContain("제301조");
    expect(legalBases[1]).toContain("제56조");
    expect(legalBases[2]).toContain("제87조");
  });

  it("prioritizes vehicle-contact law over rotating-machine law for forklift wall entrapment context", () => {
    const legalBasis = resolveRiskRowLegalBasis(
      {
        workProcess: "자재 운반",
        category: "기계적 요인",
        cause: "지게차 진행 방향 근처로 접근한 작업자가 벽체와 지게차 사이에서 협착될 수 있음",
        hazardFactor: "작업구역 분리 미흡과 유도자 미배치로 차량 접촉·협착 위험 증가",
      },
      {
        workTokens: ["운반", "자재", "동선"],
        equipmentTokens: ["지게차"],
        lawItems: [
          {
            id: "law-storage-93",
            type: "law",
            sourceBadge: "법령",
            title: "제93조(방호장치의 해체 금지)",
            relevanceScore: 94,
            summaryBullets: ["회전부 방호장치 해체 금지"],
            keywords: ["회전부", "방호장치", "해체"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제93조(방호장치의 해체 금지)",
            articleNumber: "제93조",
          },
          {
            id: "law-storage-172",
            type: "law",
            sourceBadge: "법령",
            title: "제172조(접촉의 방지)",
            relevanceScore: 95,
            summaryBullets: ["차량계 하역운반기계와 작업자 접촉 방지"],
            keywords: ["지게차", "접촉", "동선", "유도"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
            articleNumber: "제172조",
          },
        ],
        lawActionItems: [],
      },
    );

    expect(legalBasis).toContain("제172조");
    expect(legalBasis).not.toContain("제93조");
  });

  it("prioritizes rotating-machine law for rotating equipment entrapment context", () => {
    const legalBasis = resolveRiskRowLegalBasis(
      {
        workProcess: "설비 정비",
        category: "기계적 요인",
        cause: "컨베이어 롤러 회전부를 정비하던 중 방호장치가 해체된 상태에서 작업자 손이 말릴 수 있음",
        hazardFactor: "회전부 접촉에 의한 끼임·말림 위험 증가",
      },
      {
        workTokens: ["정비", "설비"],
        equipmentTokens: ["컨베이어", "롤러", "회전부"],
        lawItems: [
          {
            id: "law-storage-93",
            type: "law",
            sourceBadge: "법령",
            title: "제93조(방호장치의 해체 금지)",
            relevanceScore: 95,
            summaryBullets: ["회전부 방호장치 해체 금지"],
            keywords: ["회전부", "롤러", "방호장치"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제93조(방호장치의 해체 금지)",
            articleNumber: "제93조",
          },
          {
            id: "law-storage-172",
            type: "law",
            sourceBadge: "법령",
            title: "제172조(접촉의 방지)",
            relevanceScore: 90,
            summaryBullets: ["차량계 하역운반기계와 작업자 접촉 방지"],
            keywords: ["지게차", "접촉", "동선"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제172조(접촉의 방지)",
            articleNumber: "제172조",
          },
        ],
        lawActionItems: [],
      },
    );

    expect(legalBasis).toContain("제93조");
    expect(legalBasis).not.toContain("제172조");
  });

  it("returns empty legal basis when row context is ambiguous", () => {
    const legalBasis = resolveRiskRowLegalBasis(
      {
        workProcess: "현장 작업",
        category: "작업특성 요인",
        cause: "작업 중 상황이 복합적으로 발생함",
        hazardFactor: "일반적인 위험 가능성 존재",
      },
      {
        workTokens: ["현장"],
        equipmentTokens: [],
        lawItems: [],
        lawActionItems: [],
      },
    );

    expect(legalBasis).toBe("");
  });

  it("returns candidate options for AI second-pass review", () => {
    const candidates = getRiskRowsLegalBasisCandidateOptions(
      [
        {
          workProcess: "설비 점검",
          category: "전기적 요인",
          cause: "충전부 노출 상태에서 점검",
          hazardFactor: "감전 위험",
        },
      ],
      {
        workTokens: ["설비", "점검"],
        equipmentTokens: ["충전부"],
        lawItems: [
          {
            id: "law-storage-301",
            type: "law",
            sourceBadge: "법령",
            title: "제301조(전기기계·기구 등의 충전부 방호)",
            relevanceScore: 96,
            summaryBullets: ["충전부 방호조치"],
            keywords: ["감전", "충전부"],
            sourceType: "storage",
            legalBasis: "산업안전보건기준에 관한 규칙 제301조(전기기계·기구 등의 충전부 방호)",
            articleNumber: "제301조",
          },
        ],
        lawActionItems: [],
      },
      3,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].length).toBeGreaterThan(0);
    expect(candidates[0][0]?.legalBasis).toMatch(/^산업안전보건기준에 관한 규칙 제\d+조\(.+\)$/);
  });
});
