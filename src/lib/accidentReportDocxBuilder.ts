import JSZip from "jszip";
import type { AccidentReportData } from "@/types/formTemplate";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const DEFAULT_TEMPLATE_URL = "/forms/산업재해조사표양식.docx";

type SingleChoiceOption = {
  value: string;
  label: string;
};

type BuildAccidentReportDocxOptions = {
  templateArrayBuffer?: ArrayBuffer | Uint8Array;
  templateUrl?: string;
};

const ORDERER_OPTIONS: SingleChoiceOption[] = [
  { value: "private", label: "민간" },
  { value: "national", label: "국가·지방자치단체" },
  { value: "public_institution", label: "공공기관" },
];

const EMPLOYMENT_TYPE_OPTIONS: SingleChoiceOption[] = [
  { value: "regular", label: "상용" },
  { value: "temporary", label: "임시" },
  { value: "daily", label: "일용" },
  { value: "unpaid_family", label: "무급가족종사자" },
  { value: "self_employed", label: "자영업자" },
  { value: "other", label: "그 밖의 사항" },
];

const WORK_TYPE_OPTIONS: SingleChoiceOption[] = [
  { value: "regular", label: "정상" },
  { value: "shift_2", label: "2교대" },
  { value: "shift_3", label: "3교대" },
  { value: "shift_4", label: "4교대" },
  { value: "part_time", label: "시간제" },
  { value: "other", label: "그 밖의 사항" },
];

function toDisplayText(value: string | undefined | null) {
  return (value ?? "").trim();
}

