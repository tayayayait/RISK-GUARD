import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const addImageMock = vi.fn();
  const saveMock = vi.fn();
  const html2canvasMock = vi.fn(async () => {
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "width", { configurable: true, value: 1200 });
    Object.defineProperty(canvas, "height", { configurable: true, value: 1696 });
    return canvas;
  });

  return {
    addImageMock,
    saveMock,
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

    save = mocks.saveMock;
  }

  return {
    jsPDF: MockJsPDF,
  };
});

vi.mock("html2canvas", () => ({
  default: mocks.html2canvasMock,
}));

describe("downloadAccidentReportPdfFromElement", () => {
  beforeEach(() => {
    mocks.addImageMock.mockClear();
    mocks.saveMock.mockClear();
    mocks.html2canvasMock.mockClear();
  });

  it("renders the captured form into full-page A4 without margins", async () => {
    const { downloadAccidentReportPdfFromElement } = await import("@/lib/accidentReportPdfBuilder");

    const element = document.createElement("div");
    Object.defineProperty(element, "scrollWidth", { configurable: true, value: 900 });
    Object.defineProperty(element, "scrollHeight", { configurable: true, value: 1200 });

    await downloadAccidentReportPdfFromElement(element, "테스트/사고");

    expect(mocks.html2canvasMock).toHaveBeenCalledTimes(1);
    expect(mocks.addImageMock).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), "PNG", 0, 0, 595, 842, undefined, "FAST");
    expect(mocks.saveMock).toHaveBeenCalledWith("산업재해조사표-테스트_사고.pdf");
  });
});
