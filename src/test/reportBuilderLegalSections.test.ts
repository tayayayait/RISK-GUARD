import { describe, expect, it } from "vitest";
import { buildReportSectionsFromAssessment } from "@/lib/reportBuilder";
import { getReportExportSections } from "@/lib/reportExportContent";
import { createMockAssessment } from "@/data/mockData";
import type { AssessmentData } from "@/types/assessment";
import type { RiskAssessmentRow } from "@/types/formTemplate";

const riskRow: RiskAssessmentRow = {
  workProcess: "외벽 도장",
  category: "작업특성 요인",
  cause: "발판 미고정",
  hazardFactor: "고소 작업 중 추락",
  legalBasis: "산업안전보건기준에 관한 규칙 제42조",
  currentMeasure: "안전대 착용",
  frequency: 3,
  severity: 4,
  riskLevel: "12(보통)",
  reductionMeasure: "안전난간 설치",
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

function createAssessment(overrides: Partial<AssessmentData> = {}): AssessmentData {
  return {
    ...createMockAssessment(),
    riskRows: [riskRow],
    participants: [
      {
        id: "participant-1",
        name: "김근로",
        role: "worker_representative",
        affiliation: "도장반",
        method: "site_patrol",
        participatedAt: "2026-04-10",
      },
    ],
    shareRecords: [
      {
        id: "share-1",
        phase: "after",
        method: "posting",
        sharedAt: "2026-04-14",
        audienceNote: "도장반 12명",
        content: "위험성 결정 결과와 개선대책 게시",
      },
    ],
    ...overrides,
  } as AssessmentData;
}

function findSection(assessment: AssessmentData, id: string) {
  return buildReportSectionsFromAssessment(assessment).find((section) => section.id === id);
}

describe("report sections for statutory records", () => {
  it("위험성평가표 섹션에 허용 여부·개선 후 위험성·이행 상태를 담는다", () => {
    const section = findSection(createAssessment(), "risk-table");

    expect(section).toBeDefined();
    expect(section?.title).toBe("위험성평가표");
    expect(section?.content).toContain("고소 작업 중 추락");
    expect(section?.content).toContain("현재 위험성: 12(보통) (허용 불가)");
    expect(section?.content).toContain("개선 후 위험성: 6(보통) (허용 가능)");
    expect(section?.content).toContain("담당자/개선기한: 유창제 / 2026-04-08");
    expect(section?.content).toContain("이행 상태: 진행중");
  });

  it("참여자와 공유 기록 섹션을 만든다", () => {
    const assessment = createAssessment();

    expect(findSection(assessment, "participants")?.content)
      .toContain("김근로 (도장반) · 근로자대표 · 사업장 순회점검 · 2026-04-10");
    expect(findSection(assessment, "share-records")?.content)
      .toContain("[실시 후 (결과 공유)] 사업장 게시 · 2026-04-14 · 대상: 도장반 12명");
  });

  it("기록이 없으면 없음 문구를 남긴다", () => {
    const empty = createAssessment({ riskRows: [], participants: [], shareRecords: [] });

    expect(findSection(empty, "risk-table")?.content).toBe("위험성평가표 데이터 없음");
    expect(findSection(empty, "participants")?.content).toBe("참여자 기록 없음");
    expect(findSection(empty, "share-records")?.content).toBe("공유 기록 없음");
  });

  it("제출용·검토용 내보내기 모두에 법정 기록이 포함된다", () => {
    const assessment = createAssessment();
    assessment.reportSections = buildReportSectionsFromAssessment(assessment);

    for (const profile of ["submission", "review"] as const) {
      const ids = getReportExportSections(assessment, profile).map((section) => section.id);
      expect(ids).toContain("risk-table");
      expect(ids).toContain("participants");
      expect(ids).toContain("share-records");
    }
  });
});
