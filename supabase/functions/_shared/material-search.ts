export interface MaterialCodeOption {
  code: string;
  label: string;
}

export interface MaterialHazardInput {
  name: string;
  type?: string;
  weight?: number;
}

export interface MaterialSearchProfile {
  industry: string;
  hazards: MaterialHazardInput[];
}

export type MaterialPriorityMode = "즉시교육" | "작업전 브리핑" | "참고자료";

export type MaterialIndustryScope = "profile" | "selected" | "all";
export type MaterialHazardScope = "auto_top3" | "selected" | "all";

export interface MaterialSearchFilters {
  keyword?: string;
  materialTypeCode?: string;
  industryCodeOverride?: string;
  hazardCodesOverride?: string[];
  priorityMode?: MaterialPriorityMode | string;
  industryScope?: MaterialIndustryScope | string;
  hazardScope?: MaterialHazardScope | string;
}

export interface MaterialQueryPlan {
  keyword: string;
  industryCodes: string[];
  hazardCodes: string[];
  materialTypeCode?: string;
  priorityMode: MaterialPriorityMode;
  industryScope: MaterialIndustryScope;
  hazardScope: MaterialHazardScope;
}

export interface MaterialListItem {
  id: string;
  type: string;
  title: string;
  url: string;
  language: string;
  relevance: number;
  recommendReason: string;
  selected: boolean;
  excluded: boolean;
}

const DEFAULT_INDUSTRY_CODE = "1";
const DEFAULT_HAZARD_CODE = "11000021";
const HASH_SEED = 5381;

export const DEFAULT_PRIORITY_MODE: MaterialPriorityMode = "즉시교육";

export const DEFAULT_INDUSTRY_SCOPE: MaterialIndustryScope = "profile";
export const DEFAULT_HAZARD_SCOPE: MaterialHazardScope = "auto_top3";

export const MATERIAL_PRIORITY_MODES: MaterialPriorityMode[] = [
  "즉시교육",
  "작업전 브리핑",
  "참고자료",
];

export const MATERIAL_TYPE_CODE_OPTIONS: MaterialCodeOption[] = [
  { code: "1", label: "책자" },
  { code: "12", label: "OPS" },
  { code: "6", label: "리플릿" },
  { code: "7", label: "교안(PPT)" },
  { code: "2", label: "동영상" },
  { code: "13", label: "스티커" },
  { code: "9", label: "포스터" },
  { code: "4", label: "팸플릿" },
  { code: "5", label: "애니메이션" },
  { code: "3", label: "전자출판" },
  { code: "14", label: "달력" },
  { code: "18", label: "VR" },
  { code: "21", label: "현수막" },
  { code: "22", label: "전자프로그램" },
  { code: "20", label: "광고" },
  { code: "25", label: "만화" },
  { code: "10", label: "기타" },
];

export const INDUSTRY_CODE_OPTIONS: MaterialCodeOption[] = [
  { code: "1", label: "공통업종" },
  { code: "2", label: "제조" },
  { code: "3", label: "건설" },
  { code: "4", label: "서비스" },
  { code: "6", label: "기타" },
];

export const HAZARD_CODE_OPTIONS: MaterialCodeOption[] = [
  { code: "11000001", label: "떨어짐" },
  { code: "11000007", label: "끼임" },
  { code: "11000004", label: "부딪힘" },
  { code: "11000003", label: "깔림·뒤집힘" },
  { code: "11000005", label: "물체에 맞음" },
  { code: "11000022", label: "교통사고" },
  { code: "11000006", label: "무너짐" },
  { code: "11000010", label: "폭발·파열" },
  { code: "11000009", label: "감전" },
  { code: "11000002", label: "넘어짐" },
  { code: "11000011", label: "화재" },
  { code: "11000014", label: "화학물질누출·접촉" },
  { code: "11000008", label: "절단·베임·찔림" },
  { code: "11000023", label: "직업병" },
  { code: "11000024", label: "진폐 등" },
  { code: "11000016", label: "빠짐·익사" },
  { code: "11000015", label: "산소결핍" },
  { code: "11000017", label: "사업장내 교통사고" },
  { code: "11000013", label: "이상온도 접촉" },
  { code: "11000012", label: "불균형 및 무리한 동작" },
  { code: "11000020", label: "동물상해" },
  { code: "11000018", label: "체육행사 등의 사고" },
  { code: "11000025", label: "작업관련질병(뇌심 등)" },
  { code: "11000019", label: "폭력행위" },
  { code: "11000021", label: "기타" },
  { code: "11000026", label: "분류불능" },
];

