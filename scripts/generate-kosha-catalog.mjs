import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const CONSTRUCTION_CSV = path.join(
  projectRoot,
  "공공데이터포털 api",
  "한국산업안전보건공단_건설업 공종별 세부공정 목록_20210910.csv",
);
const EQUIPMENT_CSV = path.join(
  projectRoot,
  "공공데이터포털 api",
  "한국산업안전보건공단_업종별 기계설비 목록_20210909.csv",
);
const OUTPUT_DIR = path.join(projectRoot, "supabase", "functions", "_shared", "generated");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "kosha-catalog.ts");

function decodeCsvBuffer(buffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\uFFFD")) {
    return utf8;
  }

  return new TextDecoder("euc-kr").decode(buffer);
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const nextChar = raw[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map((column) => column.trim());
  return rows.slice(1).map((values) => {
    const record = {};
    for (let i = 0; i < header.length; i += 1) {
      const key = header[i];
      record[key] = (values[i] ?? "").trim();
    }
    return record;
  });
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(text) {
  return normalizeText(text).replace(/\s+/g, "");
}

function unique(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const value = item.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function tokenize(text) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function buildTokens(parts) {
  const source = parts.filter(Boolean).join(" ");
  const tokens = tokenize(source);
  const compactTokens = parts
    .map((part) => compact(part ?? ""))
    .filter((token) => token.length >= 2);

  return unique([...tokens, ...compactTokens]).slice(0, 16);
}

function mapConstructionCatalog(rows) {
  return rows
    .map((row) => {
      const projectType = row["공사종류"] ?? "";
      const tradeName = row["공종명"] ?? "";
      const detailProcess = row["세부공정명"] ?? "";
      if (!projectType && !tradeName && !detailProcess) {
        return null;
      }

      return {
        projectType,
        tradeName,
        detailProcess,
        tokens: buildTokens([projectType, tradeName, detailProcess]),
      };
    })
    .filter(Boolean);
}

function mapEquipmentCatalog(rows) {
  return rows
    .map((row) => {
      const majorIndustry = row["업종대분류"] ?? "";
      const middleIndustry = row["업종중분류"] ?? "";
      const subIndustry = row["업종소분류"] ?? "";
      const equipmentName = row["기계설비명"] ?? "";
      const equipmentNameEn = row["기계설비영문명"] ?? "";
      if (!equipmentName) {
        return null;
      }

      return {
        majorIndustry,
        middleIndustry,
        subIndustry,
        equipmentName,
        equipmentNameEn,
        tokens: buildTokens([
          majorIndustry,
          middleIndustry,
          subIndustry,
          equipmentName,
          equipmentNameEn,
        ]),
      };
    })
    .filter(Boolean);
}

async function loadCsv(filePath) {
  const rawBuffer = await readFile(filePath);
  const rawText = decodeCsvBuffer(rawBuffer);
  return parseCsv(rawText);
}

function renderModule(constructionCatalog, equipmentCatalog) {
  const generatedAt = new Date().toISOString();
  return `/**
 * AUTO-GENERATED FILE.
 * Source of truth:
 * - 공공데이터포털 api/한국산업안전보건공단_건설업 공종별 세부공정 목록_20210910.csv
 * - 공공데이터포털 api/한국산업안전보건공단_업종별 기계설비 목록_20210909.csv
 * Generated at: ${generatedAt}
 */

export interface ConstructionProcessCatalogItem {
  projectType: string;
  tradeName: string;
  detailProcess: string;
  tokens: string[];
}

export interface MachineEquipmentCatalogItem {
  majorIndustry: string;
  middleIndustry: string;
  subIndustry: string;
  equipmentName: string;
  equipmentNameEn: string;
  tokens: string[];
}

export const KOSHA_CATALOG_GENERATED_AT = ${JSON.stringify(generatedAt)};

export const CONSTRUCTION_PROCESS_CATALOG: ConstructionProcessCatalogItem[] = ${JSON.stringify(constructionCatalog, null, 2)};

export const MACHINE_EQUIPMENT_CATALOG: MachineEquipmentCatalogItem[] = ${JSON.stringify(equipmentCatalog, null, 2)};
`;
}

async function main() {
  const [constructionRows, equipmentRows] = await Promise.all([
    loadCsv(CONSTRUCTION_CSV),
    loadCsv(EQUIPMENT_CSV),
  ]);

  const constructionCatalog = mapConstructionCatalog(constructionRows);
  const equipmentCatalog = mapEquipmentCatalog(equipmentRows);
  const moduleText = renderModule(constructionCatalog, equipmentCatalog);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, moduleText, "utf8");

  console.log(
    [
      `generated: ${path.relative(projectRoot, OUTPUT_FILE)}`,
      `construction rows: ${constructionCatalog.length}`,
      `equipment rows: ${equipmentCatalog.length}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
