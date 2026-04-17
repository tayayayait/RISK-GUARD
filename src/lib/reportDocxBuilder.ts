import type { AssessmentData, ReportProfile } from "@/types/assessment";
import { buildZip, escapeXml } from "@/lib/documentBuilder";
import {
  getReportBriefingText,
  getReportChecklistItems,
  getReportExportSections,
  getReportProfileLabel,
} from "@/lib/reportExportContent";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function toDisplayDate(value?: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const normalized = value.slice(0, 10);
  return normalized || new Date().toISOString().slice(0, 10);
}

function sectionHeading(title: string, index: number) {
  return `
    <w:p>
      <w:pPr>
        <w:spacing w:before="260" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="26"/>
        </w:rPr>
        <w:t>${escapeXml(`${index}. ${title}`)}</w:t>
      </w:r>
    </w:p>
  `;
}

function textParagraph(text: string, options: { spacingAfter?: number } = {}) {
  const lines = text.split("\n");
  const spacingAfter = options.spacingAfter ?? 120;
  const runs = lines.map((line, index) => {
    const safeLine = line.length > 0 ? line : " ";
    const xmlSpace = safeLine.startsWith(" ") || safeLine.endsWith(" ") ? ' xml:space="preserve"' : "";
    const lineRun = `<w:r><w:t${xmlSpace}>${escapeXml(safeLine)}</w:t></w:r>`;
    return index === 0 ? lineRun : `<w:br/>${lineRun}`;
  }).join("");

  return `
    <w:p>
      <w:pPr>
        <w:spacing w:after="${spacingAfter}"/>
      </w:pPr>
      ${runs}
    </w:p>
  `;
}

function buildSectionProperties() {
  return `
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  `;
}

function buildSectionXml(assessment: AssessmentData, profile: ReportProfile) {
  const sections = getReportExportSections(assessment, profile);
  let headingIndex = 1;
  let hasAppendixHeading = false;
  let xml = "";

  sections.forEach((section) => {
    if (section.group === "appendix" && !hasAppendixHeading) {
      xml += `${sectionHeading("부록", headingIndex)}${textParagraph("근거 및 참고 자료")}`;
      headingIndex += 1;
      hasAppendixHeading = true;
    }

    xml += `${sectionHeading(section.title, headingIndex)}${textParagraph(section.content || "내용 없음")}`;
    headingIndex += 1;
  });

  return { xml, headingIndex };
}

export function buildReportDocxDocumentXml(assessment: AssessmentData, profile: ReportProfile) {
  const checklistItems = getReportChecklistItems(assessment);
  const briefingText = getReportBriefingText(assessment);
  const generatedAt = toDisplayDate(assessment.updatedAt || assessment.createdAt);
  const riskLevel = assessment.analysis.level.toUpperCase();
  const riskScore = `${assessment.analysis.score}점`;
  const profileLabel = getReportProfileLabel(profile);
  const title = `RISK-GUARD 위험성평가 결과 보고서 (${profileLabel})`;

  const sectionResult = buildSectionXml(assessment, profile);
  const checklistXml = checklistItems.length > 0
    ? checklistItems.map((item, index) => textParagraph(`${index + 1}. ${item}`, { spacingAfter: 80 })).join("")
    : textParagraph("체크리스트 항목 없음");

  const briefingXml = textParagraph(briefingText || "브리핑 문안 없음");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:spacing w:after="260"/></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:sz w:val="34"/></w:rPr>
        <w:t>${escapeXml(title)}</w:t>
      </w:r>
    </w:p>
    ${textParagraph(`작업명: ${assessment.taskName || "미입력"}`)}
    ${textParagraph(`생성일: ${generatedAt}`)}
    ${textParagraph(`위험등급: ${riskLevel} (${riskScore})`, { spacingAfter: 220 })}
    ${sectionResult.xml}
    ${sectionHeading("작업 전 체크리스트", sectionResult.headingIndex)}
    ${checklistXml}
    ${sectionHeading("작업 전 안전 브리핑 문안", sectionResult.headingIndex + 1)}
    ${briefingXml}
    ${buildSectionProperties()}
  </w:body>
</w:document>`;
}

export function buildReportDocxBlob(assessment: AssessmentData, profile: ReportProfile) {
  const documentXml = buildReportDocxDocumentXml(assessment, profile);

  return buildZip(
    [
      {
        name: "[Content_Types].xml",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
      },
      {
        name: "_rels/.rels",
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
      },
      {
        name: "word/document.xml",
        content: documentXml,
      },
    ],
    DOCX_MIME_TYPE,
  );
}

