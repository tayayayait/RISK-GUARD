import { describe, expect, it } from "vitest";
import {
  buildRiskAssessmentDocumentXml,
  buildRiskAssessmentDocxBlob,
  buildRiskAssessmentDocxTable,
  mapRiskRowsToDocxRows,
  type RiskAssessmentDocxRow,
} from "@/lib/documentBuilder";
import type { RiskAssessmentRow } from "@/types/formTemplate";

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
    expect(xml).toContain('<w:gridCol w:w="578"/>');
    expect(xml).toContain('<w:gridSpan w:val="4"/>');
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml).toContain("<w:vMerge/>");
    expect(xml).toContain("공정명");
    expect(xml).toContain("위험성평가");
    expect(xml).toContain("2026-04-13");
  });

  it("holds 15 columns whose total width matches the declared table width", () => {
    const xml = buildRiskAssessmentDocxTable([createRow()]);

    const gridColumns = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1]));
    expect(gridColumns).toHaveLength(15);

    const declaredWidth = Number(xml.match(/<w:tblW w:w="(\d+)" w:type="dxa"\/>/)?.[1]);
    expect(gridColumns.reduce((sum, width) => sum + width, 0)).toBe(declaredWidth);
  });

  it("renders acceptability, post-improvement risk and improvement status in the body row", () => {
    const xml = buildRiskAssessmentDocxTable([
      createRow({
        acceptabilityLabel: "허용 불가",
        postRiskLevel: "6(보통)",
        postAcceptabilityLabel: "허용 가능",
        improvementStatusLabel: "진행중",
      }),
    ]);

    expect(xml).toContain("개선 후");
    expect(xml).toContain("허용 불가");
    expect(xml).toContain("6(보통)");
    expect(xml).toContain("허용 가능");
    expect(xml).toContain("진행중");
  });

  it("maps risk assessment rows to docx rows with legal labels", () => {
    const row: RiskAssessmentRow = {
      workProcess: "외벽 도장",
      category: "작업특성 요인",
      cause: "안전대 미착용",
      hazardFactor: "추락",
      legalBasis: "산업안전보건기준에 관한 규칙 제42조",
      currentMeasure: "안전대 지급",
      frequency: 3,
      severity: 4,
      riskLevel: "12(보통)",
      reductionMeasure: "작업발판 설치",
      improvementDate: "2026-04-08",
      completionDate: "",
      responsiblePerson: "유창제",
      acceptability: "not_acceptable",
      postFrequency: 2,
      postSeverity: 3,
      postRiskLevel: "6(보통)",
      postAcceptability: "acceptable",
      improvementStatus: "in_progress",
    };

    const [mapped] = mapRiskRowsToDocxRows([row]);

    expect(mapped.frequency).toBe("3");
    expect(mapped.severity).toBe("4");
    expect(mapped.acceptabilityLabel).toBe("허용 불가");
    expect(mapped.postRiskLevel).toBe("6(보통)");
    expect(mapped.postAcceptabilityLabel).toBe("허용 가능");
    expect(mapped.improvementStatusLabel).toBe("진행중");
  });

  it("appends participant and share records below the table", () => {
    const xml = buildRiskAssessmentDocumentXml([createRow()], {
      processName: "외벽 도장 작업",
      participants: [
        {
          name: "김근로",
          role: "근로자대표",
          method: "사업장 순회점검",
          participatedAt: "2026-04-10",
          affiliation: "도장반",
        },
      ],
      shareRecords: [
        {
          phase: "실시 후 (결과 공유)",
          method: "사업장 게시",
          sharedAt: "2026-04-14",
          audienceNote: "도장반 12명",
          content: "위험성 결정 결과와 개선대책 게시",
        },
      ],
    });

    expect(xml).toContain("평가 참여자");
    expect(xml).toContain("김근로 (도장반)");
    expect(xml).toContain("근로자대표");
    expect(xml).toContain("결과 공유 기록");
    expect(xml).toContain("도장반 12명");
    expect(xml).toContain("위험성 결정 결과와 개선대책 게시");
  });

  it("omits the appendix when no participant or share record exists", () => {
    const xml = buildRiskAssessmentDocumentXml([createRow()]);

    expect(xml).not.toContain("평가 참여자");
    expect(xml).not.toContain("결과 공유 기록");
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
