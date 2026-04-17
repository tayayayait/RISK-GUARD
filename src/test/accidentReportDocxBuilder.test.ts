import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildAccidentReportDocxBlob } from "@/lib/accidentReportDocxBuilder";
import type { AccidentReportData } from "@/types/formTemplate";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const sampleData: AccidentReportData = {
  administrativeInfo: {
    receiptNumber: "RCP-001",
    receiptDate: "2026-04-14",
    processingDate: "2026-04-15",
    processingPeriodDays: "14",
    writerName: "writer-01",
    writerPhone: "010-1111-2222",
    writtenYear: "2026",
    writtenMonth: "04",
    writtenDay: "14",
    employerName: "employer-01",
    workerRepresentativeName: "worker-rep-01",
    laborOfficeName: "gulabor",
  },
  businessInfo: {
    businessName: "main-business-01",
    businessNumber: "123-45-67890",
    managementNumber: "MGMT-001",
    workersCount: "12",
    industry: "construction",
    address: "main-address",
    subcontractorInfo: {
      businessName: "subcontract-business-01",
      managementNumber: "SUB-001",
    },
    dispatchedInfo: {
      businessName: "dispatch-business-77",
      managementNumber: "DSP-7788",
    },
    constructionInfo: {
      orderer: "national",
      principalBusinessName: "principal-business-01",
      principalManagementNumber: "PRN-101",
      constructionSiteName: "site-01",
      constructionType: "outer-wall",
      progressRate: "65",
      constructionAmount: "900",
    },
  },
  victimInfo: {
    name: "victim-01",
    residentNumber: "9506291",
    address: "victim-address",
    phone: "010-3333-4444",
    nationality: "VN",
    nationalityType: "foreign",
    visaType: "E-9",
    jobTitle: "worker",
    hireDate: "2022-02-02",
    experienceYears: "1",
    experienceMonths: "2",
    employmentType: "regular",
    workType: "shift_2",
    injuryType: "fracture",
    injuryPart: "arm",
    expectedRestDays: "30",
    isDead: false,
  },
  accidentDetails: {
    occurredDate: {
      year: "2026",
      month: "04",
      day: "14",
      dayOfWeek: "화",
      hour: "17",
      minute: "38",
    },
    location: "accident-location",
    workType: "scaffold-work",
    workTiming: "during_work",
    situation: "worker fell from scaffold",
    cause: ["cause-1", "cause-2"],
  },
  preventionPlan: {
    plan: "plan-line-1\nplan-line-2",
    requestTechnicalSupport: true,
    consentPersonalData: true,
  },
  legalViolations: [],
};

function loadTemplateArrayBuffer() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDirPath = path.dirname(currentFilePath);
  const templatePath = path.resolve(currentDirPath, "../../public/forms/산업재해조사표양식.docx");
  const templateBuffer = readFileSync(templatePath);

  return templateBuffer.buffer.slice(
    templateBuffer.byteOffset,
    templateBuffer.byteOffset + templateBuffer.byteLength,
  );
}

function directChildrenByTag(parent: Element | null | undefined, localName: string) {
  return Array.from(parent?.children ?? []).filter(
    (child) => child.namespaceURI === WORD_NS && child.localName === localName,
  );
}

function cellText(cell: Element | undefined) {
  if (!cell) {
    return "";
  }
  return Array.from(cell.getElementsByTagNameNS(WORD_NS, "t"))
    .map((node) => node.textContent ?? "")
    .join("");
}

function paragraphTexts(cell: Element | undefined) {
  if (!cell) {
    return [];
  }
  return directChildrenByTag(cell, "p")
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "t"))
        .map((node) => node.textContent ?? "")
        .join("")
        .trim()
    )
    .filter(Boolean);
}

describe("accident report docx builder", () => {
  it("keeps template package and fills mapped fields without image snapshot", async () => {
    const templateArrayBuffer = loadTemplateArrayBuffer();
    const blob = await buildAccidentReportDocxBlob(sampleData, { templateArrayBuffer });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")?.async("text");

    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(blob.size).toBeGreaterThan(0);
    expect(documentXml).toBeTruthy();
    expect(zip.file("word/media/image1.png")).toBeNull();

    const parser = new DOMParser();
    const document = parser.parseFromString(documentXml as string, "application/xml");
    const mainTable = document.getElementsByTagNameNS(WORD_NS, "tbl").item(0);
    const rows = directChildrenByTag(mainTable, "tr");

    // Business info mappings.
    expect(cellText(directChildrenByTag(rows[7], "tc")[4])).toContain("dispatch-business-77");
    expect(cellText(directChildrenByTag(rows[8], "tc")[4])).toContain("DSP-7788");
    expect(cellText(directChildrenByTag(rows[10], "tc")[3])).toContain("principal-business-01");
    expect(cellText(directChildrenByTag(rows[11], "tc")[3])).toContain("PRN-101");
    expect(cellText(directChildrenByTag(rows[10], "tc")[5])).toContain("site-01");

    // Body mappings.
    expect(cellText(directChildrenByTag(rows[20], "tc")[6])).toContain("30");
    const occurredCellText = cellText(directChildrenByTag(rows[22], "tc")[3]);
    expect(occurredCellText).toContain("2026");
    expect(occurredCellText).toContain("04");
    expect(occurredCellText).toContain("14");
    expect(occurredCellText).toContain("화");
    expect(occurredCellText).toContain("17");
    expect(occurredCellText).toContain("38");
    const causeCell = directChildrenByTag(rows[26], "tc")[2];
    const causeParagraphs = paragraphTexts(causeCell);
    expect(causeParagraphs).toContain("cause-1");
    expect(causeParagraphs).toContain("cause-2");
    expect(causeParagraphs.length).toBeGreaterThanOrEqual(2);

    const preventionCell = directChildrenByTag(rows[27], "tc")[1];
    const preventionParagraphs = paragraphTexts(preventionCell);
    expect(preventionParagraphs).toContain("plan-line-1");
    expect(preventionParagraphs).toContain("plan-line-2");
    expect(preventionParagraphs.length).toBeGreaterThanOrEqual(2);
    expect(cellText(directChildrenByTag(rows[28], "tc")[1])).toContain("✓");
    expect(cellText(directChildrenByTag(rows[29], "tc")[1])).toContain("✓");

    // Resident-number nested table is preserved and mapped to slots.
    const residentCell = directChildrenByTag(rows[14], "tc")[4];
    const nestedTable = directChildrenByTag(residentCell, "tbl")[0];
    expect(nestedTable).toBeTruthy();
    const nestedRow = directChildrenByTag(nestedTable, "tr")[0];
    const nestedCells = directChildrenByTag(nestedRow, "tc");
    expect(cellText(nestedCells[0])).toBe("9");
    expect(cellText(nestedCells[1])).toBe("5");
    expect(cellText(nestedCells[2])).toBe("0");
    expect(cellText(nestedCells[3])).toBe("6");
    expect(cellText(nestedCells[4])).toBe("2");
    expect(cellText(nestedCells[5])).toBe("9");
    expect(cellText(nestedCells[7])).toBe("1");
  }, 20000);
});