function formatWrittenDateLine(adminInfo: AccidentReportData["administrativeInfo"]) {
  return [
    toDisplayText(adminInfo.writtenYear) ? `${toDisplayText(adminInfo.writtenYear)}년` : "",
    toDisplayText(adminInfo.writtenMonth) ? `${toDisplayText(adminInfo.writtenMonth)}월` : "",
    toDisplayText(adminInfo.writtenDay) ? `${toDisplayText(adminInfo.writtenDay)}일` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function formatExperienceLine(victimInfo: AccidentReportData["victimInfo"]) {
  return [
    toDisplayText(victimInfo.experienceYears) ? `${toDisplayText(victimInfo.experienceYears)}년` : "",
    toDisplayText(victimInfo.experienceMonths) ? `${toDisplayText(victimInfo.experienceMonths)}개월` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function formatLineBreakText(value: string[]) {
  return value.map((entry) => toDisplayText(entry)).filter(Boolean).join("\n");
}

function markCheckboxSlots(baseText: string, checkedIndexes: number[]) {
  const checkedSet = new Set(checkedIndexes);
  let slotIndex = 0;
  return baseText.replace(/\[\s*[^\]\s]?\s*\]/g, () => `[${checkedSet.has(slotIndex++) ? "✓" : " "}]`);
}

function fillSlotPlaceholders(baseText: string, values: Array<string | undefined | null>) {
  let slotIndex = 0;
  return baseText.replace(/\[\s*[^\]\s]?\s*\]/g, () => {
    const value = toDisplayText(values[slotIndex]);
    slotIndex += 1;
    return value || " ";
  });
}

function formatNationalityTemplateText(baseText: string, victimInfo: AccidentReportData["victimInfo"]) {
  const checkedPart = markCheckboxSlots(baseText, [
    ...(victimInfo.nationalityType === "domestic" ? [0] : []),
    ...(victimInfo.nationalityType === "foreign" ? [1] : []),
  ]);
  const nationality = toDisplayText(victimInfo.nationality);
  const visa = toDisplayText(victimInfo.visaType);
  return checkedPart.replace(/\[국적:[^\]]*\]/, `[국적: ${nationality} ⑩체류자격: ${visa}]`);
}

function createWordElement(document: Document, tagName: string) {
  return document.createElementNS(WORD_NS, `w:${tagName}`);
}

function ensureWordChild(parent: Element, localName: string) {
  const existing = getDirectWordChildren(parent, localName)[0];
  if (existing) {
    return existing;
  }

  const created = createWordElement(parent.ownerDocument, localName);
  parent.appendChild(created);
  return created;
}

function ensureUniformTableBorders(table: Element) {
  const document = table.ownerDocument;
  const tablePr = ensureWordChild(table, "tblPr");
  const tableBorders = ensureWordChild(tablePr, "tblBorders");

  const ensureBorder = (name: string) => {
    const existing = getDirectWordChildren(tableBorders, name)[0];
    const border = existing ?? createWordElement(document, name);
    border.setAttributeNS(WORD_NS, "w:val", "single");
    border.setAttributeNS(WORD_NS, "w:sz", "4");
    border.setAttributeNS(WORD_NS, "w:space", "0");
    border.setAttributeNS(WORD_NS, "w:color", "000000");
    if (!existing) {
      tableBorders.appendChild(border);
    }
  };

  ensureBorder("top");
  ensureBorder("left");
  ensureBorder("bottom");
  ensureBorder("right");
  ensureBorder("insideH");
  ensureBorder("insideV");
}

function getDirectWordChildren(parent: Element, localName: string) {
  return Array.from(parent.children).filter(
    (child) => child.namespaceURI === WORD_NS && child.localName === localName,
  );
}

function getMainTableRows(document: Document) {
  const tables = document.getElementsByTagNameNS(WORD_NS, "tbl");
  const mainTable = tables.item(0);
  if (!mainTable) {
    throw new Error("DOCX 템플릿의 본문 표를 찾지 못했습니다.");
  }

  return getDirectWordChildren(mainTable, "tr");
}

function getCell(rows: Element[], rowIndex: number, cellIndex: number) {
  const row = rows[rowIndex];
  if (!row) {
    throw new Error(`DOCX 템플릿의 행 인덱스가 유효하지 않습니다. row=${rowIndex}`);
  }

  const cells = getDirectWordChildren(row, "tc");
  const cell = cells[cellIndex];
  if (!cell) {
    throw new Error(`DOCX 템플릿의 셀 인덱스가 유효하지 않습니다. row=${rowIndex}, cell=${cellIndex}`);
  }

  return cell;
}

function getRunTextNodesFromParagraph(paragraph: Element) {
  const runs = getDirectWordChildren(paragraph, "r");
  return runs.flatMap((run) => Array.from(run.getElementsByTagNameNS(WORD_NS, "t")));
}

function ensureCellHasWritableTextNode(cell: Element) {
  const directParagraphs = getDirectWordChildren(cell, "p");
  const paragraph = directParagraphs[0] ?? (() => {
    const createdParagraph = createWordElement(cell.ownerDocument, "p");
    cell.appendChild(createdParagraph);
    return createdParagraph;
  })();

  const existingTextNodes = getRunTextNodesFromParagraph(paragraph);
  if (existingTextNodes.length > 0) {
    return existingTextNodes;
  }

  const run = createWordElement(cell.ownerDocument, "r");
  const text = createWordElement(cell.ownerDocument, "t");
  text.setAttributeNS(XML_NS, "xml:space", "preserve");
  text.textContent = " ";
  run.appendChild(text);
  paragraph.appendChild(run);
  return [text];
}

function setCellText(cell: Element, value: string) {
  const normalized = value.replace(/\r\n?/g, " ");
  const directParagraphs = getDirectWordChildren(cell, "p");
  const textNodes = directParagraphs.flatMap(getRunTextNodesFromParagraph);
  const writableTextNodes = textNodes.length > 0 ? textNodes : ensureCellHasWritableTextNode(cell);

  writableTextNodes[0].setAttributeNS(XML_NS, "xml:space", "preserve");
  writableTextNodes[0].textContent = normalized.length > 0 ? normalized : " ";
  for (let index = 1; index < writableTextNodes.length; index += 1) {
    writableTextNodes[index].textContent = "";
  }
}

function normalizeParagraphLine(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/\s+/g, " ").trim();
}

