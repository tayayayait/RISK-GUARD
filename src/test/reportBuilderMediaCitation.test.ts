import { describe, expect, it } from "vitest";
import { createMockAssessment } from "@/data/mockData";
import { buildReportSectionsFromAssessment } from "@/lib/reportBuilder";
import { getReportExportSections } from "@/lib/reportExportContent";

describe("report export citation mapping", () => {
  it("keeps law/guide/media links but strips education-links block in submission profile", () => {
    const assessment = createMockAssessment();
    assessment.evidenceItems = [
      {
        id: "law-1",
        type: "law",
        sourceBadge: "법령",
        title: "산업안전보건기준 규칙 제1조",
        relevanceScore: 92,
        summaryBullets: ["요약"],
        keywords: ["법령"],
        url: "https://example.com/law-1",
      },
      {
        id: "guide-1",
        type: "law",
        sourceBadge: "Guide",
        title: "고위험현장 기술지침",
        relevanceScore: 88,
        summaryBullets: ["요약"],
        keywords: ["guide"],
        url: "https://example.com/guide-1",
      },
      {
        id: "media-1",
        type: "law",
        sourceBadge: "미디어",
        title: "안전보호구 OPS",
        relevanceScore: 86,
        summaryBullets: ["요약"],
        keywords: ["ops"],
        url: "https://example.com/media-1",
      },
    ];

    assessment.citations = [
      {
        id: "c-law",
        evidenceId: "law-1",
        title: "산업안전보건기준 규칙 제1조",
        sourceBadge: "법령",
        summary: "요약",
        order: 1,
        addedAt: new Date().toISOString(),
      },
      {
        id: "c-guide",
        evidenceId: "guide-1",
        title: "고위험현장 기술지침",
        sourceBadge: "Guide",
        summary: "요약",
        order: 2,
        addedAt: new Date().toISOString(),
      },
      {
        id: "c-media",
        evidenceId: "media-1",
        title: "안전보호구 OPS",
        sourceBadge: "미디어",
        summary: "요약",
        order: 3,
        addedAt: new Date().toISOString(),
      },
    ];

    assessment.materials = [
      {
        id: "mat-1",
        type: "OPS",
        title: "2025 중대재해 사고보고서",
        url: "https://example.com/material-1",
        language: "국문",
        relevance: 100,
        recommendReason: "추천",
      },
    ];
    assessment.selectedMaterials = ["mat-1"];
    assessment.reportSections = buildReportSectionsFromAssessment(assessment);

    const submissionSections = getReportExportSections(assessment, "submission");
    const lawSummary = submissionSections.find((section) => section.id === "law-guide-summary");

    expect(lawSummary).toBeTruthy();
    expect(lawSummary?.content).toContain("[법령 인용]");
    expect(lawSummary?.content).toContain("산업안전보건기준 규칙 제1조 (https://example.com/law-1)");
    expect(lawSummary?.content).toContain("고위험현장 기술지침 (https://example.com/guide-1)");
    expect(lawSummary?.content).toContain("안전보호구 OPS (https://example.com/media-1)");
    expect(lawSummary?.content).not.toContain("[교육자료 링크]");
    expect(lawSummary?.content).not.toContain("2025 중대재해 사고보고서");
  });
});

