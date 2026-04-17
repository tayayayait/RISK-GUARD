import type { AssessmentData, ReportProfile, ReportSection } from "@/types/assessment";
import { buildReportSectionsFromAssessment } from "@/lib/reportBuilder";

type SectionGroup = "body" | "appendix";

export interface ReportExportSection {
  id: string;
  title: string;
  content: string;
  order: number;
  group: SectionGroup;
}

const EXCLUDED_SECTION_IDS = new Set(["header", "checklist", "briefing"]);
const REVIEW_BODY_ORDER = ["overview", "profile", "hazards", "risk-level", "law-remedial-actions", "improvements"];
const REVIEW_APPENDIX_ORDER = ["disaster-cases", "fatality-warning", "law-guide", "materials"];

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function getBaseSections(assessment: AssessmentData) {
  const sections = assessment.reportSections.length > 0
    ? assessment.reportSections
    : buildReportSectionsFromAssessment(assessment);

  return sections
    .filter((section) => !EXCLUDED_SECTION_IDS.has(section.id))
    .sort((left, right) => left.order - right.order)
    .map((section) => ({
      ...section,
      content: normalizeText(section.content),
    }));
}

function getBaseSectionMap(sections: ReportSection[]) {
  return new Map(sections.map((section) => [section.id, section]));
}

function createExportSection(
  section: Pick<ReportSection, "id" | "title" | "content">,
  order: number,
  group: SectionGroup,
): ReportExportSection {
  return {
    id: section.id,
    title: section.title,
    content: normalizeText(section.content),
    order,
    group,
  };
}

function stripEducationLinks(content: string) {
  const marker = "[교육자료 링크]";
  const markerIndex = content.indexOf(marker);
  if (markerIndex < 0) {
    return content.trim();
  }
  return content.slice(0, markerIndex).trim();
}

function buildSubmissionSections(baseSections: ReportSection[]): ReportExportSection[] {
  const byId = getBaseSectionMap(baseSections);
  const sections: ReportExportSection[] = [];
  let order = 1;

  const appendIfExists = (id: string) => {
    const section = byId.get(id);
    if (!section) {
      return;
    }
    sections.push(createExportSection(section, order, "body"));
    order += 1;
  };

  appendIfExists("overview");
  appendIfExists("hazards");
  appendIfExists("risk-level");

  const lawRemedial = normalizeText(byId.get("law-remedial-actions")?.content);
  const improvements = normalizeText(byId.get("improvements")?.content);
  const actionPlanParts = [
    lawRemedial ? `[법령 기반 개선조치]\n${lawRemedial}` : "",
    improvements ? `[권장 개선조치]\n${improvements}` : "",
  ].filter((part) => part.length > 0);

  sections.push({
    id: "action-plan",
    title: "조치계획",
    content: actionPlanParts.join("\n\n").trim() || "조치계획 내용 없음",
    order,
    group: "body",
  });
  order += 1;

  const lawGuideContent = normalizeText(byId.get("law-guide")?.content);
  const lawGuideSummary = stripEducationLinks(lawGuideContent);
  sections.push({
    id: "law-guide-summary",
    title: "법령·가이드 근거 요약",
    content: lawGuideSummary || "근거 수집 실패 또는 미선택",
    order,
    group: "body",
  });

  return sections;
}

function buildReviewSections(baseSections: ReportSection[]): ReportExportSection[] {
  const byId = getBaseSectionMap(baseSections);
  const selectedIds = new Set<string>();

  const bodySections: ReportExportSection[] = [];
  let order = 1;

  for (const id of REVIEW_BODY_ORDER) {
    const section = byId.get(id);
    if (!section) {
      continue;
    }
    bodySections.push(createExportSection(section, order, "body"));
    selectedIds.add(id);
    order += 1;
  }

  for (const section of baseSections) {
    if (selectedIds.has(section.id) || REVIEW_APPENDIX_ORDER.includes(section.id)) {
      continue;
    }
    bodySections.push(createExportSection(section, order, "body"));
    selectedIds.add(section.id);
    order += 1;
  }

  const appendixSections: ReportExportSection[] = [];
  for (const id of REVIEW_APPENDIX_ORDER) {
    const section = byId.get(id);
    if (!section) {
      continue;
    }
    appendixSections.push(createExportSection(section, order, "appendix"));
    selectedIds.add(id);
    order += 1;
  }

  return [...bodySections, ...appendixSections];
}

export function getReportProfileLabel(profile: ReportProfile) {
  return profile === "submission" ? "제출용" : "검토용";
}

export function getReportExportSections(assessment: AssessmentData, profile: ReportProfile): ReportExportSection[] {
  const baseSections = getBaseSections(assessment);
  if (profile === "submission") {
    return buildSubmissionSections(baseSections);
  }
  return buildReviewSections(baseSections);
}

export function getReportChecklistItems(assessment: AssessmentData): string[] {
  return assessment.checklistItems
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
}

export function getReportBriefingText(assessment: AssessmentData): string {
  return normalizeText(assessment.briefingText);
}