function splitParagraphLines(text: string, autoSentenceBreak = false) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const rawLines = normalized
    .split("\n")
    .map((line) => normalizeParagraphLine(line))
    .filter(Boolean);

  if (!autoSentenceBreak || rawLines.length !== 1) {
    return rawLines;
  }

  const sentenceLines = rawLines[0]
    .split(/(?<=[.!?])\s+/)
    .map((line) => normalizeParagraphLine(line))
    .filter(Boolean);
  return sentenceLines.length > 1 ? sentenceLines : rawLines;
}

function setParagraphText(paragraph: Element, value: string) {
  const textNodes = getRunTextNodesFromParagraph(paragraph);
  const writableTextNodes = textNodes.length > 0 ? textNodes : (() => {
    const run = createWordElement(paragraph.ownerDocument, "r");
    const text = createWordElement(paragraph.ownerDocument, "t");
    text.setAttributeNS(XML_NS, "xml:space", "preserve");
    text.textContent = " ";
    run.appendChild(text);
    paragraph.appendChild(run);
    return [text];
  })();

  writableTextNodes[0].setAttributeNS(XML_NS, "xml:space", "preserve");
  writableTextNodes[0].textContent = value || " ";
  for (let index = 1; index < writableTextNodes.length; index += 1) {
    writableTextNodes[index].textContent = "";
  }
}

function setCellParagraphText(cell: Element, value: string, autoSentenceBreak = false) {
  const lines = splitParagraphLines(value, autoSentenceBreak);
  const finalLines = lines.length > 0 ? lines : [" "];

  let paragraphs = getDirectWordChildren(cell, "p");
  if (paragraphs.length === 0) {
    const paragraph = createWordElement(cell.ownerDocument, "p");
    cell.appendChild(paragraph);
    paragraphs = [paragraph];
  }

  const paragraphTemplate = paragraphs[0].cloneNode(true) as Element;

  while (paragraphs.length < finalLines.length) {
    cell.appendChild(paragraphTemplate.cloneNode(true));
    paragraphs = getDirectWordChildren(cell, "p");
  }

  while (paragraphs.length > finalLines.length) {
    paragraphs[paragraphs.length - 1].remove();
    paragraphs = getDirectWordChildren(cell, "p");
  }

  paragraphs.forEach((paragraph, index) => {
    setParagraphText(paragraph, finalLines[index] ?? " ");
  });
}

function getCellText(cell: Element) {
  const texts = cell.getElementsByTagNameNS(WORD_NS, "t");
  return Array.from(texts)
    .map((textNode) => textNode.textContent ?? "")
    .join("");
}

function setDirectCellRunText(cell: Element, value: string) {
  const texts = Array.from(cell.getElementsByTagNameNS(WORD_NS, "t"));
  const firstText = texts[0];
  if (!firstText) {
    setCellText(cell, value);
    return;
  }

  firstText.textContent = value || " ";
  for (let index = 1; index < texts.length; index += 1) {
    texts[index].textContent = "";
  }
}

function setResidentNumberCell(cell: Element, residentNumber: string) {
  const digits = residentNumber.replace(/\D/g, "").slice(0, 7).split("");
  const nestedTable = getDirectWordChildren(cell, "tbl")[0];
  if (!nestedTable) {
    setCellText(cell, residentNumber ? `${residentNumber}-*******` : "");
    return;
  }

  const innerRows = getDirectWordChildren(nestedTable, "tr");
  const innerRow = innerRows[0];
  if (!innerRow) {
    setCellText(cell, residentNumber ? `${residentNumber}-*******` : "");
    return;
  }

  const innerCells = getDirectWordChildren(innerRow, "tc");
  // 주민등록번호 앞 7자리를 템플릿의 중첩표 칸(0~5, 7번)에 채운다.
  const targetCellIndexes = [0, 1, 2, 3, 4, 5, 7];
  targetCellIndexes.forEach((cellIndex, digitIndex) => {
    const targetCell = innerCells[cellIndex];
    if (!targetCell) {
      return;
    }
    setDirectCellRunText(targetCell, digits[digitIndex] ?? "");
  });
}