const MATERIAL_TYPE_LABEL_BY_CODE = toLabelMap(MATERIAL_TYPE_CODE_OPTIONS);
const INDUSTRY_LABEL_BY_CODE = toLabelMap(INDUSTRY_CODE_OPTIONS);
const HAZARD_LABEL_BY_CODE = toLabelMap(HAZARD_CODE_OPTIONS);
const MATERIAL_TYPE_CODE_SET = new Set(MATERIAL_TYPE_CODE_OPTIONS.map((item) => item.code));
const INDUSTRY_CODE_SET = new Set(INDUSTRY_CODE_OPTIONS.map((item) => item.code));
const HAZARD_CODE_SET = new Set(HAZARD_CODE_OPTIONS.map((item) => item.code));
const ALL_INDUSTRY_CODES = INDUSTRY_CODE_OPTIONS.map((item) => item.code);
const ALL_HAZARD_CODES = HAZARD_CODE_OPTIONS.map((item) => item.code);
const INDUSTRY_SCOPE_SET = new Set<MaterialIndustryScope>(["profile", "selected", "all"]);
const HAZARD_SCOPE_SET = new Set<MaterialHazardScope>(["auto_top3", "selected", "all"]);

const BRIEFING_PRIORITY_ORDER: Record<string, number> = {
  동영상: 1,
  OPS: 2,
  "교안(PPT)": 3,
  교안: 3,
  책자: 4,
  리플릿: 5,
  포스터: 6,
  팸플릿: 7,
  애니메이션: 8,
  전자출판: 9,
  스티커: 10,
  달력: 11,
  VR: 12,
  현수막: 13,
  전자프로그램: 14,
  광고: 15,
  만화: 16,
  기타: 17,
};

const INDUSTRY_KEYWORD_RULES: Array<{ code: string; keywords: string[] }> = [
  { code: "3", keywords: ["건설", "토목", "철거", "비계"] },
  { code: "2", keywords: ["제조", "생산", "가공", "공장", "화학"] },
  { code: "4", keywords: ["서비스", "물류", "운송", "창고"] },
  { code: "6", keywords: ["기타"] },
];

const HAZARD_KEYWORD_RULES: Array<{ code: string; keywords: string[] }> = [
  { code: "11000001", keywords: ["떨어짐", "추락", "낙하", "고소"] },
  { code: "11000002", keywords: ["넘어짐", "전도", "미끄러", "낙상"] },
  { code: "11000007", keywords: ["끼임", "협착", "말림"] },
  { code: "11000004", keywords: ["부딪힘", "충돌", "치임"] },
  { code: "11000003", keywords: ["깔림", "뒤집힘", "압착"] },
  { code: "11000005", keywords: ["맞음", "비래", "물체"] },
  { code: "11000022", keywords: ["교통사고", "도로"] },
  { code: "11000017", keywords: ["사업장내 교통사고", "지게차", "차량"] },
  { code: "11000006", keywords: ["무너짐", "붕괴", "매몰"] },
  { code: "11000010", keywords: ["폭발", "파열"] },
  { code: "11000011", keywords: ["화재", "발화"] },
  { code: "11000009", keywords: ["감전", "누전", "충전부"] },
  { code: "11000014", keywords: ["화학", "유해물질", "누출", "접촉"] },
  { code: "11000008", keywords: ["절단", "베임", "찔림"] },
  { code: "11000023", keywords: ["직업병"] },
  { code: "11000024", keywords: ["진폐"] },
  { code: "11000016", keywords: ["익사", "빠짐"] },
  { code: "11000015", keywords: ["산소결핍", "질식"] },
  { code: "11000013", keywords: ["이상온도", "고온", "저온"] },
  { code: "11000012", keywords: ["불균형", "무리한 동작", "근골격"] },
  { code: "11000020", keywords: ["동물상해"] },
  { code: "11000018", keywords: ["체육행사"] },
  { code: "11000025", keywords: ["작업관련질병"] },
  { code: "11000019", keywords: ["폭력행위"] },
  { code: "11000026", keywords: ["분류불능"] },
  { code: "11000021", keywords: ["기타"] },
];

