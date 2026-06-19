import {
  CONSTRUCTION_PROCESS_CATALOG,
  MACHINE_EQUIPMENT_CATALOG,
  type ConstructionProcessCatalogItem,
  type MachineEquipmentCatalogItem,
} from "./generated/kosha-catalog.ts";

export interface CsvEnhancementHazard {
  name: string;
  weight?: number;
}

export interface CsvEnhancementProfile {
  industry: string;
  workLocation: string;
  equipment: string[];
  hazards: CsvEnhancementHazard[];
}

export interface CsvEnhancementContext {
  taskName: string;
  profile: CsvEnhancementProfile;
}

export interface CsvCatalogLoader {
  constructionCatalog: ConstructionProcessCatalogItem[];
  equipmentCatalog: MachineEquipmentCatalogItem[];
}

export interface CsvEnhancementTokens {
  processTokens: string[];
  equipmentTokens: string[];
  industryHintTokens: string[];
  processReasons: string[];
  equipmentReasons: string[];
}

interface RankedRow<T> {
  row: T;
  score: number;
}

const STOPWORDS = new Set([
  "work",
  "task",
  "site",
  "project",
  "process",
  "equipment",
  "machine",
  "etc",
  "line",
  "setup",
  "safety",
  "manual",
  "guideline",
  "checklist",
  "\uC791\uC5C5",
  "\uACF5\uC0AC",
  "\uACF5\uC815",
  "\uACF5\uC885",
  "\uC138\uBD80\uACF5\uC815",
  "\uAE30\uACC4",
  "\uC124\uBE44",
  "\uC7A5\uBE44",
  "\uD604\uC7A5",
  "\uAE30\uD0C0",
]);

const DEFAULT_LOADER: CsvCatalogLoader = {
  constructionCatalog: CONSTRUCTION_PROCESS_CATALOG,
  equipmentCatalog: MACHINE_EQUIPMENT_CATALOG,
};

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(text: string) {
  return normalizeText(text).replace(/\s+/g, "");
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function unique(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = item.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function expandTokens(values: string[]) {
  return values.flatMap((value) => tokenize(value));
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let v0 = new Int32Array(b.length + 1);
  let v1 = new Int32Array(b.length + 1);

  for (let i = 0; i <= b.length; i++) {
    v0[i] = i;
  }

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) {
      v0[j] = v1[j];
    }
  }

  return v0[b.length];
}

function isApproximateMatch(term: string, candidate: string) {
  if (!term || !candidate) {
    return false;
  }

  if (term === candidate) {
    return true;
  }

  if (term.length >= 3 && (candidate.includes(term) || term.includes(candidate))) {
    return true;
  }

  if (Math.abs(term.length - candidate.length) <= 1 && term.length >= 4) {
    return levenshteinDistance(term, candidate) <= 1;
  }

  return false;
}

function hasApproximateTokenMatch(term: string, candidates: string[]) {
  const compactTerm = compactText(term);
  for (const candidate of candidates) {
    if (isApproximateMatch(term, candidate)) {
      return true;
    }

    const compactCandidate = compactText(candidate);
    if (!compactTerm || !compactCandidate) {
      continue;
    }

    if (isApproximateMatch(compactTerm, compactCandidate)) {
      return true;
    }
  }

  return false;
}

function rankConstructionRows(queryTokens: string[], loader: CsvCatalogLoader) {
  const ranked: Array<RankedRow<ConstructionProcessCatalogItem>> = [];

  for (const row of loader.constructionCatalog) {
    const rowTokens = row.tokens.map((token) => normalizeText(token));
    let score = 0;

    for (const queryToken of queryTokens) {
      if (hasApproximateTokenMatch(queryToken, rowTokens)) {
        score += 1;
      }
    }

    if (score > 0) {
      ranked.push({ row, score });
    }
  }

  return ranked.sort((left, right) => right.score - left.score).slice(0, 4);
}