function mapAccidentDataToTemplateDocumentXml(documentXml: string, data: AccidentReportData) {
  const parser = new DOMParser();
  const document = parser.parseFromString(documentXml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("DOCX 템플릿 XML 파싱에 실패했습니다.");
  }

  const tables = Array.from(document.getElementsByTagNameNS(WORD_NS, "tbl"));
  tables.forEach((table) => ensureUniformTableBorders(table));

  const rows = getMainTableRows(document);
  const setValue = (row: number, cell: number, value: string) => {
    setCellText(getCell(rows, row, cell), value);
  };
  const setParagraphValue = (row: number, cell: number, value: string, autoSentenceBreak = false) => {
    setCellParagraphText(getCell(rows, row, cell), value, autoSentenceBreak);
  };
  const setFromTemplate = (
    row: number,
    cell: number,
    mapFn: (baseText: string) => string,
  ) => {
    const targetCell = getCell(rows, row, cell);
    const nextText = mapFn(getCellText(targetCell));
    setCellText(targetCell, nextText);
  };

  const admin = data.administrativeInfo;
  const business = data.businessInfo;
  const victim = data.victimInfo;
  const accident = data.accidentDetails;
  const prevention = data.preventionPlan;

  setValue(2, 1, toDisplayText(admin.receiptNumber));
  setValue(2, 3, toDisplayText(admin.receiptDate));
  setValue(2, 5, toDisplayText(admin.processingDate));
  setValue(2, 7, toDisplayText(admin.processingPeriodDays) ? `${toDisplayText(admin.processingPeriodDays)}일` : "");

  setValue(4, 2, toDisplayText(business.managementNumber));
  setValue(4, 4, toDisplayText(business.businessNumber));
  setValue(5, 2, toDisplayText(business.businessName));
  setValue(5, 4, toDisplayText(business.workersCount) ? `${toDisplayText(business.workersCount)}명` : "");
  setValue(6, 2, toDisplayText(business.industry));
  setValue(6, 4, toDisplayText(business.address));
  setValue(7, 2, toDisplayText(business.subcontractorInfo.businessName));
  setValue(8, 2, toDisplayText(business.subcontractorInfo.managementNumber));
  setValue(7, 4, toDisplayText(business.dispatchedInfo.businessName));
  setValue(8, 4, toDisplayText(business.dispatchedInfo.managementNumber));
  setFromTemplate(9, 4, (baseText) => {
    const selectedIndex = ORDERER_OPTIONS.findIndex((option) => option.value === business.constructionInfo.orderer);
    return markCheckboxSlots(baseText, selectedIndex >= 0 ? [selectedIndex] : []);
  });
  setValue(10, 3, toDisplayText(business.constructionInfo.principalBusinessName));
  setValue(10, 5, toDisplayText(business.constructionInfo.constructionSiteName));
  setValue(11, 3, toDisplayText(business.constructionInfo.principalManagementNumber));
  setValue(12, 3, toDisplayText(business.constructionInfo.constructionType));
  setValue(12, 5, toDisplayText(business.constructionInfo.progressRate));
  setFromTemplate(12, 6, (baseText) => {
    const amount = toDisplayText(business.constructionInfo.constructionAmount);
    if (!amount) {
      return baseText;
    }
    return baseText.includes("백만원")
      ? baseText.replace("백만원", `${amount} 백만원`)
      : `${baseText} ${amount}`.trim();
  });

  setValue(14, 2, toDisplayText(victim.name));
  setResidentNumberCell(getCell(rows, 14, 4), toDisplayText(victim.residentNumber));
  setValue(15, 2, toDisplayText(victim.address));
  setValue(15, 4, toDisplayText(victim.phone));
  setFromTemplate(16, 2, (baseText) => formatNationalityTemplateText(baseText, victim));
  setValue(16, 4, toDisplayText(victim.jobTitle));
  setValue(17, 2, toDisplayText(victim.hireDate));
  setValue(17, 4, formatExperienceLine(victim));
  setFromTemplate(18, 2, (baseText) => {
    const selectedIndex = EMPLOYMENT_TYPE_OPTIONS.findIndex((option) => option.value === victim.employmentType);
    return markCheckboxSlots(baseText, selectedIndex >= 0 ? [selectedIndex] : []);
  });
  setFromTemplate(19, 2, (baseText) => {
    const selectedIndex = WORK_TYPE_OPTIONS.findIndex((option) => option.value === victim.workType);
    return markCheckboxSlots(baseText, selectedIndex >= 0 ? [selectedIndex] : []);
  });
  setValue(20, 2, toDisplayText(victim.injuryType));
  setValue(20, 4, toDisplayText(victim.injuryPart));
  setFromTemplate(20, 6, (baseText) => fillSlotPlaceholders(baseText, [toDisplayText(victim.expectedRestDays)]));
  setFromTemplate(21, 6, (baseText) => markCheckboxSlots(baseText, victim.isDead ? [0] : []));

  setFromTemplate(22, 3, (baseText) =>
    fillSlotPlaceholders(baseText, [
      toDisplayText(accident.occurredDate.year),
      toDisplayText(accident.occurredDate.month),
      toDisplayText(accident.occurredDate.day),
      toDisplayText(accident.occurredDate.dayOfWeek),
      toDisplayText(accident.occurredDate.hour),
      toDisplayText(accident.occurredDate.minute),
    ]));
  setValue(23, 3, toDisplayText(accident.location));
  setValue(24, 3, toDisplayText(accident.workType));
  setParagraphValue(25, 3, toDisplayText(accident.situation), true);
  setParagraphValue(26, 2, formatLineBreakText(accident.cause));

  setParagraphValue(27, 1, toDisplayText(prevention.plan));
  setFromTemplate(28, 1, (baseText) => markCheckboxSlots(baseText, prevention.requestTechnicalSupport ? [0] : []));
  setFromTemplate(29, 1, (baseText) => markCheckboxSlots(baseText, prevention.consentPersonalData ? [0] : []));

  setValue(30, 1, toDisplayText(admin.writerName));
  setValue(31, 1, toDisplayText(admin.writerPhone));
  setFromTemplate(31, 2, (baseText) => {
    const writtenDate = formatWrittenDateLine(admin);
    if (!writtenDate) {
      return baseText;
    }
    const replaced = baseText.replace(/작성일자\s*년\s*월\s*일/, `작성일자 ${writtenDate}`);
    if (replaced !== baseText) {
      return replaced;
    }
    if (baseText.includes("작성일자")) {
      return baseText.replace("작성일자", `작성일자 ${writtenDate} `);
    }
    return `작성일자 ${writtenDate}`;
  });
  setValue(32, 0, `사업장 대표: ${toDisplayText(admin.employerName)}`);
  setValue(33, 0, `근로자 대표: ${toDisplayText(admin.workerRepresentativeName)}`);
  setValue(34, 0, toDisplayText(admin.laborOfficeName) ? `${toDisplayText(admin.laborOfficeName)} 귀하` : "귀하");

  const serialized = new XMLSerializer().serializeToString(document);
  return serialized.startsWith("<?xml")
    ? serialized
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${serialized}`;
}

async function loadTemplateArrayBuffer(options: BuildAccidentReportDocxOptions) {
  if (options.templateArrayBuffer) {
    return options.templateArrayBuffer instanceof Uint8Array
      ? options.templateArrayBuffer
      : new Uint8Array(options.templateArrayBuffer);
  }

  if (typeof fetch !== "function") {
    throw new Error("DOCX 템플릿을 불러올 fetch API를 사용할 수 없습니다.");
  }

  const templateUrl = options.templateUrl ?? DEFAULT_TEMPLATE_URL;
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`DOCX 템플릿을 불러오지 못했습니다. status=${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function buildAccidentReportDocxBlob(
  data: AccidentReportData,
  options: BuildAccidentReportDocxOptions = {},
) {
  const templateArrayBuffer = await loadTemplateArrayBuffer(options);
  const zip = await JSZip.loadAsync(templateArrayBuffer);
  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error("DOCX 템플릿에 word/document.xml이 없습니다.");
  }

  const templateDocumentXml = await documentFile.async("text");
  const mappedDocumentXml = mapAccidentDataToTemplateDocumentXml(templateDocumentXml, data);

  zip.file("word/document.xml", mappedDocumentXml);
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: DOCX_MIME_TYPE,
  });
}
