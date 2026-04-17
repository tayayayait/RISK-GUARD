import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAssessment } from "@/data/mockData";

const mocks = vi.hoisted(() => {
  const addImageMock = vi.fn();
  const addPageMock = vi.fn();
  const setPageMock = vi.fn();
  const linkMock = vi.fn();
  const outputMock = vi.fn(() => new Blob(["pdf"], { type: "application/pdf" }));
  const html2canvasMock = vi.fn(async () => {
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "width", { configurable: true, value: 1000 });
    Object.defineProperty(canvas, "height", { configurable: true, value: 4000 });
    Object.defineProperty(canvas, "toDataURL", {
      configurable: true,
      value: vi.fn(() => "data:image/png;base64,mock"),
    });
    return canvas;
  });

  return {
    addImageMock,
    addPageMock,
    setPageMock,
    linkMock,
    outputMock,
    html2canvasMock,
  };
});

vi.mock("jspdf", () => {
  class MockJsPDF {
    internal = {
      pageSize: {
        getWidth: () => 595,
        getHeight: () => 842,
      },
    };

    addImage = mocks.addImageMock;

    addPage = mocks.addPageMock;

    setPage = mocks.setPageMock;

    link = mocks.linkMock;

    output = mocks.outputMock;
  }

  return { jsPDF: MockJsPDF };
});

vi.mock("html2canvas", () => ({
  default: mocks.html2canvasMock,
}));

function buildAssessmentFixture() {
  const assessment = createMockAssessment();
  assessment.reportSections = [
    {
      id: "overview",
      title: "작업 개요",
      content: "보고서 본문\n- 링크 (https://example.com/evidence-link)",
      editable: true,
      order: 1,
    },
    {
      id: "hazards",
      title: "주요 위험요인",
      content: "- 추락",
      editable: true,
      order: 2,
    },
    {
      id: "risk-level",
      title: "위험등급 및 즉시 조치",
      content: "위험등급: HIGH",
      editable: true,
      order: 3,
    },
    {
      id: "law-remedial-actions",
      title: "법령 기반 개선조치",
      content: "- 법령 조치",
      editable: true,
      order: 4,
    },
    {
      id: "improvements",
      title: "권장 개선조치",
      content: "- 권장 조치",
      editable: true,
      order: 5,
    },
    {
      id: "law-guide",
      title: "법령 및 KOSHA Guide 근거",
      content: "[법령 인용]\n- 산업안전보건기준 규칙 제1조\n\n[교육자료 링크]\n- 링크 항목",
      editable: true,
      order: 6,
    },
    {
      id: "disaster-cases",
      title: "유사 재해사례 요약",
      content: "재해 사례 본문",
      editable: true,
      order: 7,
    },
    {
      id: "materials",
      title: "추천 교육자료",
      content: "교육자료 본문",
      editable: true,
      order: 8,
    },
    { id: "checklist", title: "작업 전 체크리스트", content: "", editable: false, order: 9 },
    { id: "briefing", title: "작업 전 안전 브리핑 문안", content: "", editable: false, order: 10 },
  ];
  assessment.checklistItems = ["항목 1"];
  assessment.briefingText = "브리핑";
  return assessment;
}

describe("report pdf builder", () => {
  beforeEach(() => {
    mocks.addImageMock.mockClear();
    mocks.addPageMock.mockClear();
    mocks.setPageMock.mockClear();
    mocks.linkMock.mockClear();
    mocks.outputMock.mockClear();
    mocks.html2canvasMock.mockClear();

    Object.defineProperty(HTMLAnchorElement.prototype, "getClientRects", {
      configurable: true,
      value: () => ([
        {
          left: 120,
          top: 180,
          width: 260,
          height: 24,
          right: 380,
          bottom: 204,
          x: 120,
          y: 180,
          toJSON: () => ({}),
        },
      ] as unknown as DOMRectList),
    });

    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get: () => 794,
    });

    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 1400,
    });
  });

  it("builds submission preview element without education-link section text", async () => {
    const { createReportPdfExportElement } = await import("@/lib/reportPdfBuilder");
    const assessment = buildAssessmentFixture();

    const element = createReportPdfExportElement(assessment, "submission");
    const text = element.textContent ?? "";

    expect(text).toContain("RISK-GUARD 위험성평가 결과 보고서 (제출용)");
    expect(text).toContain("조치계획");
    expect(text).not.toContain("[교육자료 링크]");
    expect(text).not.toContain("재해 사례 본문");
  });

  it("captures a hidden review report element and splits the image into multiple A4 pages", async () => {
    const [{ buildReportPdfBlob }, { REPORT_PDF_EXPORT_ROOT_ID }] = await Promise.all([
      import("@/lib/reportPdfBuilder"),
      import("@/lib/exportRootIds"),
    ]);
    const assessment = buildAssessmentFixture();

    expect(document.getElementById(REPORT_PDF_EXPORT_ROOT_ID)).toBeNull();
    const blob = await buildReportPdfBlob(assessment, "review");

    expect(mocks.html2canvasMock).toHaveBeenCalledTimes(1);
    expect(mocks.addImageMock).toHaveBeenCalledTimes(3);
    expect(mocks.addPageMock).toHaveBeenCalledTimes(2);
    expect(mocks.setPageMock).toHaveBeenCalled();
    expect(mocks.linkMock).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      { url: "https://example.com/evidence-link" },
    );
    expect(mocks.outputMock).toHaveBeenCalledWith("blob");
    expect(blob.type).toBe("application/pdf");
    expect(document.getElementById(REPORT_PDF_EXPORT_ROOT_ID)).toBeNull();
  });
});