function toLabelMap(options: MaterialCodeOption[]) {
  const map: Record<string, string> = {};
  for (const option of options) {
    map[option.code] = option.label;
  }
  return map;
}

function normalizeText(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase();
}

function compactText(value: string | undefined | null) {
  return normalizeText(value).replace(/\s+/g, "");
}

function tokenizeKeyword(keyword: string) {
  return normalizeText(keyword)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function unique(items: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isPriorityMode(value: string): value is MaterialPriorityMode {
  return MATERIAL_PRIORITY_MODES.includes(value as MaterialPriorityMode);
}

function normalizePriorityMode(value?: string) {
  const normalized = (value ?? "").trim();
  return isPriorityMode(normalized) ? normalized : DEFAULT_PRIORITY_MODE;
}

function normalizeIndustryScope(value?: string): MaterialIndustryScope {
  const normalized = (value ?? "").trim() as MaterialIndustryScope;
  return INDUSTRY_SCOPE_SET.has(normalized) ? normalized : DEFAULT_INDUSTRY_SCOPE;
}

function normalizeHazardScope(value?: string): MaterialHazardScope {
  const normalized = (value ?? "").trim() as MaterialHazardScope;
  return HAZARD_SCOPE_SET.has(normalized) ? normalized : DEFAULT_HAZARD_SCOPE;
}

function scoreTextMatch(source: string, keywordTokens: string[]) {
  const text = compactText(source);
  const matched: string[] = [];

  for (const token of keywordTokens) {
    const compactToken = compactText(token);
    if (!compactToken) continue;
    if (text.includes(compactToken)) {
      matched.push(token);
    }
  }

  return matched;
}

export function makeMaterialStableId(title: string, url: string) {
  const key = `${compactText(url)}|${compactText(title)}`;
  let hash = HASH_SEED;
  for (const char of key) {
    hash = ((hash << 5) + hash) + char.charCodeAt(0);
    hash |= 0;
  }
  const unsigned = hash >>> 0;
  return `material-${unsigned.toString(36)}`;
}

export function materialTypeLabelFromCode(code: string | undefined) {
  const normalized = (code ?? "").trim();
  return MATERIAL_TYPE_LABEL_BY_CODE[normalized] ?? "OPS";
}

export function industryLabelFromCode(code: string | undefined) {
  const normalized = (code ?? "").trim();
  return INDUSTRY_LABEL_BY_CODE[normalized] ?? INDUSTRY_LABEL_BY_CODE[DEFAULT_INDUSTRY_CODE];
}

export function hazardLabelFromCode(code: string | undefined) {
  const normalized = (code ?? "").trim();
  return HAZARD_LABEL_BY_CODE[normalized] ?? HAZARD_LABEL_BY_CODE[DEFAULT_HAZARD_CODE];
}

export function resolveIndustryCode(industry: string, override?: string) {
  const overrideCode = (override ?? "").trim();
  if (INDUSTRY_CODE_SET.has(overrideCode)) {
    return overrideCode;
  }

  const normalized = compactText(industry);
  for (const rule of INDUSTRY_KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(compactText(keyword)))) {
      return rule.code;
    }
  }

  return DEFAULT_INDUSTRY_CODE;
}

export function resolveIndustryCodes(
  industry: string,
  scope: MaterialIndustryScope,
  override?: string,
) {
  if (scope === "all") {
    return ALL_INDUSTRY_CODES;
  }

  if (scope === "selected") {
    const overrideCode = (override ?? "").trim();
    if (INDUSTRY_CODE_SET.has(overrideCode)) {
      return [overrideCode];
    }
  }

  return [resolveIndustryCode(industry, override)];
}

