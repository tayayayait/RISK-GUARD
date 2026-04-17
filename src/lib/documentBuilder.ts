// Shared document building utilities

export const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    const tableIndex = (crc ^ bytes[index]) & 0xff;
    crc = (crc >>> 8) ^ CRC_TABLE[tableIndex];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipFileEntry = {
  name: string;
  content: string | Uint8Array;
};

export function buildZip(files: ZipFileEntry[], mimeType: string) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const fileName = encoder.encode(file.name);
    const fileContent = typeof file.content === "string"
      ? encoder.encode(file.content)
      : file.content;
    const fileCrc = crc32(fileContent);

    const localHeader = new Uint8Array(30 + fileName.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, fileCrc, true);
    localView.setUint32(18, fileContent.length, true);
    localView.setUint32(22, fileContent.length, true);
    localView.setUint16(26, fileName.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(fileName, 30);

    parts.push(localHeader, fileContent);

    const centralHeader = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, fileCrc, true);
    centralView.setUint32(20, fileContent.length, true);
    centralView.setUint32(24, fileContent.length, true);
    centralView.setUint16(28, fileName.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(fileName, 46);
    centralDirectory.push(centralHeader);

    offset += localHeader.length + fileContent.length;
  }

  let centralSize = 0;
  for (const entry of centralDirectory) {
    centralSize += entry.length;
    parts.push(entry);
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);
  parts.push(eocd);

  const blobParts = parts.map((part) => Uint8Array.from(part));
  return new Blob(blobParts, { type: mimeType });
}

export function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildDocxTable(headers: string[], rows: string[][]): string {
  const headerCells = headers.map(header => `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="0" w:type="auto"/>
        <w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>
        <w:vAlign w:val="center"/>
      </w:tcPr>
      <w:p>
        <w:pPr>
          <w:jc w:val="center"/>
        </w:pPr>
        <w:r>
          <w:rPr><w:b/></w:rPr>
          <w:t>${escapeXml(header)}</w:t>
        </w:r>
      </w:p>
    </w:tc>
  `).join('');

  const rowCells = rows.map(row => `
    <w:tr>
      ${row.map(cell => `
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="0" w:type="auto"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:jc w:val="center"/></w:pPr>
            ${(cell || '').split(/\r?\n/).map(line => `<w:r><w:t>${escapeXml(line)}</w:t></w:r>`).join('<w:br/>')}
          </w:p>
        </w:tc>
      `).join('')}
    </w:tr>
  `).join('');

  return `
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tr>${headerCells}</w:tr>
      ${rowCells}
    </w:tbl>
  `;
}

export interface RiskAssessmentDocxRow {
  workProcess: string;
  category: string;
  cause: string;
  hazardFactor: string;
  legalBasis: string;
  currentMeasure: string;
  frequency: string;
  severity: string;
  riskLevel: string;
  reductionMeasure: string;
  improvementDate: string;
  completionDate: string;
  responsiblePerson: string;
  note?: string;
}

export interface RiskAssessmentDocxMeta {
  processName?: string;
  evaluatedAt?: string;
  evaluator?: string;
}

type ParagraphAlignment = "left" | "center";
type VerticalCellAlign = "top" | "center";
type VerticalMerge = "restart" | "continue";

interface RiskTableCellSpec {
  start: number;
  span?: number;
  text?: string;
  align?: ParagraphAlignment;
  verticalAlign?: VerticalCellAlign;
  bold?: boolean;
  fill?: string;
  fontSize?: number;
  noWrap?: boolean;
  vMerge?: VerticalMerge;
}

interface RiskTableRowOptions {
  height: number;
  header?: boolean;
}

const RISK_TABLE_COLUMN_WIDTHS = [
  1051, 901, 1426, 1576, 1276, 1276, 563, 563, 675, 1351, 901, 901, 825, 673,
];

