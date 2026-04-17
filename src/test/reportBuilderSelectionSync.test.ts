import { describe, expect, it } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import { buildReportSectionsFromAssessment } from "@/lib/reportBuilder";
import { getReportExportSections } from "@/lib/reportExportContent";

function sectionContent(id: string, sections: ReturnType<typeof buildReportSectionsFromAssessment>) {
  return sections.find((section) => section.id === id)?.content ?? "";
}

describe("buildReportSectionsFromAssessment selection sync", () => {
  it("reflects selected disaster and fatality evidence with summary, metadata, and URL", () => {
    const assessment = createMockAssessment();
    assessment.evidenceItems = [
      {
        id: "case-1",
        type: "case",
        sourceBadge: "재해사례",
        title: "외벽 작업 중 추락 사례",
        relevanceScore: 91,
        summaryBullets: ["안전난간 미설치 상태에서 작업 중 추락"],
        keywords: ["추락"],
        url: "https://example.com/case-1",
      },
      {
        id: "fatality-1",
        type: "fatality",
        sourceBadge: "사고사망",
        title: "고소작업 중 추락 사망사고",
        relevanceScore: 88,
        summaryBullets: ["안전대 미착용 상태에서 추락"],
        keywords: ["추락", "사망"],
        incidentDate: "2026-01-10",
        place: "서울",
        casualtyScale: "사망 1명",
        url: "https://example.com/fatality-1",
      },
    ];

    assessment.citations = [
      {
        id: "cite-case-1",
        evidenceId: "case-1",
        title: "외벽 작업 중 추락 사례",
        sourceBadge: "재해사례",
        summary: "안전난간 미설치 상태에서 작업 중 추락",
        order: 1,
        addedAt: new Date().toISOString(),
      },
      {
        id: "cite-fatality-1",
        evidenceId: "fatality-1",
        title: "고소작업 중 추락 사망사고",
        sourceBadge: "사고사망",
        summary: "안전대 미착용 상태에서 추락",
        order: 2,
        addedAt: new Date().toISOString(),
      },
    ];

    const sections = buildReportSectionsFromAssessment(assessment);
    const disaster = sectionContent("disaster-cases", sections);
    const fatality = sectionContent("fatality-warning", sections);

    expect(disaster).toContain("외벽 작업 중 추락 사례");
    expect(disaster).toContain("요약: 안전난간 미설치 상태에서 작업 중 추락");
    expect(disaster).toContain("원문: https://example.com/case-1");

    expect(fatality).toContain("고소작업 중 추락 사망사고");
    expect(fatality).toContain("요약: 안전대 미착용 상태에서 추락");
    expect(fatality).toContain("일시: 2026-01-10");
    expect(fatality).toContain("장소: 서울");
    expect(fatality).toContain("인명피해: 사망 1명");
    expect(fatality).toContain("원문: https://example.com/fatality-1");
  });

  it("includes cited guide AI summary in law-guide section and keeps title-only when summary is missing", () => {
    const assessment = createMockAssessment();
    assessment.evidenceItems = [
      {
        id: "guide-with-summary",
        type: "law",
        sourceBadge: "Guide",
        title: "밀폐공간 작업 기술지침",
        relevanceScore: 84,
        summaryBullets: ["작업 전 산소농도를 측정한다."],
        keywords: ["Guide", "밀폐공간"],
        url: "https://example.com/guide-with-summary",
      },
      {
        id: "guide-title-only",
        type: "law",
        sourceBadge: "Guide",
        title: "외벽 도장 작업 기술지침",
        relevanceScore: 79,
        summaryBullets: ["추락 방지 조치를 준수한다."],
        keywords: ["Guide", "추락"],
        url: "https://example.com/guide-title-only",
      },
    ];

    assessment.citations = [
      {
        id: "cite-guide-with-summary",
        evidenceId: "guide-with-summary",
        title: "밀폐공간 작업 기술지침",
        sourceBadge: "Guide",
        summary: "요약",
        order: 1,
        addedAt: new Date().toISOString(),
        aiSummary: {
          incidentRelevance: "현재 사고는 밀폐공간 산소결핍 위험과 직접적으로 연관됩니다.",
          applicabilityReason: "지침은 산소농도 측정 및 환기 조치를 필수로 요구합니다.",
          practicalActions: [
            "작업 전 산소농도를 측정합니다.",
            "환기 설비를 가동한 뒤 작업을 시작합니다.",
          ],
        },
      },
      {
        id: "cite-guide-title-only",
        evidenceId: "guide-title-only",
        title: "외벽 도장 작업 기술지침",
        sourceBadge: "Guide",
        summary: "요약",
        order: 2,
        addedAt: new Date().toISOString(),
      },
    ];

    const sections = buildReportSectionsFromAssessment(assessment);
    const lawGuide = sectionContent("law-guide", sections);

    expect(lawGuide).toContain("[KOSHA Guide 인용]");
    expect(lawGuide).toContain("- 밀폐공간 작업 기술지침 (https://example.com/guide-with-summary)");
    expect(lawGuide).toContain("· 우리 회사 사고와의 관련성: 현재 사고는 밀폐공간 산소결핍 위험과 직접적으로 연관됩니다.");
    expect(lawGuide).toContain("· 적용 이유: 지침은 산소농도 측정 및 환기 조치를 필수로 요구합니다.");
    expect(lawGuide).toContain("· 실제 조치:");
    expect(lawGuide).toContain("  - 작업 전 산소농도를 측정합니다.");
    expect(lawGuide).toContain("  - 환기 설비를 가동한 뒤 작업을 시작합니다.");
    expect(lawGuide).toContain("- 외벽 도장 작업 기술지침 (https://example.com/guide-title-only)");
    expect(lawGuide).not.toContain("외벽 도장 작업 기술지침\n  · 우리 회사 사고와의 관련성");
  });

  it("includes cited law AI summary in law-guide section and keeps title-only when summary is missing", () => {
    const assessment = createMockAssessment();
    assessment.evidenceItems = [
      {
        id: "law-with-summary",
        type: "law",
        sourceBadge: "법령",
        title: "산업안전보건법 제74조",
        relevanceScore: 90,
        summaryBullets: ["안전인증대상 기계등은 인증 제품을 사용한다."],
        keywords: ["법령", "안전인증"],
        url: "https://example.com/law-with-summary",
      },
      {
        id: "law-title-only",
        type: "law",
        sourceBadge: "법령",
        title: "산업안전보건법 제31조",
        relevanceScore: 85,
        summaryBullets: ["작업환경 측정 기준을 준수한다."],
        keywords: ["법령", "작업환경"],
        url: "https://example.com/law-title-only",
      },
    ];

    assessment.citations = [
      {
        id: "cite-law-with-summary",
        evidenceId: "law-with-summary",
        title: "산업안전보건법 제74조",
        sourceBadge: "법령",
        summary: "요약",
        order: 1,
        addedAt: new Date().toISOString(),
        aiSummary: {
          incidentRelevance: "현재 사고는 인증 미준수 보호구/설비 사용 위험과 직접 연결됩니다.",
          applicabilityReason: "법령은 인증대상 기계·보호구의 적합 제품 사용을 의무화합니다.",
          practicalActions: [
            "작업 전 사용 장비의 인증 표시(KC 등) 여부를 확인합니다.",
            "미인증 장비는 즉시 사용 중지하고 교체합니다.",
          ],
        },
      },
      {
        id: "cite-law-title-only",
        evidenceId: "law-title-only",
        title: "산업안전보건법 제31조",
        sourceBadge: "법령",
        summary: "요약",
        order: 2,
        addedAt: new Date().toISOString(),
      },
    ];

    const sections = buildReportSectionsFromAssessment(assessment);
    const lawGuide = sectionContent("law-guide", sections);

    expect(lawGuide).toContain("[법령 인용]");
    expect(lawGuide).toContain("- 산업안전보건법 제74조 (https://example.com/law-with-summary)");
    expect(lawGuide).toContain("· 우리 회사 사고와의 관련성: 현재 사고는 인증 미준수 보호구/설비 사용 위험과 직접 연결됩니다.");
    expect(lawGuide).toContain("· 적용 이유: 법령은 인증대상 기계·보호구의 적합 제품 사용을 의무화합니다.");
    expect(lawGuide).toContain("· 실제 조치:");
    expect(lawGuide).toContain("  - 작업 전 사용 장비의 인증 표시(KC 등) 여부를 확인합니다.");
    expect(lawGuide).toContain("  - 미인증 장비는 즉시 사용 중지하고 교체합니다.");
    expect(lawGuide).toContain("- 산업안전보건법 제31조 (https://example.com/law-title-only)");
    expect(lawGuide).not.toContain("산업안전보건법 제31조\n  · 우리 회사 사고와의 관련성");
  });

  it("normalizes fatality source badges and auto-fills improvements/checklist when inputs are empty", () => {
    const assessment = createMockAssessment();

    assessment.analysis.improvements = [];
    assessment.checklistItems = [];
    assessment.analysis.immediateActions = [
      { id: "action-1", action: "안전대 착용 상태를 점검하라", priority: 1 },
    ];
    assessment.profile.hazards = [
      { id: "hazard-1", name: "추락", type: "추락", weight: 30, confidence: "high", reason: "고소 작업" },
    ];
    assessment.lawActionItems = [
      { id: "law-1", stage: "immediate", actionText: "작업반경 출입통제를 시행하라", articleNumbers: ["제1조"] },
      { id: "law-2", stage: "same_day", actionText: "다음 각 호의 작업 또는 장소에 울타리를 설치해야 한다", articleNumbers: ["제2조"] },
    ];

    assessment.evidenceItems = [
      {
        id: "fatality-a",
        type: "fatality",
        sourceBadge: "사고사망",
        title: "사고사망 항목",
        relevanceScore: 90,
        summaryBullets: ["사고사망 요약"],
        keywords: ["사망"],
      },
      {
        id: "fatality-b",
        type: "fatality",
        sourceBadge: "사망사고",
        title: "사망사고 항목",
        relevanceScore: 88,
        summaryBullets: ["사망사고 요약"],
        keywords: ["사망"],
      },
      {
        id: "fatality-c",
        type: "fatality",
        sourceBadge: "치명사고",
        title: "치명사고 항목",
        relevanceScore: 86,
        summaryBullets: ["치명사고 요약"],
        keywords: ["치명"],
      },
    ];

    assessment.citations = [
      {
        id: "cite-a",
        evidenceId: "fatality-a",
        title: "사고사망 항목",
        sourceBadge: "사고사망",
        summary: "사고사망 요약",
        order: 1,
        addedAt: new Date().toISOString(),
      },
      {
        id: "cite-b",
        evidenceId: "fatality-b",
        title: "사망사고 항목",
        sourceBadge: "사망사고",
        summary: "사망사고 요약",
        order: 2,
        addedAt: new Date().toISOString(),
      },
      {
        id: "cite-c",
        evidenceId: "fatality-c",
        title: "치명사고 항목",
        sourceBadge: "치명사고",
        summary: "치명사고 요약",
        order: 3,
        addedAt: new Date().toISOString(),
      },
    ];

    const sections = buildReportSectionsFromAssessment(assessment);
    const fatality = sectionContent("fatality-warning", sections);
    const improvements = sectionContent("improvements", sections);
    const checklist = sectionContent("checklist", sections);

    expect(fatality).toContain("사고사망 항목");
    expect(fatality).toContain("사망사고 항목");
    expect(fatality).toContain("치명사고 항목");

    expect(improvements).not.toBe("데이터 없음");
    expect(improvements).toContain("재발방지");

    expect(checklist).toContain("안전대 착용 상태를 점검해야 합니다.");
    expect(checklist).toContain("작업반경 출입통제를 시행해야 합니다.");
    expect(checklist).not.toContain("해야 합니다.해야 합니다.");
    expect(checklist).not.toMatch(/다음\\s*각\\s*호|비계\\(飛階\\)|제\\d+\\s*조/u);
  });

  it("rewrites law remedial actions into readable user-facing sentences", () => {
    const assessment = createMockAssessment();
    assessment.lawActionItems = [
      {
        id: "law-1",
        stage: "immediate",
        actionText: "다음 각 호의 작업 또는 장소에 울타리를 설치하는 등 관계 근로자가 아닌 사람의 출입해서는 안 됩니다.",
        lawName: "산업안전보건기준에 관한 규칙",
        articleTitle: "출입의 금지",
        articleNumbers: ["제20조"],
      },
      {
        id: "law-2",
        stage: "same_day",
        actionText: "① 사업주는 고소작업대를 설치하는 경우에는 다음 각 호에 해당하는 것을 설치하여야 한다. 관련 조치 이행 여부를 확인합니다.해야 합니다.",
        lawName: "산업안전보건기준에 관한 규칙",
        articleTitle: "고소작업대",
        articleNumbers: ["제186조"],
      },
      {
        id: "law-3",
        stage: "pre_resume",
        actionText: "가 착용하거나 취급하고 있는 도전성 공구·장비 등이 노출 충전부에 닿도록 할 것 근로자가 사다리를 노출 충전부가 있는 곳에서 사용하는 경우에는 도전성",
        lawName: "산업안전보건기준에 관한 규칙",
        legalBasis: "산업안전보건기준에 관한 규칙 제317조(충전전로 방호조치)",
        articleNumbers: ["제317조"],
      },
    ];

    const sections = buildReportSectionsFromAssessment(assessment);
    const lawRemedial = sectionContent("law-remedial-actions", sections);

    expect(lawRemedial).toContain("- [즉시]");
    expect(lawRemedial).toContain("- [당일]");
    expect(lawRemedial).toContain("- [재개 전]");
    expect(lawRemedial).toContain("출입 통제");
    expect(lawRemedial).toContain("고소작업대·리프트 안전장치 상태");
    expect(lawRemedial).toContain("전기 설비의 절연·접지·전원 차단 상태");
    expect(lawRemedial).toContain("(근거: 산업안전보건기준에 관한 규칙 제20조(출입의 금지))");
    expect(lawRemedial).toContain("(근거: 산업안전보건기준에 관한 규칙 제186조(고소작업대))");
    expect(lawRemedial).toContain("(근거: 산업안전보건기준에 관한 규칙 제317조(충전전로 방호조치))");
    expect(lawRemedial).not.toContain("다음 각 호");
    expect(lawRemedial).not.toContain("사업주는");
    expect(lawRemedial).not.toContain("해야 합니다.해야 합니다.");
    expect(lawRemedial).not.toMatch(/\(근거:\s*제\d+\s*조/u);
  });

  it("keeps review export in body + appendix structure", () => {
    const assessment = createMockAssessment();
    assessment.reportSections = buildReportSectionsFromAssessment(assessment);

    const sections = getReportExportSections(assessment, "review");
    const appendixSections = sections.filter((section) => section.group === "appendix");

    expect(appendixSections.map((section) => section.id)).toEqual([
      "disaster-cases",
      "fatality-warning",
      "law-guide",
      "materials",
    ]);
  });
});
