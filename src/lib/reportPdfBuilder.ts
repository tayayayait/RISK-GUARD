import type { jsPDF } from "jspdf";
import type { AssessmentData, ReportProfile } from "@/types/assessment";
import { REPORT_PDF_EXPORT_ROOT_ID } from "@/lib/exportRootIds";
import {
  getReportBriefingText,
  getReportChecklistItems,
  getReportExportSections,
  getReportProfileLabel,
} from "@/lib/reportExportContent";

const URL_PATTERN = /https?:\/\/[^\s)]+/g;

interface LinkRect {
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

function toDisplayDate(value?: string) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  return value.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

function appendTextWithLinks(parent: HTMLElement, text: string) {
  URL_PATTERN.lastIndex = 0;
  let currentIndex = 0;
  let match = URL_PATTERN.exec(text);

  while (match) {
    const [url] = match;
    const matchIndex = match.index;

    if (matchIndex > currentIndex) {
      parent.append(document.createTextNode(text.slice(currentIndex, matchIndex)));
    }

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.dataset.reportLink = "true";
    link.style.color = "#1d4ed8";
    link.style.textDecoration = "underline";
    link.textContent = url;
    parent.appendChild(link);

    currentIndex = matchIndex + url.length;
    match = URL_PATTERN.exec(text);
  }

  if (currentIndex < text.length) {
    parent.append(document.createTextNode(text.slice(currentIndex)));
  }
}

function paragraphElement(text: string) {
  const paragraph = document.createElement("p");
  paragraph.style.margin = "0 0 10px";
  paragraph.style.whiteSpace = "pre-wrap";
  paragraph.style.lineHeight = "1.6";
  paragraph.style.fontSize = "14px";
  appendTextWithLinks(paragraph, text);
  return paragraph;
}

function headingElement(text: string) {
  const heading = document.createElement("h2");
  heading.style.margin = "28px 0 10px";
  heading.style.fontSize = "20px";
  heading.style.fontWeight = "700";
  heading.textContent = text;
  return heading;
}

function collectLinkRects(root: HTMLElement): LinkRect[] {
  const rootRect = root.getBoundingClientRect();
  const links = root.querySelectorAll<HTMLAnchorElement>("a[data-report-link='true']");
  const rects: LinkRect[] = [];

  links.forEach((anchor) => {
    const url = anchor.getAttribute("href");
    if (!url) {
      return;
    }

    Array.from(anchor.getClientRects()).forEach((rect) => {
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      rects.push({
        url,
        left: rect.left - rootRect.left,
        top: rect.top - rootRect.top,
        width: rect.width,
        height: rect.height,
      });
    });
  });

  return rects;
}

function applyPdfLinkAnnotations(
  pdf: jsPDF,
  linkRects: LinkRect[],
  options: {
    canvasWidth: number;
    canvasHeight: number;
    elementWidth: number;
    elementHeight: number;
    pageWidth: number;
    pageHeight: number;
    pageCount: number;
  },
) {
  if (linkRects.length === 0) {
    return;
  }

  const scaleX = options.canvasWidth / Math.max(1, options.elementWidth);
  const scaleY = options.canvasHeight / Math.max(1, options.elementHeight);
  const pointPerCanvasPixel = options.pageWidth / options.canvasWidth;

  linkRects.forEach((linkRect) => {
    const x = (linkRect.left * scaleX) * pointPerCanvasPixel;
    const top = (linkRect.top * scaleY) * pointPerCanvasPixel;
    const width = (linkRect.width * scaleX) * pointPerCanvasPixel;
    const height = (linkRect.height * scaleY) * pointPerCanvasPixel;
    const bottom = top + height;

    for (let pageIndex = 0; pageIndex < options.pageCount; pageIndex += 1) {
      const pageTop = pageIndex * options.pageHeight;
      const pageBottom = pageTop + options.pageHeight;
      const visibleTop = Math.max(top, pageTop);
      const visibleBottom = Math.min(bottom, pageBottom);
      const visibleHeight = visibleBottom - visibleTop;

      if (visibleHeight <= 0) {
        continue;
      }

      pdf.setPage(pageIndex + 1);
      pdf.link(x, visibleTop - pageTop, width, visibleHeight, { url: linkRect.url });
    }
  });
}

export function createReportPdfExportElement(assessment: AssessmentData, profile: ReportProfile): HTMLDivElement {
  const sections = getReportExportSections(assessment, profile);
  const checklistItems = getReportChecklistItems(assessment);
  const briefingText = getReportBriefingText(assessment);
  const profileLabel = getReportProfileLabel(profile);

  const root = document.createElement("div");
  root.id = REPORT_PDF_EXPORT_ROOT_ID;
  root.style.position = "fixed";
  root.style.left = "-100000px";
  root.style.top = "0";
  root.style.zIndex = "-1";
  root.style.background = "#ffffff";
  root.style.width = "794px";
  root.style.boxSizing = "border-box";
  root.style.padding = "40px 48px";
  root.style.color = "#0f172a";
  root.style.fontFamily = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

  const title = document.createElement("h1");
  title.style.margin = "0 0 16px";
  title.style.fontSize = "28px";
  title.style.fontWeight = "800";
  title.textContent = `RISK-GUARD 위험성평가 결과 보고서 (${profileLabel})`;
  root.appendChild(title);

  root.appendChild(paragraphElement(`작업명: ${assessment.taskName || "미입력"}`));
  root.appendChild(paragraphElement(`생성일: ${toDisplayDate(assessment.updatedAt || assessment.createdAt)}`));
  root.appendChild(paragraphElement(`위험등급: ${assessment.analysis.level.toUpperCase()} (${assessment.analysis.score}점)`));

  let hasAppendixHeading = false;
  sections.forEach((section, index) => {
    if (section.group === "appendix" && !hasAppendixHeading) {
      root.appendChild(headingElement("부록"));
      root.appendChild(paragraphElement("근거 및 참고 자료"));
      hasAppendixHeading = true;
    }
    root.appendChild(headingElement(`${index + 1}. ${section.title}`));
    root.appendChild(paragraphElement(section.content || "내용 없음"));
  });

  root.appendChild(headingElement(`${sections.length + 1}. 작업 전 체크리스트`));
  if (checklistItems.length > 0) {
    checklistItems.forEach((item, index) => {
      root.appendChild(paragraphElement(`${index + 1}. ${item}`));
    });
  } else {
    root.appendChild(paragraphElement("체크리스트 항목 없음"));
  }

  root.appendChild(headingElement(`${sections.length + 2}. 작업 전 안전 브리핑 문안`));
  root.appendChild(paragraphElement(briefingText || "브리핑 문안 없음"));

  return root;
}

export async function buildReportPdfBlob(assessment: AssessmentData, profile: ReportProfile): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const element = createReportPdfExportElement(assessment, profile);
  document.body.appendChild(element);

  try {
    const linkRects = collectLinkRects(element);
    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
      width: element.scrollWidth,
      height: element.scrollHeight,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(document.documentElement.clientWidth, element.scrollWidth),
      windowHeight: Math.max(document.documentElement.clientHeight, element.scrollHeight),
    });

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageData = canvas.toDataURL("image/png");
    const imageHeight = (canvas.height * pageWidth) / canvas.width;
    const pageCount = Math.max(1, Math.ceil(imageHeight / pageHeight));

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      if (pageIndex > 0) {
        pdf.addPage();
      }
      const yOffset = -(pageIndex * pageHeight);
      pdf.addImage(imageData, "PNG", 0, yOffset, pageWidth, imageHeight, undefined, "FAST");
    }

    applyPdfLinkAnnotations(pdf, linkRects, {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      elementWidth: element.scrollWidth,
      elementHeight: element.scrollHeight,
      pageWidth,
      pageHeight,
      pageCount,
    });

    return pdf.output("blob");
  } finally {
    if (element.parentElement) {
      element.parentElement.removeChild(element);
    }
  }
}