const RISK_TABLE_LABELS = {
  processName: "\uACF5\uC815\uBA85",
  evaluatedAt: "\uD3C9\uAC00\uC77C\uC2DC",
  title: "\uC704\uD5D8\uC131\uD3C9\uAC00",
  evaluator: "\uD3C9\uAC00\uC790\n(\uB9AC\uB354 \uBC0F \uD300\uC6D0)",
  workProcess: "\uC791\uC5C5\uB0B4\uC6A9",
  hazardGroup: "\uC720\uD574\uC704\uD5D8\uC694\uC778 \uD30C\uC545",
  relatedBasis: "\uAD00\uB828\uADFC\uAC70",
  currentStatusMeasure: "\uD604\uC7AC\uC0C1\uD0DC \uBC0F \uC870\uCE58",
  currentRisk: "\uD604\uC7AC\uC704\uD5D8\uC131",
  reductionMeasure: "\uAC10\uC18C\uB300\uCC45",
  improvementDate: "\uAC1C\uC120\uC77C",
  completionDate: "\uC644\uB8CC\uC77C",
  responsiblePerson: "\uB2F4\uB2F9\uC790",
  note: "\uBE44\uACE0",
  category: "\uBD84\uB958",
  cause: "\uC6D0\uC778",
  hazardFactor: "\uC720\uD574\uC704\uD5D8\uC694\uC778",
  legalStandard: "\uBC95\uC801\uAE30\uC900",
  frequency: "\uAC00\uB2A5\uC131(\uBE48\uB3C4)",
  severity: "\uC911\uB300\uC131(\uAC15\uB3C4)",
  riskLevel: "\uC704\uD5D8\uC131",
};

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const RISK_TABLE_TOTAL_WIDTH = RISK_TABLE_COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
const RISK_TABLE_HEADER_ROW_HEIGHTS = [540, 540, 620, 620] as const;
const RISK_TABLE_BODY_MIN_ROW_HEIGHT = 1920;
const RISK_TABLE_LINE_HEIGHT = 300;
const RISK_TABLE_CELL_HORIZONTAL_PADDING = 200;
const RISK_TABLE_CELL_VERTICAL_PADDING = 160;
const RISK_TABLE_CHARACTER_UNIT_TWIPS = 150;
const A4_LANDSCAPE_PAGE_WIDTH = 16838;
const A4_LANDSCAPE_PAGE_HEIGHT = 11906;
const RISK_TABLE_PAGE_TOP_MARGIN = 360;

const RISK_TABLE_BODY_FIELDS: Array<keyof RiskAssessmentDocxRow> = [
  "workProcess",
  "category",
  "cause",
  "hazardFactor",
  "legalBasis",
  "currentMeasure",
  "frequency",
  "severity",
  "riskLevel",
  "reductionMeasure",
  "improvementDate",
  "completionDate",
  "responsiblePerson",
  "note",
];

function sumRiskColumnWidths(start: number, span = 1) {
  let total = 0;
  for (let index = start; index < start + span; index += 1) {
    total += RISK_TABLE_COLUMN_WIDTHS[index];
  }
  return total;
}

function buildRunProperties(bold: boolean, fontSize: number) {
  return `
    <w:rPr>
      <w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:cs="Malgun Gothic" w:eastAsia="Malgun Gothic"/>
      ${bold ? "<w:b/><w:bCs/>" : ""}
      <w:sz w:val="${fontSize}"/>
      <w:szCs w:val="${fontSize}"/>
    </w:rPr>
  `;
}

function buildTextRuns(text: string, bold: boolean, fontSize: number) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines.map((line, index) => {
    const breakRun = index > 0 ? "<w:r><w:br/></w:r>" : "";
    const normalizedLine = line.length > 0 ? line : " ";
    return `${breakRun}<w:r>${buildRunProperties(bold, fontSize)}<w:t xml:space="preserve">${escapeXml(normalizedLine)}</w:t></w:r>`;
  }).join("");
}

function buildRiskTableCell({
  start,
  span = 1,
  text = "",
  align = "left",
  verticalAlign = "center",
  bold = false,
  fill,
  fontSize = 18,
  noWrap = false,
  vMerge,
}: RiskTableCellSpec) {
  const tcParts = [
    `<w:tcW w:w="${sumRiskColumnWidths(start, span)}" w:type="dxa"/>`,
    span > 1 ? `<w:gridSpan w:val="${span}"/>` : "",
    vMerge === "restart" ? `<w:vMerge w:val="restart"/>` : "",
    vMerge === "continue" ? "<w:vMerge/>" : "",
    fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : "",
    noWrap ? "<w:noWrap/>" : "",
    `<w:vAlign w:val="${verticalAlign}"/>`,
  ].filter(Boolean).join("");

  const paragraph = text.length > 0
    ? `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="0" w:line="300" w:lineRule="auto"/></w:pPr>${buildTextRuns(text, bold, fontSize)}</w:p>`
    : `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="0" w:after="0" w:line="300" w:lineRule="auto"/></w:pPr></w:p>`;

  return `<w:tc><w:tcPr>${tcParts}</w:tcPr>${paragraph}</w:tc>`;
}

