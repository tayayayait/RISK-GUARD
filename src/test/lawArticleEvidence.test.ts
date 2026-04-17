import { describe, expect, it } from "vitest";
import type { EvidenceItem } from "@/types/assessment";

describe("law article evidence fields", () => {
  it("DB source law evidence can include remedial action fields", () => {
    const item: EvidenceItem = {
      id: "law-1",
      type: "law",
      sourceBadge: "법령",
      title: "추락의 방지",
      relevanceScore: 92,
      summaryBullets: ["추락 위험 장소에 안전난간 설치"],
      keywords: ["추락"],
      remedialActions: ["안전난간 설치", "안전대 부착설비 설치"],
      legalBasis: "산업안전보건기준에 관한 규칙 제42조",
      complianceChecklist: ["난간 높이 기준 확인"],
      sourceType: "db",
    };

    expect(item.sourceType).toBe("db");
    expect(item.remedialActions).toHaveLength(2);
    expect(item.legalBasis).toContain("제42조");
  });

  it("api and db source items can coexist", () => {
    const items: EvidenceItem[] = [
      {
        id: "law-db",
        type: "law",
        sourceBadge: "법령",
        title: "지게차의 안전조치",
        relevanceScore: 88,
        summaryBullets: ["작업 유도자 배치"],
        keywords: ["지게차"],
        sourceType: "db",
      },
      {
        id: "law-api",
        type: "law",
        sourceBadge: "Guide",
        title: "지게차 작업 가이드",
        relevanceScore: 84,
        summaryBullets: ["충돌 예방 동선 분리"],
        keywords: ["지게차", "충돌"],
        sourceType: "api",
      },
      {
        id: "law-storage",
        type: "law",
        sourceBadge: "법령",
        title: "제13조 안전난간의 구조 및 설치요건",
        relevanceScore: 86,
        summaryBullets: ["안전난간 구조 기준 준수"],
        keywords: ["추락", "낙하물/비래"],
        sourceType: "storage",
      },
    ];

    expect(items.some((item) => item.sourceType === "db")).toBe(true);
    expect(items.some((item) => item.sourceType === "api")).toBe(true);
    expect(items.some((item) => item.sourceType === "storage")).toBe(true);
  });

  it("legacy evidence items remain valid without new optional fields", () => {
    const legacy: EvidenceItem = {
      id: "legacy-law",
      type: "law",
      sourceBadge: "법령",
      title: "기존 법령 근거",
      relevanceScore: 75,
      summaryBullets: ["요약"],
      keywords: ["안전"],
    };

    expect(legacy.remedialActions).toBeUndefined();
    expect(legacy.sourceType).toBeUndefined();
  });
});
