import type { AssessmentData, ExportFormat, ReportProfile } from "@/types/assessment";
import { buildReportDocxBlob } from "@/lib/reportDocxBuilder";
import {
  getReportBriefingText,
  getReportChecklistItems,
  getReportExportSections,
  getReportProfileLabel,
} from "@/lib/reportExportContent";

function downloadBlob(fileName: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
}

function buildFileName(taskName: string, format: "pdf" | "docx", profile: ReportProfile) {
  const safeTaskName = taskName.replace(/[\\/:*?"<>|]/g, "_").trim() || "assessment";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `RISK-GUARD_${safeTaskName}_${date}_${profile}.${format}`;
}

function buildPlainTextExport(assessment: AssessmentData, profile: ReportProfile) {
  const sections = getReportExportSections(assessment, profile);
  const checklistItems = getReportChecklistItems(assessment);
  const briefingText = getReportBriefingText(assessment);
  const profileLabel = getReportProfileLabel(profile);

  const lines: string[] = [
    `# RISK-GUARD 위험성평가 결과 보고서 (${profileLabel})`,
    "",
    `작업명: ${assessment.taskName || "미입력"}`,
    `생성일: ${(assessment.updatedAt || assessment.createdAt).slice(0, 10)}`,
    `위험등급: ${assessment.analysis.level.toUpperCase()} (${assessment.analysis.score}점)`,
    "",
  ];

  let hasAppendixHeading = false;
  sections.forEach((section, index) => {
    if (section.group === "appendix" && !hasAppendixHeading) {
      lines.push("## 부록", "");
      hasAppendixHeading = true;
    }
    lines.push(`## ${index + 1}. ${section.title}`, "", section.content || "내용 없음", "");
  });

  lines.push("## 작업 전 체크리스트", "");
  if (checklistItems.length > 0) {
    checklistItems.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  } else {
    lines.push("체크리스트 항목 없음");
  }

  lines.push("", "## 작업 전 안전 브리핑 문안", "", briefingText || "브리핑 문안 없음");
  return lines.join("\n").trim();
}

export const ReportService = {
  async copyClipboard(assessment: AssessmentData, profile: ReportProfile) {
    const text = buildPlainTextExport(assessment, profile);
    await navigator.clipboard.writeText(text);
    return { message: "Clipboard copy complete." };
  },

  async exportPdf(assessment: AssessmentData, profile: ReportProfile) {
    const fileName = buildFileName(assessment.taskName, "pdf", profile);
    const { buildReportPdfBlob } = await import("@/lib/reportPdfBuilder");
    const pdfBlob = await buildReportPdfBlob(assessment, profile);
    downloadBlob(fileName, pdfBlob);
    return { fileName };
  },

  async exportDocx(assessment: AssessmentData, profile: ReportProfile) {
    const fileName = buildFileName(assessment.taskName, "docx", profile);
    downloadBlob(fileName, buildReportDocxBlob(assessment, profile));
    return { fileName };
  },

  async exportByFormat(format: ExportFormat, assessment: AssessmentData, profile: ReportProfile) {
    if (format === "clipboard") {
      return this.copyClipboard(assessment, profile);
    }
    if (format === "pdf") {
      return this.exportPdf(assessment, profile);
    }
    return this.exportDocx(assessment, profile);
  },
};