export function resolveHazardCode(text: string) {
  const normalized = compactText(text);
  if (!normalized) {
    return DEFAULT_HAZARD_CODE;
  }

  for (const rule of HAZARD_KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(compactText(keyword)))) {
      return rule.code;
    }
  }

  return DEFAULT_HAZARD_CODE;
}

export function resolveTopHazardCodes(hazards: MaterialHazardInput[], limit = 3) {
  const ranked = hazards
    .slice()
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    .slice(0, Math.max(1, limit));

  const hazardCodes = unique(
    ranked.map((hazard) => resolveHazardCode(`${hazard.type ?? ""} ${hazard.name}`.trim())),
  ).filter((code) => HAZARD_CODE_SET.has(code));

  if (hazardCodes.length === 0) {
    return [DEFAULT_HAZARD_CODE];
  }

  return hazardCodes.slice(0, Math.max(1, limit));
}

export function resolveMaterialQueryPlan(profile: MaterialSearchProfile, filters?: MaterialSearchFilters): MaterialQueryPlan {
  const keyword = (filters?.keyword ?? "").trim();
  const materialTypeCode = (filters?.materialTypeCode ?? "").trim();
  const industryScope = normalizeIndustryScope(filters?.industryScope);
  const hazardScope = normalizeHazardScope(filters?.hazardScope);

  const industryCodes = resolveIndustryCodes(profile.industry, industryScope, filters?.industryCodeOverride);
  const overrideHazardCodes = unique((filters?.hazardCodesOverride ?? []).map((code) => code.trim()))
    .filter((code) => HAZARD_CODE_SET.has(code))
    .slice(0, 3);
  const hazardCodes = hazardScope === "all"
    ? ALL_HAZARD_CODES
    : overrideHazardCodes.length > 0
      ? overrideHazardCodes
      : resolveTopHazardCodes(profile.hazards, 3);

  return {
    keyword,
    industryCodes,
    hazardCodes,
    materialTypeCode: MATERIAL_TYPE_CODE_SET.has(materialTypeCode) ? materialTypeCode : undefined,
    priorityMode: normalizePriorityMode(filters?.priorityMode),
    industryScope,
    hazardScope,
  };
}

export function dedupeMaterialsByUrlTitle<T extends MaterialListItem>(items: T[]) {
  const deduped = new Map<string, T>();
  for (const item of items) {
    const key = `${compactText(item.url)}|${compactText(item.title)}`;
    const prev = deduped.get(key);
    if (!prev || prev.relevance < item.relevance) {
      deduped.set(key, item);
    }
  }
  return [...deduped.values()];
}

export function applyKeywordPostFilter<T extends MaterialListItem>(items: T[], keyword: string) {
  const keywordTokens = tokenizeKeyword(keyword);
  if (keywordTokens.length === 0) {
    return items;
  }

  const filtered = items
    .map((item) => {
      const titleMatched = scoreTextMatch(item.title, keywordTokens);
      const reasonMatched = scoreTextMatch(item.recommendReason, keywordTokens);
      const matched = unique([...titleMatched, ...reasonMatched]);
      if (matched.length === 0) {
        return null;
      }

      const bonus = clamp(titleMatched.length * 8 + reasonMatched.length * 4, 0, 20);
      const relevance = clamp(item.relevance + bonus, 0, 100);

      return {
        ...item,
        relevance,
        recommendReason: `${item.recommendReason} | 검색어 일치(${matched.slice(0, 4).join(", ")})`,
      };
    })
    .filter((item): item is T => Boolean(item));

  return filtered;
}

export function sortMaterialsByPriority<T extends MaterialListItem>(items: T[], mode: MaterialPriorityMode) {
  if (mode === "참고자료") {
    return items.slice().sort((left, right) => left.title.localeCompare(right.title, "ko"));
  }

  if (mode === "작업전 브리핑") {
    return items.slice().sort((left, right) => {
      const leftOrder = BRIEFING_PRIORITY_ORDER[left.type] ?? 99;
      const rightOrder = BRIEFING_PRIORITY_ORDER[right.type] ?? 99;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return right.relevance - left.relevance;
    });
  }

  return items.slice().sort((left, right) => right.relevance - left.relevance);
}