function buildRiskTableRow(cells: RiskTableCellSpec[], { height, header = false }: RiskTableRowOptions) {
  const trPr = [
    `<w:trHeight w:val="${height}" w:hRule="atLeast"/>`,
    "<w:cantSplit/>",
    header ? "<w:tblHeader/>" : "",
  ].filter(Boolean).join("");

  return `<w:tr><w:trPr>${trPr}</w:trPr>${cells.map(buildRiskTableCell).join("")}</w:tr>`;
}

function estimateTextUnits(line: string) {
  let units = 0;
  for (const character of line) {
    if (character === " " || character === "\t") {
      units += 0.5;
      continue;
    }
    units += character.charCodeAt(0) <= 0x007f ? 1 : 1.8;
  }
  return units;
}

function estimateWrappedLineCount(text: string, columnWidth: number) {
  const normalizedText = text.trim().length > 0 ? text : " ";
  const usableWidth = Math.max(320, columnWidth - RISK_TABLE_CELL_HORIZONTAL_PADDING);
  const unitsPerLine = Math.max(1, usableWidth / RISK_TABLE_CHARACTER_UNIT_TWIPS);

  return normalizedText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .reduce((lineCount, line) => {
      const estimatedUnits = estimateTextUnits(line);
      return lineCount + Math.max(1, Math.ceil(estimatedUnits / unitsPerLine));
    }, 0);
}

function estimateRiskBodyRowHeight(row: RiskAssessmentDocxRow) {
  let maxLineCount = 1;

  RISK_TABLE_BODY_FIELDS.forEach((field, index) => {
    const rawValue = row[field];
    const value = typeof rawValue === "string" ? rawValue : "";
    const lineCount = estimateWrappedLineCount(value, RISK_TABLE_COLUMN_WIDTHS[index]);
    maxLineCount = Math.max(maxLineCount, lineCount);
  });

  const estimatedHeight = (maxLineCount * RISK_TABLE_LINE_HEIGHT) + RISK_TABLE_CELL_VERTICAL_PADDING;
  return Math.max(RISK_TABLE_BODY_MIN_ROW_HEIGHT, estimatedHeight);
}

function estimateRiskBodyRowHeights(rows: RiskAssessmentDocxRow[]) {
  return rows.map(estimateRiskBodyRowHeight);
}

function buildRiskAssessmentSectionProperties() {
  return `
    <w:sectPr>
      <w:pgSz w:w="${A4_LANDSCAPE_PAGE_WIDTH}" w:h="${A4_LANDSCAPE_PAGE_HEIGHT}" w:orient="landscape"/>
      <w:pgMar w:top="${RISK_TABLE_PAGE_TOP_MARGIN}" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  `;
}

