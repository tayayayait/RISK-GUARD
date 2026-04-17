import { describe, expect, it } from "vitest";
import {
  buildRiskAssessmentDocumentXml,
  buildRiskAssessmentDocxBlob,
  buildRiskAssessmentDocxTable,
  type RiskAssessmentDocxRow,
} from "@/lib/documentBuilder";

function createRow(overrides: Partial<RiskAssessmentDocxRow> = {}): RiskAssessmentDocxRow {
  return {
    workProcess: "설비 점검",
    category: "작업특성 요인",
    cause: "안전대 미착용",
    hazardFactor: "무리한 자세로 인한 추락",
    legalBasis: "산업안전보건기준에 관한 규칙",
    currentMeasure: "이동식 비계 고정 장치 점검\n아웃트리거 상태 확인",
    frequency: "3",
    severity: "4",
    riskLevel: "12(보통)",
    reductionMeasure: "작업 전 교육 및 안전 점검",
    improvementDate: "2026-04-08",
    completionDate: "2026-04-30",
    responsiblePerson: "유창제",
    note: "",
    ...overrides,
  };
}

describe("risk assessment docx layout", () => {
  it("keeps fixed column widths and merged header structure", () => {
    const xml = buildRiskAssessmentDocxTable(
      [createRow()],
      {
        processName: "외벽 도장 작업",
        evaluatedAt: "2026-04-13",
      },
    );

    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    expect(xml).toContain('<w:gridCol w:w="1051"/>');
    expect(xml).toContain('<w:gridCol w:w="673"/>');
    expect(xml).toContain('<w:gridSpan w:val="4"/>');
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml).toContain("<w:vMerge/>");
    expect(xml).toContain("공정명");
    expect(xml).toContain("위험성평가");
    expect(xml).toContain("2026-04-13");
  });

  it("keeps line breaks and escapes symbols in body cells", () => {
    const xml = buildRiskAssessmentDocxTable([
      createRow({
        currentMeasure: "1차 점검\n2차 점검",
        reductionMeasure: "추락방지 & 보호구 <필수>",
      }),
    ]);

    expect(xml).toContain("<w:br/>");
    expect(xml).toContain("추락방지 &amp; 보호구 &lt;필수&gt;");
  });

  it("packages docx payload with the correct mime type", async () => {
    const blob = buildRiskAssessmentDocxBlob([createRow()]);

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(blob.size).toBeGreaterThan(0);

    const content = await blob.text();
    expect(content.startsWith("PK")).toBe(true);
  });

  it("uses fixed A4 landscape page size and does not repeat top header rows on page split", () => {
    const oneRowXml = buildRiskAssessmentDocumentXml([createRow()]);
    const threeRowXml = buildRiskAssessmentDocumentXml([createRow(), createRow(), createRow()]);

    const oneRowPageSize = oneRowXml.match(/<w:pgSz w:w="(\d+)" w:h="(\d+)" w:orient="(landscape|portrait)"\/>/);
    const threeRowPageSize = threeRowXml.match(/<w:pgSz w:w="(\d+)" w:h="(\d+)" w:orient="(landscape|portrait)"\/>/);

    expect(oneRowPageSize).not.toBeNull();
    expect(threeRowPageSize).not.toBeNull();
    expect(Number(oneRowPageSize?.[1])).toBe(16838);
    expect(Number(oneRowPageSize?.[2])).toBe(11906);
    expect(oneRowPageSize?.[3]).toBe("landscape");
    expect(Number(threeRowPageSize?.[1])).toBe(16838);
    expect(Number(threeRowPageSize?.[2])).toBe(11906);
    expect(threeRowPageSize?.[3]).toBe("landscape");
    expect(threeRowXml).toContain('<w:pgMar w:top="360" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>');
    expect((threeRowXml.match(/<w:tblHeader\/>/g) ?? []).length).toBe(0);
  });
});
