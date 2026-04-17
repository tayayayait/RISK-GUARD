import { describe, expect, it } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import { buildReportDocxBlob, buildReportDocxDocumentXml } from "@/lib/reportDocxBuilder";

function buildAssessmentFixture() {
  const assessment = createMockAssessment();
  assessment.taskName = "외벽 도장 작업";
  assessment.analysis.level = "high";
  assessment.analysis.score = 70;
  assessment.updatedAt = "2026-04-14T10:20:00Z";
  assessment.reportSections = [
    { id: "header", title: "문서 헤더", content: "ignored", editable: false, order: 1 },
    { id: "overview", title: "작업 개요", content: "외벽 도장 작업 요약", editable: true, order: 2 },
    { id: "profile", title: "작업 프로필", content: "업종: 건설업", editable: true, order: 3 },
    { id: "hazards", title: "주요 위험요인", content: "- 추락", editable: true, order: 4 },
    { id: "risk-level", title: "위험등급 및 즉시 조치", content: "위험등급: HIGH", editable: true, order: 5 },
    { id: "disaster-cases", title: "유사 재해사례 요약", content: "재해 사례 본문", editable: true, order: 6 },
    { id: "fatality-warning", title: "사망사고 기반 경고", content: "사망사고 경고 본문", editable: true, order: 7 },
    {
      id: "law-guide",
      title: "법령 및 KOSHA Guide 근거",
      content: "[법령 인용]\n- 산업안전보건기준 규칙 제1조\n\n[교육자료 링크]\n- 링크 항목",
      editable: true,
      order: 8,
    },
    { id: "law-remedial-actions", title: "법령 기반 개선조치", content: "- 법령 조치", editable: true, order: 9 },
    { id: "improvements", title: "권장 개선조치", content: "- 권장 조치", editable: true, order: 10 },
    { id: "materials", title: "추천 교육자료", content: "교육자료 본문", editable: true, order: 11 },
    { id: "checklist", title: "작업 전 체크리스트", content: "ignored", editable: false, order: 12 },
    { id: "briefing", title: "작업 전 안전 브리핑 문안", content: "ignored", editable: false, order: 13 },
  ];
  assessment.checklistItems = ["비상정지 버튼 점검", "안전가드 점검"];
  assessment.briefingText = "고위험 작업입니다.";
  return assessment;
}

describe("report docx builder", () => {
  it("builds submission profile document with action-plan merge and law-summary filtering", () => {
    const assessment = buildAssessmentFixture();

    const xml = buildReportDocxDocumentXml(assessment, "submission");

    expect(xml).toContain("RISK-GUARD 위험성평가 결과 보고서 (제출용)");
    expect(xml).toContain("작업명: 외벽 도장 작업");
    expect(xml).toContain("생성일: 2026-04-14");
    expect(xml).toContain("위험등급: HIGH (70점)");
    expect(xml).toContain("조치계획");
    expect(xml).toContain("[법령 기반 개선조치]");
    expect(xml).toContain("[권장 개선조치]");
    expect(xml).toContain("법령·가이드 근거 요약");
    expect(xml).toContain("산업안전보건기준 규칙 제1조");
    expect(xml).not.toContain("[교육자료 링크]");
    expect(xml).not.toContain("재해 사례 본문");
  });

  it("builds review profile document with appendix sections", () => {
    const assessment = buildAssessmentFixture();

    const xml = buildReportDocxDocumentXml(assessment, "review");

    expect(xml).toContain("RISK-GUARD 위험성평가 결과 보고서 (검토용)");
    expect(xml).toContain("7. 부록");
    expect(xml).toContain("유사 재해사례 요약");
    expect(xml).toContain("사망사고 기반 경고");
    expect(xml).toContain("추천 교육자료");
  });

  it("packages docx output as a valid OOXML blob", async () => {
    const blob = buildReportDocxBlob(buildAssessmentFixture(), "submission");

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(blob.size).toBeGreaterThan(0);
    expect((await blob.text()).startsWith("PK")).toBe(true);
  });
});