export function buildRiskAssessmentDocxTable(
  rows: RiskAssessmentDocxRow[],
  meta: RiskAssessmentDocxMeta = {},
  bodyRowHeights = estimateRiskBodyRowHeights(rows),
): string {
  const headerRows = [
    buildRiskTableRow(
      [
        { start: 0, text: RISK_TABLE_LABELS.processName, align: "center", bold: true, fill: "F5F5F5" },
        { start: 1, span: 4, text: meta.processName ?? "", align: "left", verticalAlign: "top" },
        { start: 5, span: 4, text: RISK_TABLE_LABELS.title, align: "center", bold: true, fontSize: 38, vMerge: "restart" },
        { start: 9, span: 2, text: RISK_TABLE_LABELS.evaluator, align: "center", bold: true, vMerge: "restart", fill: "F5F5F5" },
        { start: 11, span: 3, text: meta.evaluator ?? "", align: "center", vMerge: "restart" },
      ],
      { height: RISK_TABLE_HEADER_ROW_HEIGHTS[0] },
    ),
    buildRiskTableRow(
      [
        { start: 0, text: RISK_TABLE_LABELS.evaluatedAt, align: "center", bold: true, fill: "F5F5F5" },
        { start: 1, span: 4, text: meta.evaluatedAt ?? "", align: "left", verticalAlign: "top", noWrap: true },
        { start: 5, span: 4, vMerge: "continue" },
        { start: 9, span: 2, vMerge: "continue" },
        { start: 11, span: 3, vMerge: "continue" },
      ],
      { height: RISK_TABLE_HEADER_ROW_HEIGHTS[1] },
    ),
    buildRiskTableRow(
      [
        { start: 0, text: RISK_TABLE_LABELS.workProcess, align: "center", bold: true, vMerge: "restart" },
        { start: 1, span: 3, text: RISK_TABLE_LABELS.hazardGroup, align: "center", bold: true },
        { start: 4, text: RISK_TABLE_LABELS.relatedBasis, align: "center", bold: true },
        { start: 5, text: RISK_TABLE_LABELS.currentStatusMeasure, align: "center", bold: true, vMerge: "restart" },
        { start: 6, span: 3, text: RISK_TABLE_LABELS.currentRisk, align: "center", bold: true },
        { start: 9, text: RISK_TABLE_LABELS.reductionMeasure, align: "center", bold: true, vMerge: "restart" },
        { start: 10, text: RISK_TABLE_LABELS.improvementDate, align: "center", bold: true, vMerge: "restart" },
        { start: 11, text: RISK_TABLE_LABELS.completionDate, align: "center", bold: true, vMerge: "restart" },
        { start: 12, text: RISK_TABLE_LABELS.responsiblePerson, align: "center", bold: true, vMerge: "restart" },
        { start: 13, text: RISK_TABLE_LABELS.note, align: "center", bold: true, vMerge: "restart" },
      ],
      { height: RISK_TABLE_HEADER_ROW_HEIGHTS[2] },
    ),
    buildRiskTableRow(
      [
        { start: 0, vMerge: "continue" },
        { start: 1, text: RISK_TABLE_LABELS.category, align: "center", bold: true },
        { start: 2, text: RISK_TABLE_LABELS.cause, align: "center", bold: true },
        { start: 3, text: RISK_TABLE_LABELS.hazardFactor, align: "center", bold: true },
        { start: 4, text: RISK_TABLE_LABELS.legalStandard, align: "center", bold: true },
        { start: 5, vMerge: "continue" },
        { start: 6, text: RISK_TABLE_LABELS.frequency, align: "center", bold: true },
        { start: 7, text: RISK_TABLE_LABELS.severity, align: "center", bold: true },
        { start: 8, text: RISK_TABLE_LABELS.riskLevel, align: "center", bold: true },
        { start: 9, vMerge: "continue" },
        { start: 10, vMerge: "continue" },
        { start: 11, vMerge: "continue" },
        { start: 12, vMerge: "continue" },
        { start: 13, vMerge: "continue" },
      ],
      { height: RISK_TABLE_HEADER_ROW_HEIGHTS[3] },
    ),
  ];

  const bodyRows = rows.map((row, index) => buildRiskTableRow(
    [
      { start: 0, text: row.workProcess, verticalAlign: "top" },
      { start: 1, text: row.category, align: "center", verticalAlign: "top" },
      { start: 2, text: row.cause, verticalAlign: "top" },
      { start: 3, text: row.hazardFactor, verticalAlign: "top" },
      { start: 4, text: row.legalBasis, verticalAlign: "top" },
      { start: 5, text: row.currentMeasure, verticalAlign: "top" },
      { start: 6, text: row.frequency, align: "center", noWrap: true },
      { start: 7, text: row.severity, align: "center", noWrap: true },
      { start: 8, text: row.riskLevel, align: "center", bold: true, noWrap: true },
      { start: 9, text: row.reductionMeasure, verticalAlign: "top" },
      { start: 10, text: row.improvementDate, align: "center", noWrap: true },
      { start: 11, text: row.completionDate, align: "center", noWrap: true },
      { start: 12, text: row.responsiblePerson, align: "center", noWrap: true },
      { start: 13, text: row.note ?? "", align: "center" },
    ],
    { height: bodyRowHeights[index] ?? RISK_TABLE_BODY_MIN_ROW_HEIGHT },
  ));

  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${RISK_TABLE_TOTAL_WIDTH}" w:type="dxa"/>
        <w:jc w:val="center"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblCellMar>
          <w:top w:w="80" w:type="dxa"/>
          <w:left w:w="100" w:type="dxa"/>
          <w:bottom w:w="80" w:type="dxa"/>
          <w:right w:w="100" w:type="dxa"/>
        </w:tblCellMar>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="6" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="6" w:space="0" w:color="000000"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>
        ${RISK_TABLE_COLUMN_WIDTHS.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}
      </w:tblGrid>
      ${headerRows.join("")}
      ${bodyRows.join("")}
    </w:tbl>
  `;
}

export function buildRiskAssessmentDocumentXml(rows: RiskAssessmentDocxRow[], meta: RiskAssessmentDocxMeta = {}) {
  const bodyRowHeights = estimateRiskBodyRowHeights(rows);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${buildRiskAssessmentDocxTable(rows, meta, bodyRowHeights)}
    ${buildRiskAssessmentSectionProperties()}
  </w:body>
</w:document>`;
}

export function buildRiskAssessmentDocxBlob(rows: RiskAssessmentDocxRow[], meta: RiskAssessmentDocxMeta = {}) {
  const documentXml = buildRiskAssessmentDocumentXml(rows, meta);

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