function rankEquipmentRows(queryTokens: string[], profile: CsvEnhancementProfile, loader: CsvCatalogLoader) {
  const industryTokens = tokenize(profile.industry);
  const ranked: Array<RankedRow<MachineEquipmentCatalogItem>> = [];

  for (const row of loader.equipmentCatalog) {
    const rowTokens = row.tokens.map((token) => normalizeText(token));
    const industryHints = [row.majorIndustry, row.middleIndustry, row.subIndustry]
      .flatMap((value) => tokenize(value));

    let score = 0;

    for (const queryToken of queryTokens) {
      if (hasApproximateTokenMatch(queryToken, rowTokens)) {
        score += 1;
      }
    }

    for (const industryToken of industryTokens) {
      if (hasApproximateTokenMatch(industryToken, industryHints)) {
        score += 2;
      }
    }

    if (score > 0) {
      ranked.push({ row, score });
    }
  }

  return ranked.sort((left, right) => right.score - left.score).slice(0, 6);
}

function buildQueryTokens(context: CsvEnhancementContext) {
  const hazardTokens = context.profile.hazards.flatMap((hazard) => tokenize(hazard.name));
  const equipmentTokens = context.profile.equipment.flatMap((item) => tokenize(item));

  return unique([
    ...tokenize(context.taskName),
    ...tokenize(context.profile.workLocation),
    ...equipmentTokens,
    ...hazardTokens,
  ]);
}

export function loadCsvCatalog(overrides?: Partial<CsvCatalogLoader>): CsvCatalogLoader {
  return {
    constructionCatalog: overrides?.constructionCatalog ?? DEFAULT_LOADER.constructionCatalog,
    equipmentCatalog: overrides?.equipmentCatalog ?? DEFAULT_LOADER.equipmentCatalog,
  };
}

export function buildCsvEnhancementTokens(
  context: CsvEnhancementContext,
  overrides?: Partial<CsvCatalogLoader>,
): CsvEnhancementTokens {
  const loader = loadCsvCatalog(overrides);
  const queryTokens = buildQueryTokens(context);

  if (queryTokens.length === 0) {
    return {
      processTokens: [],
      equipmentTokens: [],
      industryHintTokens: [],
      processReasons: [],
      equipmentReasons: [],
    };
  }

  const constructionRows = rankConstructionRows(queryTokens, loader);
  const equipmentRows = rankEquipmentRows(queryTokens, context.profile, loader);

  const processTokens = unique(
    constructionRows.flatMap(({ row }) => [
      ...expandTokens(row.tokens),
      ...tokenize(row.projectType),
      ...tokenize(row.tradeName),
      ...tokenize(row.detailProcess),
    ]),
  ).slice(0, 10);

  const equipmentTokens = unique(
    equipmentRows.flatMap(({ row }) => [
      ...expandTokens(row.tokens),
      ...tokenize(row.equipmentName),
      ...tokenize(row.equipmentNameEn),
    ]),
  ).slice(0, 10);

  const industryHintTokens = unique(
    equipmentRows.flatMap(({ row }) => [
      ...tokenize(row.majorIndustry),
      ...tokenize(row.middleIndustry),
      ...tokenize(row.subIndustry),
    ]),
  ).slice(0, 8);

  const processReasons = constructionRows
    .map(({ row }) => `${row.projectType}/${row.tradeName}/${row.detailProcess}`)
    .slice(0, 3);

  const equipmentReasons = equipmentRows
    .map(({ row }) => `${row.majorIndustry}/${row.equipmentName}`)
    .slice(0, 3);

  return {
    processTokens,
    equipmentTokens,
    industryHintTokens,
    processReasons,
    equipmentReasons,
  };
}

export function scoreTextAgainstTokens(text: string, tokens: string[]) {
  const textTokens = unique([
    ...tokenize(text),
    compactText(text),
  ]).filter(Boolean);
  const normalizedCandidates = unique(tokens.map((token) => normalizeText(token))).filter(Boolean);

  const matched: string[] = [];
  for (const token of normalizedCandidates) {
    if (textTokens.some((textToken) => hasApproximateTokenMatch(textToken, [token]))) {
      matched.push(token);
    }
  }

  return {
    matched: matched.slice(0, 5),
    score: matched.length,
  };
}
