import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAssessment } from "@/data/mockData";

const mocks = vi.hoisted(() => ({
  buildReportPdfBlob: vi.fn(async () => new Blob(["pdf"], { type: "application/pdf" })),
  buildReportDocxBlob: vi.fn(() => new Blob(["docx"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })),
  writeText: vi.fn(async () => {}),
  createObjectURL: vi.fn(() => "blob:report-export"),
  revokeObjectURL: vi.fn(),
  anchorDownloads: [] as string[],
}));

vi.mock("@/lib/reportPdfBuilder", () => ({
  buildReportPdfBlob: mocks.buildReportPdfBlob,
}));

vi.mock("@/lib/reportDocxBuilder", () => ({
  buildReportDocxBlob: mocks.buildReportDocxBlob,
}));

describe("ReportService", () => {
  beforeEach(() => {
    mocks.buildReportPdfBlob.mockClear();
    mocks.buildReportDocxBlob.mockClear();
    mocks.writeText.mockClear();
    mocks.createObjectURL.mockClear();
    mocks.revokeObjectURL.mockClear();
    mocks.anchorDownloads.length = 0;

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: mocks.writeText,
      },
    });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: mocks.createObjectURL,
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: mocks.revokeObjectURL,
    });

    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: function captureDownload(this: HTMLAnchorElement) {
        mocks.anchorDownloads.push(this.download);
      },
    });
  });

  it("routes clipboard format with selected profile content", async () => {
    const { ReportService } = await import("@/services/reportService");
    const assessment = createMockAssessment();
    assessment.reportSections = [
      { id: "overview", title: "작업 개요", content: "본문", editable: true, order: 1 },
    ];

    await ReportService.exportByFormat("clipboard", assessment, "submission");

    expect(mocks.writeText).toHaveBeenCalledTimes(1);
    const copiedText = mocks.writeText.mock.calls[0][0] as string;
    expect(copiedText).toContain("RISK-GUARD 위험성평가 결과 보고서 (제출용)");
    expect(mocks.buildReportPdfBlob).not.toHaveBeenCalled();
    expect(mocks.buildReportDocxBlob).not.toHaveBeenCalled();
  });

  it("routes pdf format to report pdf builder and adds profile suffix to filename", async () => {
    const { ReportService } = await import("@/services/reportService");
    const assessment = createMockAssessment();
    assessment.taskName = "외벽 도장 작업";

    await ReportService.exportByFormat("pdf", assessment, "review");

    expect(mocks.buildReportPdfBlob).toHaveBeenCalledWith(assessment, "review");
    expect(mocks.buildReportDocxBlob).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.anchorDownloads[0]).toMatch(/_review\.pdf$/);
    expect(mocks.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("routes docx format to report docx builder and adds profile suffix to filename", async () => {
    const { ReportService } = await import("@/services/reportService");
    const assessment = createMockAssessment();

    await ReportService.exportByFormat("docx", assessment, "submission");

    expect(mocks.buildReportDocxBlob).toHaveBeenCalledWith(assessment, "submission");
    expect(mocks.buildReportPdfBlob).not.toHaveBeenCalled();
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
    expect(mocks.anchorDownloads[0]).toMatch(/_submission\.docx$/);
    expect(mocks.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

