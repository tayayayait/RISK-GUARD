function sanitizeFileName(rawTaskName?: string) {
  const normalized = (rawTaskName ?? "draft").trim() || "draft";
  const cleaned = normalized.replace(/[\\/:*?"<>|]/g, "_").slice(0, 48);
  return `산업재해조사표-${cleaned}.pdf`;
}

export async function downloadAccidentReportPdfFromElement(
  element: HTMLElement,
  taskName?: string,
) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(element, {
    backgroundColor: "#ffffff",
    scale: 2,
    useCORS: true,
    logging: false,
    width: element.scrollWidth,
    height: element.scrollHeight,
    scrollX: 0,
    scrollY: -window.scrollY,
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

  pdf.addImage(canvas, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
  pdf.save(sanitizeFileName(taskName));
}
